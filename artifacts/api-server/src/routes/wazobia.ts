import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  ChatWithWazobiaBody,
  ChatWithWazobiaResponse,
  GetWazobiaLanguageResponse,
  SetWazobiaLanguageBody,
  SetWazobiaLanguageResponse,
} from "@workspace/api-zod";
import { db, conversationsTable, messagesTable, wazobiaPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastDm } from "../sse-manager";
import {
  ensureWazobiaConversation,
  getRecentWazobiaHistory,
  getWazobiaLanguage,
  WAZOBIA_BOT_ID,
  WAZOBIA_BOT_NAME,
  WAZOBIA_LANGUAGES,
} from "../lib/wazobia";

const router: IRouter = Router();
const CHAT_RATE_LIMIT = 10;
const CHAT_RATE_WINDOW_MS = 60_000;
const CHAT_RATE_MAP_MAX_ENTRIES = 20_000;
const chatRateLimits = new Map<string, { windowStartedAt: number; count: number }>();
let nextChatRateCleanupAt = 0;

type ChatRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; capacityExceeded?: false }
  | { allowed: false; capacityExceeded: true };

function consumeChatRateLimit(userId: string, now = Date.now()): ChatRateLimitResult {
  if (now >= nextChatRateCleanupAt || chatRateLimits.size >= CHAT_RATE_MAP_MAX_ENTRIES) {
    for (const [accountId, entry] of chatRateLimits) {
      if (now - entry.windowStartedAt >= CHAT_RATE_WINDOW_MS) {
        chatRateLimits.delete(accountId);
      }
    }
    nextChatRateCleanupAt = now + CHAT_RATE_WINDOW_MS;
  }

  const current = chatRateLimits.get(userId);
  if (current && now - current.windowStartedAt < CHAT_RATE_WINDOW_MS) {
    if (current.count >= CHAT_RATE_LIMIT) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.windowStartedAt + CHAT_RATE_WINDOW_MS - now) / 1000),
        ),
      };
    }
    current.count += 1;
    return { allowed: true };
  }

  if (!current && chatRateLimits.size >= CHAT_RATE_MAP_MAX_ENTRIES) {
    return { allowed: false, capacityExceeded: true };
  }
  chatRateLimits.set(userId, { windowStartedAt: now, count: 1 });
  return { allowed: true };
}

const SYSTEM_PROMPT =
  "You are WAZOBIA, the friendly campus AI assistant for CampusX at Lagos State University (LASU Ojo). You help students understand features like Shuttle Radar, Amebo Hot anonymous feed, Flash Deals, and the CGPA Target Calculator. Reply helpful, concise, and in a warm tone strictly in the language currently selected by the user (English, Nigerian Pidgin, Yoruba, Hausa, or Igbo). Keep responses in clean plain text or light markdown format.";
const LANGUAGE_INSTRUCTIONS = {
  english: "English",
  pidgin: "Nigerian Pidgin",
  yoruba: "Yoruba",
  hausa: "Hausa",
  igbo: "Igbo",
} as const;

type HistoryItem = { senderId: string; content: string };

function buildLanguageInstruction(language: keyof typeof LANGUAGE_INSTRUCTIONS): string {
  return `${SYSTEM_PROMPT}\n\nCurrent response language: ${LANGUAGE_INSTRUCTIONS[language]}. Respond strictly in ${LANGUAGE_INSTRUCTIONS[language]}.`;
}

async function generateReply(
  language: keyof typeof LANGUAGE_INSTRUCTIONS,
  history: HistoryItem[],
  content: string,
): Promise<string> {
  const systemInstruction = buildLanguageInstruction(language);
  const messages = [...history, { senderId: "", content }];
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    throw Object.assign(new Error("WAZOBIA AI is unavailable: configure GEMINI_API_KEY or OPENAI_API_KEY on the server."), {
      statusCode: 503,
    });
  }

  const response = process.env.GEMINI_API_KEY
    ? await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: messages.map((message) => ({
            role: message.senderId === WAZOBIA_BOT_ID ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: 800 },
        }),
      },
    )
    : await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          ...messages.map((message) => ({
            role: message.senderId === WAZOBIA_BOT_ID ? "assistant" : "user",
            content: message.content,
          })),
        ],
        max_tokens: 800,
      }),
    });

  if (!response.ok) {
    throw Object.assign(new Error(`WAZOBIA AI provider returned HTTP ${response.status}.`), {
      statusCode: 502,
    });
  }
  const data = await response.json() as any;
  const reply = process.env.GEMINI_API_KEY
    ? data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim()
    : data?.choices?.[0]?.message?.content?.trim();
  if (typeof reply !== "string" || !reply) {
    throw Object.assign(new Error("WAZOBIA AI provider returned an empty response."), { statusCode: 502 });
  }
  return reply;
}

router.get("/wazobia/language", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  res.set("Cache-Control", "private, no-store");
  res.json(GetWazobiaLanguageResponse.parse({ language: await getWazobiaLanguage(userId) }));
});

router.put("/wazobia/language", requireAuth, async (req, res): Promise<void> => {
  const parsed = SetWazobiaLanguageBody.safeParse(req.body);
  if (!parsed.success || !WAZOBIA_LANGUAGES.includes(parsed.data.language as (typeof WAZOBIA_LANGUAGES)[number])) {
    res.status(400).json({ error: "language must be one of english, pidgin, yoruba, hausa, or igbo." });
    return;
  }
  const userId = (req as any).userId as string;
  const language = parsed.data.language;
  await db.insert(wazobiaPreferencesTable).values({ clerkUserId: userId, language })
    .onConflictDoUpdate({
      target: wazobiaPreferencesTable.clerkUserId,
      set: { language, updatedAt: new Date() },
    });
  res.set("Cache-Control", "private, no-store");
  res.json(SetWazobiaLanguageResponse.parse({ language }));
});

router.post("/wazobia/chat", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const rateLimit = consumeChatRateLimit(userId);
  if (!rateLimit.allowed) {
    if (rateLimit.capacityExceeded) {
      res.status(503).json({ error: "WAZOBIA chat is temporarily busy. Please try again shortly." });
      return;
    }
    res.set("Retry-After", String(rateLimit.retryAfterSeconds));
    res.status(429).json({ error: "WAZOBIA chat rate limit exceeded. Try again shortly." });
    return;
  }

  const parsed = ChatWithWazobiaBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.content.trim() || parsed.data.content.length > 2000) {
    res.status(400).json({ error: "content is required and must be at most 2000 characters." });
    return;
  }
  const language = await getWazobiaLanguage(userId);
  const conversationId = await ensureWazobiaConversation(userId);
  const history = (await getRecentWazobiaHistory(conversationId))
    .filter((message) => message.content !== "[[WAZOBIA_WELCOME_V1]]")
    .reverse()
    .slice(-12);

  let text: string;
  try {
    text = await generateReply(language, history, parsed.data.content.trim());
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 502;
    req.log.error({ conversationId }, "WAZOBIA AI provider request failed");
    res.status(statusCode).json({
      error: statusCode === 503
        ? "WAZOBIA AI is unavailable: configure GEMINI_API_KEY or OPENAI_API_KEY on the server."
        : "WAZOBIA could not respond right now. Please try again.",
    });
    return;
  }

  const now = new Date();
  const [savedUserMessage, savedReply] = await db.transaction(async (tx) => {
    const [userMessage] = await tx.insert(messagesTable).values({
      conversationId,
      senderId: userId,
      content: parsed.data.content.trim(),
    }).returning();
    const [botReply] = await tx.insert(messagesTable).values({
      conversationId,
      senderId: WAZOBIA_BOT_ID,
      content: text,
      isRead: false,
    }).returning();
    await tx.update(conversationsTable).set({ lastMessageAt: now })
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.participant1Id, userId)));
    return [userMessage, botReply] as const;
  });

  broadcastDm(userId, {
    conversationId,
    senderId: userId,
    senderName: "You",
    content: savedUserMessage.content,
  });
  broadcastDm(userId, {
    conversationId,
    senderId: WAZOBIA_BOT_ID,
    senderName: WAZOBIA_BOT_NAME,
    content: savedReply.content,
  });

  res.json(ChatWithWazobiaResponse.parse({
    conversationId,
    reply: {
      id: savedReply.id,
      conversationId: savedReply.conversationId,
      senderId: savedReply.senderId,
      content: savedReply.content,
      isRead: savedReply.isRead,
      createdAt: savedReply.createdAt.toISOString(),
    },
  }));
});

export default router;
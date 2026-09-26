import { Router, type IRouter } from "express";
import { eq, or, and, desc, sql } from "drizzle-orm";
import { db, conversationsTable, messagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastDm } from "../sse-manager";
import { createNotification } from "../lib/notifications";
import {
  ensureWazobiaConversation,
  getWazobiaLanguage,
  isWazobiaConversation,
  renderWazobiaMessage,
  WAZOBIA_BOT_ID,
  WAZOBIA_BOT_NAME,
} from "../lib/wazobia";

const router: IRouter = Router();

router.get("/messages/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const [account] = await db.select({ role: usersTable.role }).from(usersTable)
    .where(eq(usersTable.clerkUserId, userId)).limit(1);
  if (account?.role === "student") {
    await ensureWazobiaConversation(userId);
  }
  const language = await getWazobiaLanguage(userId);

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participant1Id, userId),
        eq(conversationsTable.participant2Id, userId)
      )
    )
    .orderBy(desc(conversationsTable.lastMessageAt));

  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const otherUserId = conv.participant1Id === userId ? conv.participant2Id : conv.participant1Id;

      const [otherUser] = otherUserId === WAZOBIA_BOT_ID
        ? [{ fullName: WAZOBIA_BOT_NAME, avatarUrl: null }]
        : await db
          .select({ fullName: usersTable.fullName, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, otherUserId));

      const [lastMsg] = await db
        .select({ content: messagesTable.content, senderId: messagesTable.senderId })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);

      const [{ unreadCount }] = await db
        .select({ unreadCount: sql<number>`count(*)::int` })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, conv.id),
            eq(messagesTable.isRead, false),
            eq(messagesTable.senderId, otherUserId)
          )
        );

      return {
        id: conv.id,
        otherUserId,
        otherUserName: otherUser?.fullName ?? "Unknown",
        otherUserAvatarUrl: otherUser?.avatarUrl ?? null,
        lastMessage: lastMsg
          ? otherUserId === WAZOBIA_BOT_ID
            ? lastMsg.senderId === WAZOBIA_BOT_ID
              ? renderWazobiaMessage(lastMsg.content, language)
              : lastMsg.content
            : lastMsg.content
          : null,
        lastMessageAt: conv.lastMessageAt.toISOString(),
        unreadCount: unreadCount ?? 0,
      };
    })
  );

  res.json({ conversations: enriched });
});

router.post("/messages/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { targetUserId } = req.body;

  if (!targetUserId || typeof targetUserId !== "string") {
    res.status(400).json({ error: "targetUserId is required" });
    return;
  }

  if (targetUserId === WAZOBIA_BOT_ID) {
    const conversationId = await ensureWazobiaConversation(userId);
    const [conversation] = await db.select({ createdAt: conversationsTable.createdAt })
      .from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
    res.json({
      id: conversationId,
      otherUserId: WAZOBIA_BOT_ID,
      otherUserName: WAZOBIA_BOT_NAME,
      otherUserAvatarUrl: null,
      createdAt: (conversation?.createdAt ?? new Date()).toISOString(),
    });
    return;
  }
  if (targetUserId.startsWith("system:")) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (targetUserId === userId) {
    res.status(400).json({ error: "Cannot message yourself" });
    return;
  }

  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        and(
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, targetUserId)
        ),
        and(
          eq(conversationsTable.participant1Id, targetUserId),
          eq(conversationsTable.participant2Id, userId)
        )
      )
    )
    .limit(1);

  let conv = existing;
  if (!conv) {
    const [inserted] = await db
      .insert(conversationsTable)
      .values({ participant1Id: userId, participant2Id: targetUserId })
      .returning();
    conv = inserted;
  }

  const [otherUser] = await db
    .select({ fullName: usersTable.fullName, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, targetUserId));

  if (!otherUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: conv.id,
    otherUserId: targetUserId,
    otherUserName: otherUser?.fullName ?? "Unknown",
    otherUserAvatarUrl: otherUser?.avatarUrl ?? null,
    createdAt: conv.createdAt.toISOString(),
  });
});

router.get("/messages/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const conversationId = parseInt(req.params.conversationId as string, 10);

  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (conv.participant1Id !== userId && conv.participant2Id !== userId) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  if (isWazobiaConversation(conv.participant1Id, conv.participant2Id)) {
    const language = await getWazobiaLanguage(userId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(limit)
      .offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(messagesTable).where(eq(messagesTable.conversationId, conversationId));
    await db.update(messagesTable).set({ isRead: true }).where(and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.isRead, false),
    ));
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        content: m.senderId === WAZOBIA_BOT_ID
          ? renderWazobiaMessage(m.content, language)
          : m.content,
        isRead: true,
        createdAt: m.createdAt.toISOString(),
      })),
      total: total ?? 0,
    });
    return;
  }

  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId));

  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.isRead, false)
      )
    );

  const mapped = messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    isRead: m.isRead,
    createdAt: m.createdAt.toISOString(),
  }));

  res.json({ messages: mapped, total: total ?? 0 });
});

router.post("/messages/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const conversationId = parseInt(req.params.conversationId as string, 10);

  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conv.participant1Id !== userId && conv.participant2Id !== userId) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }

  const { content } = req.body;
  if (req.body?.senderId !== undefined && req.body.senderId !== userId) {
    res.status(403).json({ error: "Sender identity is determined by your authenticated account." });
    return;
  }
  if (isWazobiaConversation(conv.participant1Id, conv.participant2Id)) {
    res.status(403).json({ error: "Use /api/wazobia/chat to message WAZOBIA." });
    return;
  }
  if (!content || typeof content !== "string" || !content.trim() || content.trim().length > 2000) {
    res.status(400).json({ error: "Content is required and must be at most 2000 characters." });
    return;
  }

  const [inserted] = await db
    .insert(messagesTable)
    .values({ conversationId, senderId: userId, content: content.trim() })
    .returning();

  await db
    .update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  // Push real-time DM event to the recipient via SSE
  const recipientId = conv.participant1Id === userId ? conv.participant2Id : conv.participant1Id;
  let senderName = "Someone";
  try {
    const [sender] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId));
    senderName = sender?.fullName ?? senderName;
  } catch {
    // Name lookup is best-effort; message delivery must still complete.
  }

  await createNotification({
    userId: recipientId,
    actorId: userId,
    actorName: senderName,
    type: "message",
    content: `${senderName} sent you a message.`,
    targetType: "conversation",
    targetId: conversationId,
  }).catch((error) => {
    req.log.error(
      { err: error, conversationId, recipientId, senderId: userId },
      "Failed to create direct-message notification",
    );
  });

  try {
    broadcastDm(recipientId, {
      conversationId,
      senderId: userId,
      senderName,
      content: content.trim(),
    });
  } catch {
    // non-fatal — SSE best-effort
  }

  res.status(201).json({
    id: inserted.id,
    conversationId: inserted.conversationId,
    senderId: inserted.senderId,
    content: inserted.content,
    isRead: inserted.isRead,
    createdAt: inserted.createdAt.toISOString(),
  });
});

export default router;

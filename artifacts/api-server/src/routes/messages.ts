import { Router, type IRouter } from "express";
import { eq, or, and, desc, sql } from "drizzle-orm";
import { db, conversationsTable, messagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastDm } from "../sse-manager";

const router: IRouter = Router();

router.get("/messages/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

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

      const [otherUser] = await db
        .select({ fullName: usersTable.fullName, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, otherUserId));

      const [lastMsg] = await db
        .select({ content: messagesTable.content })
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
        lastMessage: lastMsg?.content ?? null,
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
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Content is required" });
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
  try {
    const [sender] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId));
    broadcastDm(recipientId, {
      conversationId,
      senderId: userId,
      senderName: sender?.fullName ?? "Someone",
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

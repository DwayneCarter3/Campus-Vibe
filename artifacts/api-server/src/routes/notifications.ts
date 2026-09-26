import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/auth";
import { addClient, removeClient } from "../sse-manager";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);
  const notifications = rows.map((notification) => ({
    ...notification,
    // Older notifications predate content; preserve their original message as content.
    content: notification.content || notification.message,
  }));

  const [{ unreadCount }] = await db
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.json({ notifications, unreadCount });
});

router.patch("/notifications/read", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.sendStatus(204);
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.notificationId)
    ? req.params.notificationId[0]
    : req.params.notificationId;
  const notificationId = Number(raw);

  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)))
    .returning({ id: notificationsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/notifications/stream", (req: Request, res: Response): void => {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`: connected\n\n`);

  addClient(userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
});

export default router;

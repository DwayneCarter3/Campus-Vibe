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

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

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

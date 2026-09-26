import { db, notificationsTable } from "@workspace/db";
import { broadcastNotification } from "../sse-manager";

type CreateNotificationInput = {
  userId: string;
  actorId?: string;
  actorName?: string | null;
  type: string;
  content: string;
  targetType?: string;
  targetId?: string | number;
};

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: input.userId,
      type: input.type,
      actorName: input.actorName ?? null,
      content: input.content,
      message: input.content,
      targetType: input.targetType ?? null,
      targetId: input.targetId == null ? null : String(input.targetId),
    })
    .returning();

  broadcastNotification(input.userId, notification);
}
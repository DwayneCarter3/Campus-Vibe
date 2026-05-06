import type { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function removeClient(userId: string, res: Response): void {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
}

export function broadcastNotification(userId: string, notification: object): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  userClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      // client disconnected; cleanup handled on close event
    }
  });
}

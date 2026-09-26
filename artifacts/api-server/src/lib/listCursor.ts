import { createHash } from "crypto";

export type FeedCursor = {
  featured: boolean;
  pinned: boolean;
  createdAt: string;
  id: number;
};

type CursorEnvelope = {
  v: 1;
  filterHash: string;
  featured: boolean;
  pinned: boolean;
  createdAt: string;
  id: number;
};

export function cursorFilterHash(filters: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

export function encodeFeedCursor(cursor: FeedCursor, filterHash: string): string {
  const payload: CursorEnvelope = { v: 1, filterHash, ...cursor };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeFeedCursor(token: string, filterHash: string): FeedCursor | null {
  if (!token || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== token) return null;
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const cursor = value as Partial<CursorEnvelope>;
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "createdAt,featured,filterHash,id,pinned,v") return null;
    if (
      cursor.v !== 1 ||
      cursor.filterHash !== filterHash ||
      typeof cursor.featured !== "boolean" ||
      typeof cursor.pinned !== "boolean" ||
      typeof cursor.createdAt !== "string" ||
      !Number.isSafeInteger(cursor.id) ||
      (cursor.id ?? 0) <= 0
    ) return null;
    const dateMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/.exec(cursor.createdAt);
    if (!dateMatch) return null;
    const date = new Date(`${dateMatch[1]}.${dateMatch[2].slice(0, 3)}Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== `${dateMatch[1]}.${dateMatch[2].slice(0, 3)}Z`
    ) return null;

    return {
      featured: cursor.featured,
      pinned: cursor.pinned,
      createdAt: cursor.createdAt,
      id: cursor.id!,
    };
  } catch {
    return null;
  }
}
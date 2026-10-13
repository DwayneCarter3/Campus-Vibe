import { type IdentityRequest } from "./auth-identity";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const DEFAULT_CEO_EMAIL = "dwaynecartergabriel@gmail.com";
export const CEO_EMAIL = (process.env.CEO_EMAIL ?? DEFAULT_CEO_EMAIL).trim().toLowerCase();

type PrivilegeRequest = Request & { userId?: string };
const verifiedCEOEmailCache = new WeakMap<Request, Promise<boolean>>();

function requestUserId(req: PrivilegeRequest): string | null {
  return typeof req.userId === "string" && req.userId.length > 0 ? req.userId : null;
}

/** Requires the current verified Supabase identity and a DB-enforced owner role. */
export function isVerifiedCEO(req: Request): Promise<boolean> {
  const cached = verifiedCEOEmailCache.get(req);
  if (cached) return cached;

  const check = (async (): Promise<boolean> => {
    const userId = requestUserId(req as PrivilegeRequest);
    if (!userId || !CEO_EMAIL) return false;
    try {
      const identity = (req as IdentityRequest).supabaseUser;
      if (!identity?.email_confirmed_at) return false;
      const [profile] = await db.select({ role: usersTable.role }).from(usersTable)
        .where(eq(usersTable.supabaseUserId, identity.id)).limit(1);
      return profile?.role === "ceo";
    } catch {
      // Identity/database failures must never grant CEO privileges.
      return false;
    }
  })();
  verifiedCEOEmailCache.set(req, check);
  return check;
}

/** DB admins use their current role; CEO authority also requires a verified session. */
export async function hasAdminPrivileges(req: Request): Promise<boolean> {
  const userId = requestUserId(req as PrivilegeRequest);
  if (!userId) return false;
  try {
    const [caller] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    if (caller?.role === "admin") return true;
  } catch {
    return false;
  }
  return isVerifiedCEO(req);
}
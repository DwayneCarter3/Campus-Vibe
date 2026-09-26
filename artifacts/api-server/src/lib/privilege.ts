import { clerkClient } from "@clerk/express";
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

/** Fetches Clerk's current user record; the database email is never an authority. */
export function isVerifiedCEO(req: Request): Promise<boolean> {
  const cached = verifiedCEOEmailCache.get(req);
  if (cached) return cached;

  const check = (async (): Promise<boolean> => {
    const userId = requestUserId(req as PrivilegeRequest);
    if (!userId || !CEO_EMAIL) return false;
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const primary = clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId,
      );
      return primary?.verification?.status === "verified"
        && primary.emailAddress.trim().toLowerCase() === CEO_EMAIL;
    } catch {
      // Clerk failures must never grant CEO privileges.
      return false;
    }
  })();
  verifiedCEOEmailCache.set(req, check);
  return check;
}

/** DB admins are authorized by their current role; CEOs by fresh verified Clerk identity. */
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
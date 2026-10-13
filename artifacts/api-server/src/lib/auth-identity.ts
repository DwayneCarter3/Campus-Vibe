import type { Request } from "express";
import type { User } from "@supabase/supabase-js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { adminAuth } from "./supabase-auth";

export type IdentityRequest = Request & { userId?: string; supabaseUser?: User; accessToken?: string };
export function getAuth(req: Request) {
  return { userId: (req as IdentityRequest).userId ?? null };
}
export async function getVerifiedPrimaryEmail(userId: string): Promise<string | null> {
  const [profile] = await db.select({ id: usersTable.supabaseUserId }).from(usersTable)
    .where(eq(usersTable.clerkUserId, userId)).limit(1);
  if (!profile?.id) return null;
  const { data, error } = await adminAuth().auth.admin.getUserById(profile.id);
  if (error) throw new Error("Identity provider unavailable.");
  return data.user?.email_confirmed_at ? data.user.email?.trim().toLowerCase() ?? null : null;
}

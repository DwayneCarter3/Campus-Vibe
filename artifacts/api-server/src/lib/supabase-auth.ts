import { createClient, type User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

function client(key: string) {
  if (!process.env.SUPABASE_URL || !key) throw new Error("Supabase authentication is not configured.");
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export const publicAuth = () => client(process.env.SUPABASE_ANON_KEY ?? "");
export const adminAuth = () => client(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function reconcileSupabaseProfile(identity: User) {
  if (!identity.email_confirmed_at || !identity.email) throw new Error("Verified email required.");
  let [profile] = await db.select().from(usersTable)
    .where(eq(usersTable.supabaseUserId, identity.id)).limit(1);
  if (!profile) throw new Error("Authentication profile is missing; do not create a second identity.");
  // UPDATE always executes the database identity trigger. Neither JWT metadata nor
  // submitted role flags authorize this operation; the trigger reads auth.users.
  [profile] = await db.update(usersTable).set({
    email: normalizeEmail(identity.email), role: profile.role,
  }).where(eq(usersTable.supabaseUserId, identity.id)).returning();
  return profile;
}

export function authUser(profile: typeof usersTable.$inferSelect, identity: User) {
  return {
    id: profile.clerkUserId, authId: identity.id, email: profile.email,
    fullName: profile.fullName, firstName: profile.fullName.split(" ")[0] || "",
    username: profile.username, imageUrl: profile.avatarUrl ?? "",
    role: profile.role === "ceo" ? "CEO" : profile.role,
    primaryEmailAddress: { emailAddress: profile.email },
    emailAddresses: [{ emailAddress: profile.email }],
  };
}

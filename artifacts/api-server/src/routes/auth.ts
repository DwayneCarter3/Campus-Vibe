import { Router, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminAuth, authUser, normalizeEmail, publicAuth, reconcileSupabaseProfile } from "../lib/supabase-auth";
import { requireAuth } from "../middlewares/auth";
import type { IdentityRequest } from "../lib/auth-identity";
import type { Session } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const router = Router();
const email = z.string().trim().email().max(254).transform(normalizeEmail);
const loginBody = z.object({ email, password: z.string().min(1).max(128) });
const signupBody = loginBody.extend({ password: z.string().min(8).max(128), fullName: z.string().trim().min(1).max(150) });
const sameOrigin = (req: Request, res: Response, next: () => void) => {
  const origin = req.get("origin");
  const requestOrigin = `${req.get("x-forwarded-proto")?.split(",")[0] || req.protocol}://${req.get("host")}`;
  const allowed = [requestOrigin, process.env.APP_URL,
    process.env.REPLIT_DEV_DOMAIN && `https://${process.env.REPLIT_DEV_DOMAIN}`,
    process.env.REPLIT_EXPO_DEV_DOMAIN && `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`];
  if (origin && !allowed.includes(origin)) {
    res.status(403).json({ error: "Cross-origin authentication request rejected." }); return;
  }
  next();
};
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `${ipKeyGenerator(req.ip ?? "unknown")}:${createHash("sha256").update(String(req.body?.email ?? "").trim().toLowerCase()).digest("hex")}`,
  message: { error: "Too many authentication attempts. Please try again later." },
  // Use the trusted platform peer, not caller-controlled forwarding headers.
  validate: { xForwardedForHeader: false },
});
router.use("/auth", sameOrigin);
router.use(["/auth/signup", "/auth/login", "/auth/reset-password", "/auth/update-password"], limiter);
function cookies(res: Response, session: Session) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "lax" as const, path: "/api" };
  res.cookie("campusx_access", session.access_token, { ...options, maxAge: session.expires_in * 1000 });
  res.cookie("campusx_refresh", session.refresh_token, { ...options, maxAge: 30 * 24 * 3600 * 1000 });
}
async function sessionResponse(res: Response, session: Session) {
  const identity = await publicAuth().auth.getUser(session.access_token);
  if (identity.error || !identity.data.user) throw new Error("Invalid session.");
  const profile = await reconcileSupabaseProfile(identity.data.user);
  // Force a new token after reconciliation so trusted app_metadata reflects DB role.
  const refreshed = await publicAuth().auth.refreshSession({ refresh_token: session.refresh_token });
  if (refreshed.error || !refreshed.data.session) throw new Error("Session refresh failed.");
  cookies(res, refreshed.data.session);
  res.set("Cache-Control", "no-store").json({
    user: authUser(profile, identity.data.user),
    session: { access_token: refreshed.data.session.access_token, refresh_token: refreshed.data.session.refresh_token,
      expires_at: refreshed.data.session.expires_at },
    needsOnboarding: !profile.onboarded,
  });
}
router.post("/auth/signup", async (req, res) => {
  const parsed = signupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email, name and password of at least 8 characters." }); return; }
  const { email: address, password, fullName } = parsed.data;
  const existing = await db.execute(sql`SELECT 1 FROM auth.users WHERE lower(btrim(email)) = ${address} AND deleted_at IS NULL LIMIT 1`);
  if (existing.rows.length) { res.status(400).json({ error: "Account already exists. Please log in." }); return; }
  const { data, error } = await publicAuth().auth.signUp({
    email: address, password, options: { data: { fullName }, emailRedirectTo: `${process.env.APP_URL}/sign-in` },
  });
  if (error || !data.user || data.user.identities?.length === 0) {
    if (error?.code === "user_already_exists" || data.user?.identities?.length === 0) {
      res.status(400).json({ error: "Account already exists. Please log in." }); return;
    }
    res.status(error?.status === 429 ? 429 : 400).json({ error: error?.message ?? "Could not create your account." }); return;
  }
  res.status(201).json({ message: "Check your email to confirm your account, then log in.", confirmationRequired: true });
});
router.post("/auth/login", async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ bodyType: typeof req.body, fields: Object.keys(req.body ?? {}),
      issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, "Invalid login request");
    res.status(400).json({ error: "Enter your email and password." }); return;
  }
  // GoTrue validates the persistent auth.users password hash; no app-local passwords.
  const { data, error } = await publicAuth().auth.signInWithPassword(parsed.data);
  if (error || !data.session) {
    if (error && (!error.status || error.status >= 500)) {
      res.status(503).json({ error: "Authentication is temporarily unavailable. Please try again." }); return;
    }
    res.status(401).json({ error: error?.code === "email_not_confirmed" ? "Please confirm your email before logging in." : "Invalid email or password." }); return;
  }
  await sessionResponse(res, data.session);
});
router.get("/auth/me", requireAuth, async (req, res) => {
  const identity = (req as IdentityRequest).supabaseUser;
  if (!identity) { res.status(401).json({ error: "Unauthorized" }); return; }
  const profile = await reconcileSupabaseProfile(identity);
  res.set("Cache-Control", "no-store").json({ user: authUser(profile, identity), needsOnboarding: !profile.onboarded });
});
router.post("/auth/refresh", async (req, res) => {
  const token = req.body?.refresh_token ?? req.cookies?.campusx_refresh;
  if (typeof token !== "string") { res.status(401).json({ error: "Session expired. Please log in." }); return; }
  const { data, error } = await publicAuth().auth.refreshSession({ refresh_token: token });
  if (error || !data.session) { res.status(401).json({ error: "Session expired. Please log in." }); return; }
  await sessionResponse(res, data.session);
});
router.post("/auth/logout", async (req, res) => {
  const token = (req as IdentityRequest).accessToken ?? req.body?.access_token;
  if (typeof token === "string") await adminAuth().auth.admin.signOut(token, "local");
  res.clearCookie("campusx_access", { path: "/api" }); res.clearCookie("campusx_refresh", { path: "/api" });
  res.json({ ok: true });
});
router.post("/auth/reset-password", async (req, res) => {
  const parsed = email.safeParse(req.body?.email);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email." }); return; }
  const reset = await publicAuth().auth.resetPasswordForEmail(parsed.data, { redirectTo: `${process.env.APP_URL}/reset-password` });
  if (reset.error) {
    logger.warn({ code: reset.error.code }, "Password recovery provider rejected request");
    res.status(503).json({ error: "Password recovery is temporarily unavailable. Please try again." }); return;
  }
  res.json({ message: "If an account exists, a password reset email will be sent." });
});
router.post("/auth/update-password", async (req, res) => {
  const parsed = z.string().min(8).max(128).safeParse(req.body?.password);
  const token = req.body?.access_token ?? (req as IdentityRequest).accessToken;
  if (!parsed.success || typeof token !== "string") { res.status(400).json({ error: "A valid recovery session and password of at least 8 characters are required." }); return; }
  const auth = publicAuth();
  const identity = await auth.auth.getUser(token);
  if (identity.error || !identity.data.user) { res.status(401).json({ error: "This recovery link has expired." }); return; }
  const refresh = req.body?.refresh_token ?? req.cookies?.campusx_refresh;
  if (typeof refresh !== "string") { res.status(400).json({ error: "The recovery refresh token is required." }); return; }
  const established = await auth.auth.setSession({ access_token: token, refresh_token: refresh });
  if (established.error) { res.status(401).json({ error: "This recovery link has expired." }); return; }
  const result = await auth.auth.updateUser({ password: parsed.data });
  if (result.error) { res.status(400).json({ error: "Could not update your password. Please request a fresh recovery link." }); return; }
  // Discard the recovery session. A separate login validates the new password.
  await auth.auth.signOut();
  res.clearCookie("campusx_access", { path: "/api" }); res.clearCookie("campusx_refresh", { path: "/api" });
  res.json({ message: "Password updated. Please log in with your new password." });
});
router.use((error: any, _req: Request, res: Response, _next: unknown) => {
  logger.error({ code: error?.code ?? error?.name ?? "unknown" }, "Authentication handler failed");
  res.status(503).json({ error: "Authentication is temporarily unavailable. Please try again." });
});
export default router;

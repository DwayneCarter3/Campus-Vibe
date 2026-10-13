import { getAuth, type IdentityRequest } from "../lib/auth-identity";
import type { Request, Response, NextFunction } from "express";
import { publicAuth, reconcileSupabaseProfile } from "../lib/supabase-auth";

export async function supabaseMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.campusx_access;
  if (!token) { next(); return; }
  try {
    const { data, error } = await publicAuth().auth.getUser(token);
    if (error && (!error.status || error.status >= 500 || error.status === 429)) {
      res.status(503).json({ error: "Authentication is temporarily unavailable. Please try again." });
      return;
    }
    if (error || !data.user?.email_confirmed_at) { next(); return; }
    const profile = await reconcileSupabaseProfile(data.user);
    const request = req as IdentityRequest;
    request.userId = profile.clerkUserId;
    request.supabaseUser = data.user;
    request.accessToken = token;
    next();
  } catch {
    res.status(503).json({ error: "Could not validate your account. Please try again." });
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
};

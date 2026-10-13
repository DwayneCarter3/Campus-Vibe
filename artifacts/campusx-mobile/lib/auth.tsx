import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";

export type AuthUser = {
  id: string;
  authId: string;
  email: string;
  fullName: string | null;
  firstName: string | null;
  username: string | null;
  imageUrl: string | null;
  role: string;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
};

type Session = { access_token: string; refresh_token: string; expires_at: number };
type LoginResponse = { user: AuthUser; session: Session; needsOnboarding: boolean };

const SESSION_KEY = "campusx_auth_session";
let authBase = "/api/auth";
export function setAuthBaseUrl(origin: string) {
  authBase = `${origin.replace(/\/+$/, "")}/api/auth`;
}

// SecureStore on native; in-memory only on web preview (never persisted to web storage)
let memorySession: string | null = null;
const store = {
  get: async () => (Platform.OS === "web" ? memorySession : SecureStore.getItemAsync(SESSION_KEY).catch(() => null)),
  set: async (v: string) => {
    if (Platform.OS === "web") memorySession = v;
    else {
      try {
        await SecureStore.setItemAsync(SESSION_KEY, v);
      } catch {
        throw new SessionPersistError();
      }
    }
  },
  clear: async () => {
    if (Platform.OS === "web") memorySession = null;
    else await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
  },
};

export class AuthRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${authBase}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new AuthRequestError(res.status, data?.error || data?.message || "Something went wrong. Please try again.");
  return data as T;
}

export class SessionPersistError extends Error {
  constructor() {
    super("Signed in, but this device could not save your session securely. Free up storage or check device security settings, then try again.");
  }
}

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: AuthUser | null;
  needsOnboarding: boolean;
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<{ needsOnboarding: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<string>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const saveLogin = useCallback(async (r: LoginResponse) => {
    // Persist first; only mark signed in once the session is safely stored.
    await store.set(JSON.stringify(r.session));
    sessionRef.current = r.session;
    setUser(r.user);
    setNeedsOnboarding(r.needsOnboarding);
  }, []);

  const clearLocal = useCallback(async () => {
    sessionRef.current = null;
    await store.clear();
    setUser(null);
    setNeedsOnboarding(false);
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    if (refreshing.current) return refreshing.current;
    const current = sessionRef.current;
    if (!current?.refresh_token) return null;
    refreshing.current = (async () => {
      try {
        const r = await request<LoginResponse>("/refresh", { method: "POST", body: { refresh_token: current.refresh_token } });
        await saveLogin(r);
        return r.session;
      } catch (err) {
        if (err instanceof AuthRequestError && (err.status === 401 || err.status === 400)) await clearLocal();
        return null;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [saveLogin, clearLocal]);

  const getToken = useCallback(async (): Promise<string | null> => {
    const s = sessionRef.current;
    if (!s) return null;
    const expiresMs = s.expires_at > 1e12 ? s.expires_at : s.expires_at * 1000;
    if (expiresMs - Date.now() < 60_000) {
      const fresh = await refreshSession();
      return fresh?.access_token ?? null;
    }
    return s.access_token;
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await store.get();
        if (!raw) return;
        sessionRef.current = JSON.parse(raw) as Session;
        const token = await getToken();
        if (!token) return;
        try {
          const me = await request<{ user: AuthUser; needsOnboarding: boolean }>("/me", { token });
          if (!cancelled) {
            setUser(me.user);
            setNeedsOnboarding(me.needsOnboarding);
          }
        } catch (err) {
          if (err instanceof AuthRequestError && err.status === 401) {
            const fresh = await refreshSession();
            if (!fresh) await clearLocal();
          }
        }
      } catch {
        await clearLocal();
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await request<LoginResponse>("/login", { method: "POST", body: { email, password } });
    try {
      await saveLogin(r);
    } catch (err) {
      // Revoke the unsaved server session so it is not left dangling.
      await request("/logout", { method: "POST", body: { access_token: r.session.access_token }, token: r.session.access_token }).catch(() => {});
      throw err;
    }
    return { needsOnboarding: r.needsOnboarding };
  }, [saveLogin]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const r = await request<{ message?: string }>("/signup", { method: "POST", body: { email, password, fullName } });
    return r?.message || "Check your email to confirm your account.";
  }, []);

  const signOut = useCallback(async () => {
    const token = sessionRef.current?.access_token;
    try {
      await request("/logout", { method: "POST", body: { access_token: token }, token });
    } catch {
      // ignore network/expired errors; local sign-out still happens
    }
    await clearLocal();
  }, [clearLocal]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const r = await request<{ message?: string }>("/reset-password", { method: "POST", body: { email } });
    return r?.message || "If an account exists for that email, a reset link is on its way.";
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoaded,
    isSignedIn: !!user,
    userId: user?.id ?? null,
    user,
    needsOnboarding,
    getToken,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
  }), [isLoaded, user, needsOnboarding, getToken, signIn, signUp, signOut, requestPasswordReset]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useCtx() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Auth hooks must be used inside AuthProvider");
  return ctx;
}

export function useAuth() {
  return useCtx();
}

export function useUser() {
  const { user, isLoaded, isSignedIn } = useCtx();
  return { user, isLoaded, isSignedIn };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

type AuthListener = (state: { user: AuthUser | null }) => void;

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  needsOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ needsOnboarding: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<string>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  updatePassword: (password: string, accessToken: string, refreshToken: string) => Promise<string>;
  bootError: string | null;
  refresh: () => Promise<void>;
  addListener: (listener: AuthListener) => () => void;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export const AUTH_API = `${basePath}/api/auth`;

export class AuthRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${AUTH_API}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new AuthRequestError(res.status, data?.error || data?.message || "Something went wrong. Please try again.");
  }
  return data as T;
}

type MeResponse = { user: AuthUser; needsOnboarding: boolean };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const listeners = useRef(new Set<AuthListener>());
  const userRef = useRef<AuthUser | null>(null);

  const apply = useCallback((next: AuthUser | null, onboarding = false) => {
    userRef.current = next;
    setBootError(null);
    setUser(next);
    setNeedsOnboarding(onboarding);
    listeners.current.forEach((l) => l({ user: next }));
  }, []);

  const loadMe = useCallback(async () => {
    setIsLoaded(false);
    setBootError(null);
    const isSignedOut = (err: unknown) => err instanceof AuthRequestError && (err.status === 401 || err.status === 400);
    const describe = (err: unknown) =>
      err instanceof AuthRequestError
        ? `We could not check your session (error ${err.status}). Please try again.`
        : "We could not reach CampusX. Check your connection and try again.";
    try {
      const me = await authFetch<MeResponse>("/me");
      apply(me.user, me.needsOnboarding);
    } catch (err) {
      if (!isSignedOut(err)) {
        setBootError(describe(err));
        return;
      }
      try {
        const r = await authFetch<MeResponse>("/refresh", { method: "POST", body: {} });
        apply(r.user, r.needsOnboarding);
      } catch (refreshErr) {
        if (isSignedOut(refreshErr)) apply(null);
        else setBootError(describe(refreshErr));
      }
    } finally {
      setIsLoaded(true);
    }
  }, [apply]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await authFetch<MeResponse>("/login", { method: "POST", body: { email, password } });
    apply(r.user, r.needsOnboarding);
    return { needsOnboarding: r.needsOnboarding };
  }, [apply]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const r = await authFetch<{ message: string }>("/signup", { method: "POST", body: { email, password, fullName } });
    return r?.message || "Check your email to confirm your account.";
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authFetch("/logout", { method: "POST", body: {} });
    } catch {
      // cookie may already be gone; still sign out locally
    }
    apply(null);
  }, [apply]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const r = await authFetch<{ message?: string }>("/reset-password", { method: "POST", body: { email } });
    return r?.message || "If an account exists for that email, a reset link is on its way.";
  }, []);

  const updatePassword = useCallback(async (password: string, accessToken: string, refreshToken: string) => {
    const r = await authFetch<{ message?: string }>("/update-password", {
      method: "POST",
      body: { password, access_token: accessToken, refresh_token: refreshToken },
    });
    return r?.message || "Password updated. You can sign in now.";
  }, []);

  const addListener = useCallback((listener: AuthListener) => {
    listeners.current.add(listener);
    listener({ user: userRef.current });
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoaded,
    isSignedIn: !!user,
    user,
    needsOnboarding,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
    refresh: loadMe,
    addListener,
    bootError,
  }), [bootError, isLoaded, user, needsOnboarding, signIn, signUp, signOut, requestPasswordReset, updatePassword, loadMe, addListener]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Auth hooks must be used inside AuthProvider");
  return ctx;
}

export function useAuth() {
  const ctx = useAuthContext();
  return { ...ctx, userId: ctx.user?.id ?? null };
}

export function useUser() {
  const { user, isLoaded, isSignedIn } = useAuthContext();
  return { user, isLoaded, isSignedIn };
}

export function useClerk() {
  const { signOut, addListener, user } = useAuthContext();
  return { signOut, addListener, user };
}

export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  const { isLoaded, isSignedIn, bootError } = useAuthContext();
  if (!isLoaded || bootError) return null;
  if (when === "signed-in" ? isSignedIn : !isSignedIn) return <>{children}</>;
  return null;
}

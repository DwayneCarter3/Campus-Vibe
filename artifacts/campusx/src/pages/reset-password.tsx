import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { AuthField, AuthNotice, AuthShell, AuthSubmit } from "@/components/auth-shell";

type RecoveryTokens = { accessToken: string; refreshToken: string };

function readRecoveryHash(): { tokens: RecoveryTokens | null; error: string | null } {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return { tokens: null, error: null };
  const params = new URLSearchParams(hash);
  // Clear tokens from the URL immediately
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  const err = params.get("error_description");
  if (err) return { tokens: null, error: err };
  const type = params.get("type");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken || type !== "recovery") return { tokens: null, error: null };
  return { tokens: { accessToken, refreshToken }, error: null };
}

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const tokenRef = useRef<RecoveryTokens | null>(null);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    const r = readRecoveryHash();
    tokenRef.current = r.tokens;
    setHasToken(!!r.tokens);
    if (r.error) setError(r.error);
    setReady(true);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenRef.current) return;
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError("");
    try {
      const { accessToken, refreshToken } = tokenRef.current;
      setDone(await updatePassword(password, accessToken, refreshToken));
      tokenRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password. Request a new link.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <div className="min-h-[40vh]" aria-busy="true" />;

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can now sign in with your new password.">
        <AuthNotice tone="success">{done}</AuthNotice>
        <Link href="/sign-in" className="mt-4 flex h-11 items-center justify-center rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 text-white font-semibold">Go to sign in</Link>
      </AuthShell>
    );
  }

  if (!hasToken) {
    return (
      <AuthShell title="Reset link invalid" subtitle="This link is missing, expired or already used.">
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        <Link href="/sign-in" className="mt-4 flex h-11 items-center justify-center rounded-lg border border-border font-semibold text-foreground hover:bg-muted/40">Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Set a new password for your CampusX account.">
      <form onSubmit={onSubmit} className="space-y-4" data-testid="form-reset-password">
        <AuthField id="new-password" label="New password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <AuthField id="confirm-password" label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        <AuthSubmit loading={loading}>Update password</AuthSubmit>
      </form>
    </AuthShell>
  );
}

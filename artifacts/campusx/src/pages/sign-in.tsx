import { useState, type FormEvent } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { AuthField, AuthNotice, AuthShell, AuthSubmit } from "@/components/auth-shell";

export default function SignInPage() {
  const { isLoaded, isSignedIn, signIn, requestPasswordReset } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"signIn" | "forgot">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (isLoaded && isSignedIn && !loading) return <Redirect to="/feed" />;

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const r = await signIn(email.trim(), password);
      setLocation(r.needsOnboarding ? "/onboarding" : "/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Check your details.");
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      setNotice(await requestPasswordReset(email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "forgot") {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="Enter your account email and we will send you a secure reset link."
        footer={<button type="button" className="text-primary font-semibold hover:underline" onClick={() => { setMode("signIn"); setNotice(""); setError(""); }}>Back to sign in</button>}
      >
        <form onSubmit={onForgot} className="space-y-4" data-testid="form-forgot-password">
          <AuthField id="reset-email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@example.com" />
          {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
          {notice ? <AuthNotice tone="success">{notice}</AuthNotice> : null}
          <AuthSubmit loading={loading}>Send reset link</AuthSubmit>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your CampusX account"
      footer={<>New student? <Link href="/sign-up" className="text-primary font-semibold hover:underline">Create an account</Link></>}
    >
      <form onSubmit={onSignIn} className="space-y-4" data-testid="form-sign-in">
        <AuthField id="email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@example.com" />
        <AuthField id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex justify-end -mt-1">
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setMode("forgot"); setError(""); }} data-testid="link-forgot-password">Forgot password?</button>
        </div>
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        <AuthSubmit loading={loading}>Sign in</AuthSubmit>
        <AuthNotice tone="info">We moved to a new sign-in system. If you joined before, use "Forgot password?" once to set a new password. Your posts and profile stay the same.</AuthNotice>
      </form>
    </AuthShell>
  );
}

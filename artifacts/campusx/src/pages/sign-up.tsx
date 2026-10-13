import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { AuthField, AuthNotice, AuthShell, AuthSubmit } from "@/components/auth-shell";

export default function SignUpPage() {
  const { isLoaded, isSignedIn, signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  if (isLoaded && isSignedIn) return <Redirect to="/feed" />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError(password.length < 8 ? "Use at least 8 characters for your password." : "Fill in every field.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const msg = await signUp(email.trim(), password, fullName.trim());
      setMessage(msg);
      setSentTo(email.trim());
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a confirmation link to ${sentTo}.`}
        footer={<>Confirmed already? <Link href="/sign-in" className="text-primary font-semibold hover:underline">Sign in</Link></>}
      >
        <AuthNotice tone="success">{message}</AuthNotice>
        <p className="text-sm text-muted-foreground mt-4">Open the link to confirm your account, then sign in to set up your student profile. Check spam if it does not arrive in a few minutes.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join CampusX"
      subtitle="Create your student account"
      footer={<>Already have an account? <Link href="/sign-in" className="text-primary font-semibold hover:underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" data-testid="form-sign-up">
        <AuthField id="fullName" label="Full name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Tunde Bello" />
        <AuthField id="email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@example.com" />
        <AuthField id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        {error ? (
          <AuthNotice tone="error">
            {error}
            {error.toLowerCase().includes("already exists") ? <> <Link href="/sign-in" className="underline font-semibold">Go to sign in</Link></> : null}
          </AuthNotice>
        ) : null}
        <AuthSubmit loading={loading}>Create account</AuthSubmit>
      </form>
    </AuthShell>
  );
}

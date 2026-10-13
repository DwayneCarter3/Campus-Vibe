import type { ReactNode } from "react";
import { Link } from "wouter";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="relative w-[440px] max-w-full">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-20 pointer-events-none" />
        <div className="relative bg-card rounded-2xl border border-border shadow-xl p-6 sm:p-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 text-primary font-extrabold flex items-center justify-center text-sm">CX</span>
            <span className="font-bold text-lg text-foreground">CampusX</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
          {children}
          {footer ? <div className="mt-6 text-sm text-muted-foreground text-center">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function AuthField({ id, label, ...props }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={id}
        className="w-full h-11 rounded-lg bg-background border border-input px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        {...props}
      />
    </div>
  );
}

export function AuthSubmit({ loading, children, disabled }: { loading: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full h-11 rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-semibold disabled:opacity-60 transition-colors"
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}

export function AuthNotice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "success"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "border-border bg-muted/40 text-muted-foreground";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-sm ${cls}`}>{children}</div>;
}

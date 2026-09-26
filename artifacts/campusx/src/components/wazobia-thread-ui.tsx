import { BadgeCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type WazobiaLanguage = "english" | "pidgin" | "yoruba" | "hausa" | "igbo";

type LanguageOption = {
  value: WazobiaLanguage;
  label: string;
  flag: string;
};

type LanguageBarProps = {
  mode: "language";
  languages: readonly LanguageOption[];
  language: WazobiaLanguage;
  onChooseLanguage: (language: WazobiaLanguage) => void;
  isSaving: boolean;
  isLoading: boolean;
  error: string;
  loadError: boolean;
  onRetry: () => void;
};

type PendingReplyProps = {
  mode: "pending";
};

type WazobiaThreadUIProps = LanguageBarProps | PendingReplyProps;

function BotAvatar() {
  return (
    <span aria-label="WAZOBIA AI bot avatar" role="img" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm">🤖</span>
  );
}

export default function WazobiaThreadUI(props: WazobiaThreadUIProps) {
  if (props.mode === "pending") {
    return (
      <div role="status" data-testid="status-wazobia-reply" className="flex items-center gap-2 text-xs text-muted-foreground">
        <BotAvatar />
        <div className="rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5">WAZOBIA is thinking…</div>
      </div>
    );
  }

  return (
    <div className="border-b border-white/5 px-4 py-3" data-testid="wazobia-language-bar">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label="WAZOBIA reply language">
        {props.languages.map(({ value, label, flag }) => (
          <button
            key={value}
            type="button"
            data-testid={`button-language-${value}`}
            aria-pressed={props.language === value}
            onClick={() => props.onChooseLanguage(value)}
            disabled={props.isSaving}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", props.language === value ? "border-primary/60 bg-primary/20 text-foreground" : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground")}
          >
            <span aria-hidden="true">{flag}</span> {label}
          </button>
        ))}
      </div>
      {props.isLoading && <Skeleton className="mt-2 h-1 w-24 rounded-full" />}
      {(props.error || props.loadError) && (
        <p data-testid="status-language-error" role="alert" className="mt-2 text-xs text-destructive">
          {props.error || "Couldn't load your language preference."} {props.loadError && <button data-testid="button-retry-language" className="underline" onClick={props.onRetry}>Retry</button>}
        </p>
      )}
    </div>
  );
}
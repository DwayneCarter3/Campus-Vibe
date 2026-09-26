import { useState } from "react";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type VerificationBadgeType = "blue" | "rounded" | "gold";
export type VerificationBadgeKind = "student" | "business";

interface VerificationBadgeProps {
  size?: "sm" | "md" | "lg";
  type?: VerificationBadgeType;
  kind?: VerificationBadgeKind;
  className?: string;
}

/** Inline verification mark. Only render for accounts the API says are verified. */
export function VerificationBadge({
  size = "sm",
  type = "blue",
  kind = "student",
  className,
}: VerificationBadgeProps) {
  const [open, setOpen] = useState(false);
  const label = kind === "business" ? "Verified LASU CampusX Business" : "Verified Student Account";
  const Icon = type === "rounded" ? CheckCircle2 : BadgeCheck;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((value) => !value);
            }
          }}
          className={cn("inline-flex shrink-0 align-middle cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400", className)}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "block drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
              size === "sm" ? "h-[1em] w-[1em]" : size === "md" ? "h-[1.08em] w-[1.08em]" : "h-[1.16em] w-[1.16em]",
            )}
            fill={type === "gold" ? "#FFD700" : type === "rounded" ? "#0095F6" : "#1DA1F2"}
            stroke="#fff"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="border border-white/15 bg-[#151926] px-2.5 py-1.5 text-xs font-medium text-white shadow-xl">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
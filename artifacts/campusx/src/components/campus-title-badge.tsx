import { cn } from "@/lib/utils";

interface CampusTitleBadgeProps {
  title: string;
  role?: string;
  className?: string;
}

const STAFF_ROLES = new Set(["ceo", "admin", "moderator"]);

const TITLE_STYLES: Record<string, string> = {
  "Campus Daddy": "bg-gradient-to-r from-pink-500/20 to-orange-500/20 text-orange-300 border-orange-500/30",
  "Godfather": "bg-gradient-to-r from-red-500/20 to-pink-500/20 text-pink-300 border-pink-500/30",
  "Big Daddy": "bg-primary/15 text-primary border-primary/30",
  "Campus Rep": "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "Rising Star": "bg-sky-500/15 text-sky-400 border-sky-500/25",
};

export function CampusTitleBadge({ title, role, className }: CampusTitleBadgeProps) {
  if (!title || STAFF_ROLES.has(title.trim().toLowerCase()) || STAFF_ROLES.has(role?.trim().toLowerCase() ?? "")) return null;

  const styleClass =
    TITLE_STYLES[title] ??
    "bg-white/10 text-foreground/70 border-white/15";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0 h-4 rounded-full border shrink-0",
        styleClass,
        className
      )}
    >
      {title}
    </span>
  );
}

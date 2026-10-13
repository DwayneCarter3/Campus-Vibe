import { useState } from "react";
import { Link } from "wouter";
import { Calculator, Home, Menu, MessageCircle, Shield, ShoppingBag, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";

interface MobileNavDrawerProps {
  isActive: (path: string) => boolean;
  showAdmin: boolean;
  totalUnread: number;
  avatarUrl?: string | null;
  displayName: string;
  initial: string;
}

export function MobileNavDrawer({ isActive, showAdmin, totalUnread, avatarUrl, displayName, initial }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const items = [
    { href: "/feed", label: "Feed", icon: Home, testId: "link-mobile-feed" },
    { href: "/earn", label: "Marketplace", icon: ShoppingBag, testId: "link-mobile-marketplace" },
    { href: "/cgpa", label: "CGPA planner", icon: Calculator, testId: "link-mobile-cgpa" },
    { href: "/messages", label: "Direct messages", icon: MessageCircle, testId: "link-mobile-messages", badge: totalUnread },
    ...(showAdmin ? [{ href: "/admin", label: "Admin", icon: Shield, testId: "link-mobile-admin" }] : []),
    { href: "/profile", label: "Your profile", icon: UserRound, testId: "link-mobile-profile" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={totalUnread > 0 ? `Open menu, ${totalUnread} unread messages` : "Open menu"}
          data-testid="button-mobile-menu"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background/40 text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
          {totalUnread > 0 && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[min(20rem,86vw)] flex-col gap-0 overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="border-b border-border/60 p-5 pr-12 text-left">
          <SheetTitle className="gradient-text text-2xl font-bold tracking-tighter">CampusX</SheetTitle>
          <SheetDescription>Every CampusX tool, in your pocket.</SheetDescription>
        </SheetHeader>
        <Link href="/profile" onClick={() => setOpen(false)} className="mx-3 mt-3 flex items-center gap-3 rounded-xl p-3 hover:bg-primary/10">
          <Avatar className="h-11 w-11 border border-primary/20">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="bg-secondary text-sm">{initial}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{displayName}</span>
            <span className="block text-xs text-muted-foreground">View and edit profile</span>
          </span>
        </Link>
        <nav aria-label="Mobile navigation" className="flex flex-col gap-1 p-3">
          {items.map(({ href, label, icon: Icon, testId, badge }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={testId}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${active ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"}`}
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="flex-1">{label}</span>
                {!!badge && badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between border-t border-border/60 p-4">
          <span className="text-sm text-muted-foreground">Appearance</span>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { Link, useLocation } from "wouter";
import { useGetShuttleStatus, getGetShuttleStatusQueryKey } from "@workspace/api-client-react";
import { Bot, BusFront, Calculator, Home, MessageCircle, ShoppingBag, UserRound } from "lucide-react";

const links = [
  { href: "/feed", label: "Campus Feed", Icon: Home },
  { href: "/earn", label: "Marketplace", Icon: ShoppingBag },
  { href: "/messages", label: "Messages", Icon: MessageCircle },
  { href: "/cgpa", label: "CGPA Planner", Icon: Calculator },
  { href: "/profile", label: "Profile", Icon: UserRound },
];

export function DashboardLeftNav() {
  const [location] = useLocation();
  return (
    <aside className="hidden md:block min-w-0" aria-label="Dashboard navigation">
      <div className="sticky top-20 rounded-2xl border border-border/60 bg-card/65 p-2 xl:p-3">
        <p className="px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Explore</p>
        <nav className="space-y-1" aria-label="Campus sections">
          {links.map(({ href, label, Icon }) => (
            <Link key={href} href={href} data-testid={`link-dashboard-${href.slice(1)}`} aria-current={location === href ? "page" : undefined}
              className={`flex items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors xl:px-3 ${location === href ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export function DashboardRightSidebar() {
  const { data: shuttle, isError } = useGetShuttleStatus({
    query: { queryKey: getGetShuttleStatusQueryKey(), refetchInterval: 30_000 },
  });
  const status = shuttle?.status === "fast_moving" ? "Fast moving" :
    shuttle?.status === "long_queue" ? "Long queue" :
    shuttle?.status === "gridlock" ? "Gridlock / no shuttles" :
    shuttle?.voteCount ? "No clear majority" : "No recent reports";
  return (
    <aside className="hidden md:block min-w-0" aria-label="Campus updates and AI assistant">
      <div className="sticky top-20 space-y-3">
        <section className="rounded-2xl border border-orange-400/25 bg-card/70 p-3 xl:p-4">
          <div className="flex items-center gap-2 text-orange-400"><BusFront className="h-5 w-5" aria-hidden="true" /><h2 className="font-semibold text-sm">Shuttle Radar</h2></div>
          <p className="mt-3 text-sm font-semibold" data-testid="text-sidebar-shuttle-status">
            {isError ? "Status unavailable" : status}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{shuttle?.voteCount ? `${shuttle.voteCount} recent student reports` : "Live updates from students at Ojo Gate."}</p>
          <Link href="/feed" data-testid="link-sidebar-shuttle" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">See campus updates →</Link>
        </section>
        <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-card p-3 xl:p-4">
          <div className="flex items-center gap-2 text-primary"><Bot className="h-5 w-5" aria-hidden="true" /><h2 className="font-semibold text-sm">WAZOBIA AI</h2></div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Need help with campus life? Ask WAZOBIA in your messages.</p>
          <Link href="/messages" data-testid="link-sidebar-wazobia" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Open messages →</Link>
        </section>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const [location] = useLocation();
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,.12)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-label={label} aria-current={location === href ? "page" : undefined}
            data-testid={`link-mobile-${href.slice(1)}`}
            className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium ${location === href ? "text-primary" : "text-muted-foreground"}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label === "Campus Feed" ? "Feed" : label === "Marketplace" ? "Market" : label === "CGPA Planner" ? "CGPA" : label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
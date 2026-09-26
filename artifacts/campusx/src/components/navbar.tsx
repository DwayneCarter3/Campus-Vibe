import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentSearch } from "@/components/student-search";
import { CampusXLogo } from "@/components/campusx-logo";
import { Calculator, MessageCircle, Shield } from "lucide-react";
import { useGetMyProfile, getGetMyProfileQueryKey, useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";

export function Navbar() {
  const [location] = useLocation();
  const { user } = useUser();

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  const { data: convsData } = useListConversations({
    query: { queryKey: getListConversationsQueryKey() },
  });

  const isActive = (path: string) => location === path || location.startsWith(path + "/");
  const isAdminOrAbove = profile?.role && ["moderator", "admin", "ceo"].includes(profile.role);
  const totalUnread = (convsData?.conversations ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  const avatarUrl = profile?.avatarUrl || user?.imageUrl;

  return (
    <nav aria-label="CampusX header" className="fixed top-0 left-0 right-0 z-50 glass h-16">
      <div className="container mx-auto px-2 sm:px-4 h-full flex items-center gap-1 sm:gap-2">
        <Link href="/" aria-label="CampusX home" data-testid="link-campusx-home" className="shrink-0">
          <CampusXLogo width={148} height={38} className="h-[34px] w-[130px] text-foreground sm:h-[38px] sm:w-[148px]" glow />
        </Link>

        <Show when="signed-in">
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div className="shrink-0">
              <StudentSearch />
            </div>
            <div
              aria-label="Main navigation links"
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap px-1"
              role="navigation"
              tabIndex={0}
            >
              <Link
                href="/feed"
                className={`shrink-0 text-sm font-medium transition-colors ${isActive('/feed') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Feed
              </Link>
              <Link
                href="/earn"
                className={`shrink-0 text-sm font-medium transition-colors ${isActive('/earn') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Marketplace
              </Link>
              <Link
                href="/cgpa"
                aria-label="CGPA planner"
                data-testid="link-cgpa"
                className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-medium transition-colors ${isActive('/cgpa') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Calculator className="h-4 w-4" />
                <span className="hidden sm:inline">CGPA</span>
              </Link>

              <Link
                href="/messages"
                aria-label="Direct messages"
                className={`relative inline-flex shrink-0 items-center gap-1 text-sm font-medium transition-colors ${isActive('/messages') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">DMs</span>
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </Link>

              {isAdminOrAbove && (
                <Link
                  href="/admin"
                  aria-label="Admin"
                  className={`inline-flex shrink-0 items-center gap-1 text-sm font-medium transition-colors ${isActive('/admin') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <NotificationBell />
              <ThemeToggle />

              <Link href="/profile" aria-label="Your profile">
                <Avatar className="h-8 w-8 border border-primary/20 transition-colors hover:border-primary/50">
                  <AvatarImage src={avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-secondary text-xs">{user?.firstName?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </div>
        </Show>
        <Show when="signed-out">
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="gradient-btn rounded-full px-4 sm:px-6">Join Now</Button>
            </Link>
          </div>
        </Show>
      </div>
    </nav>
  );
}

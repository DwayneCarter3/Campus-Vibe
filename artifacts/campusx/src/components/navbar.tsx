import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentSearch } from "@/components/student-search";
import { Calculator, Home, MessageCircle, Shield, ShoppingBag } from "lucide-react";
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
        <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-bold tracking-tighter gradient-text min-[361px]:text-xl sm:text-2xl">
          CampusX
        </Link>

        <Show when="signed-in">
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div className="shrink-0">
              <StudentSearch />
            </div>
            <div
              aria-label="Main navigation links"
              className="flex min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden whitespace-nowrap px-0.5 min-[361px]:gap-1 sm:justify-start sm:gap-2"
              role="navigation"
            >
              <Link
                href="/feed"
                aria-label="Feed"
                title="Feed"
                className={`inline-flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${isActive('/feed') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Home aria-hidden="true" className="h-[14px] w-[14px] min-[361px]:h-4 min-[361px]:w-4 sm:hidden" />
                <span className="hidden sm:inline">Feed</span>
              </Link>
              <Link
                href="/earn"
                aria-label="Marketplace"
                title="Marketplace"
                className={`inline-flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${isActive('/earn') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <ShoppingBag aria-hidden="true" className="h-[14px] w-[14px] min-[361px]:h-4 min-[361px]:w-4 sm:hidden" />
                <span className="hidden sm:inline">Marketplace</span>
              </Link>
              <Link
                href="/cgpa"
                aria-label="CGPA planner"
                title="CGPA"
                data-testid="link-cgpa"
                className={`inline-flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 text-sm font-medium transition-colors sm:flex-none sm:justify-start sm:gap-1.5 ${isActive('/cgpa') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Calculator className="h-[14px] w-[14px] min-[361px]:h-4 min-[361px]:w-4" />
                <span className="hidden sm:inline">CGPA</span>
              </Link>

              <Link
                href="/messages"
                aria-label="Direct messages"
                title="Direct messages"
                className={`relative inline-flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${isActive('/messages') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <MessageCircle className="h-[14px] w-[14px] min-[361px]:h-4 min-[361px]:w-4" />
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
                  title="Admin"
                  className={`inline-flex min-w-0 flex-1 basis-0 items-center justify-center gap-1 text-sm font-medium transition-colors sm:flex-none sm:justify-start ${isActive('/admin') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Shield className="h-[14px] w-[14px] min-[361px]:h-4 min-[361px]:w-4" />
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

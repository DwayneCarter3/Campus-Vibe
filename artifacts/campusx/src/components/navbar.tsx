import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentSearch } from "@/components/student-search";
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
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-16">
      <div className="container mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tighter gradient-text">
          CampusX
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-4 min-w-0">
          <Show when="signed-in">
            <StudentSearch />
            <Link
              href="/feed"
              className={`hidden md:inline text-sm font-medium transition-colors ${isActive('/feed') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Feed
            </Link>
            <Link
              href="/earn"
              className={`hidden md:inline text-sm font-medium transition-colors ${isActive('/earn') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Marketplace
            </Link>
            <Link
              href="/cgpa"
              aria-label="CGPA planner"
              data-testid="link-cgpa"
              className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive('/cgpa') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">CGPA</span>
            </Link>

            {/* Messages */}
            <Link href="/messages" className="relative">
              <button className={`flex items-center gap-1 text-sm font-medium transition-colors ${isActive('/messages') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">DMs</span>
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </button>
            </Link>

            {/* Admin */}
            {isAdminOrAbove && (
              <Link href="/admin">
                <button className={`flex items-center gap-1 text-sm font-medium transition-colors ${isActive('/admin') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              </Link>
            )}

            <NotificationBell />
            <ThemeToggle />

            <Link href="/profile">
              <Avatar className="h-8 w-8 border border-primary/20 hover:border-primary/50 transition-colors cursor-pointer">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-secondary text-xs">{user?.firstName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
            </Link>
          </Show>
          <Show when="signed-out">
            <ThemeToggle />
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="gradient-btn rounded-full px-6">Join Now</Button>
            </Link>
          </Show>
        </div>
      </div>
    </nav>
  );
}

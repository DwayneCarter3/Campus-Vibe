import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";

export function Navbar() {
  const [location] = useLocation();
  const { user } = useUser();

  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-16">
      <div className="container mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tighter gradient-text">
          CampusX
        </Link>
        
        <div className="flex items-center gap-6">
          <Show when="signed-in">
            <Link 
              href="/feed" 
              className={`text-sm font-medium transition-colors ${isActive('/feed') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Feed
            </Link>
            <Link 
              href="/earn" 
              className={`text-sm font-medium transition-colors ${isActive('/earn') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Earn Legally
            </Link>
            <NotificationBell />
            <Link href="/profile">
              <Avatar className="h-8 w-8 border border-primary/20 hover:border-primary/50 transition-colors cursor-pointer">
                <AvatarImage src={user?.imageUrl} />
                <AvatarFallback className="bg-secondary text-xs">{user?.firstName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
            </Link>
          </Show>
          <Show when="signed-out">
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

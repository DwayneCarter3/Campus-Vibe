import { Navbar } from "./navbar";
import { Show, useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { DashboardLeftNav, DashboardRightSidebar, MobileBottomNav } from "./dashboard-sidebars";
import { InstallBanner } from "./install-banner";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const dashboard = !!isSignedIn && (location === "/feed" || location === "/earn");
  return (
    <div className="app-canvas min-h-[100dvh] text-foreground flex flex-col relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />
      
      <Navbar />
      <main className="flex-1 pt-16 pb-16 md:pb-0 flex flex-col w-full relative z-10">
        {dashboard ? (
          <div className="mx-auto grid w-full max-w-[1480px] min-w-0 grid-cols-1 gap-3 px-0 md:grid-cols-[140px_minmax(0,1fr)_180px] md:gap-3 md:px-3 xl:grid-cols-[210px_minmax(0,1fr)_260px] xl:gap-5 xl:px-5">
            <DashboardLeftNav />
            <div className="min-w-0">{children}</div>
            <DashboardRightSidebar />
          </div>
        ) : children}
      </main>
      <Show when="signed-in"><MobileBottomNav /></Show>
      <InstallBanner />
    </div>
  );
}

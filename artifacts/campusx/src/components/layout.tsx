import { Navbar } from "./navbar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-canvas min-h-[100dvh] text-foreground flex flex-col relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />
      
      <Navbar />
      <main className="flex-1 pt-16 flex flex-col w-full relative z-10">
        {children}
      </main>
    </div>
  );
}

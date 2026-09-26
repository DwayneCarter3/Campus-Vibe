import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Download, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "campusx-install-banner-dismissed";

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function InstallBanner() {
  const { isSignedIn } = useAuth();
  const [visible, setVisible] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [instructions, setInstructions] = useState(false);

  useEffect(() => {
    if (isInstalled() || localStorage.getItem(DISMISSED_KEY)) return;
    setVisible(true);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallEvent);
    };
    const onInstalled = () => {
      setVisible(false);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const install = async () => {
    if (!promptEvent) {
      setInstructions(true);
      return;
    }
    try {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      setPromptEvent(null);
      if (result.outcome === "accepted") setVisible(false);
    } catch {
      setInstructions(true);
    }
  };

  return (
    <aside aria-label="Install CampusX" data-testid="banner-install-app"
      className={`fixed left-3 right-3 z-40 mx-auto max-w-md rounded-2xl border border-primary/40 bg-card p-3 text-foreground shadow-2xl md:bottom-5 ${isSignedIn ? "bottom-[calc(4.25rem+env(safe-area-inset-bottom))]" : "bottom-4"}`}>
      <div className="flex items-start gap-3">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} width="44" height="44" alt="" className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Install CampusX App</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {instructions
              ? isIOS ? "Tap Share in Safari, then Add to Home Screen." : "Open your browser menu and choose Install app or Add to Home Screen."
              : "Keep your campus one tap away from your home screen."}
          </p>
        </div>
        <button type="button" data-testid="button-dismiss-install" aria-label="Dismiss install suggestion"
          onClick={() => { localStorage.setItem(DISMISSED_KEY, "yes"); setVisible(false); }}
          className="rounded-lg p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {!instructions && (
        <button type="button" data-testid="button-install-app" onClick={() => void install()}
          className="gradient-btn mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-white">
          <Download className="h-4 w-4" /> Install CampusX App
        </button>
      )}
    </aside>
  );
}
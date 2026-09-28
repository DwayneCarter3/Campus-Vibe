export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;

// Listen as soon as the app loads: the profile page is lazy-loaded and may
// mount after the browser has already fired beforeinstallprompt.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
  });
}

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const isStandalone = typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const isIOSStandalone = typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandalone || isIOSStandalone;
}

/** Returns true if a native prompt was displayed, even when dismissed. */
export async function promptToInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null; // A browser prompt can only be used once.
  try {
    await prompt.prompt();
    await prompt.userChoice;
    return true;
  } catch {
    return false;
  }
}
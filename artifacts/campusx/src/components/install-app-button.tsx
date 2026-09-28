import { useEffect, useState } from "react";
import { Download, MoreVertical, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAppInstalled, promptToInstall } from "@/lib/pwa-install";

type Device = "iphone" | "android";

function initialDevice(): Device {
  const iOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS ? "iphone" : "android";
}

const steps = {
  iphone: [
    <>Open CampusX in <strong>Safari</strong>.</>,
    <>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</>,
    <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
    <>Tap <strong>Add</strong> to place it on your home screen.</>,
  ],
  android: [
    <>Tap the <strong>three dots</strong> menu in Chrome.</>,
    <>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</>,
  ],
};

export function InstallAppButton() {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<Device>(initialDevice);
  const [installed, setInstalled] = useState(isAppInstalled);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onInstalled = () => { setInstalled(true); setOpen(false); };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (!(await promptToInstall())) setOpen(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="button-install-app"
        disabled={pending}
        onClick={() => void handleInstall()}
        className="border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/20 hover:text-fuchsia-900 dark:text-fuchsia-100 dark:hover:text-white"
      >
        <Download className="mr-1.5 h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" />
        {pending ? "Opening…" : "Install App"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[min(90dvh,680px)] max-w-md overflow-y-auto rounded-2xl border border-fuchsia-400/25 bg-[#12101e] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,.65)] sm:p-7">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/25 to-violet-500/20">
              <Smartphone className="h-6 w-6 text-fuchsia-300" />
            </div>
            <DialogTitle className="text-xl font-bold">Take CampusX with you</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-300">
              Add CampusX to your home screen for quick access. Choose your phone to see how.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1" role="group" aria-label="Choose your phone">
            {(["iphone", "android"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`button-install-${option}`}
                aria-pressed={device === option}
                onClick={() => setDevice(option)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 ${device === option ? "bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-md" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                {option === "iphone" ? "iPhone · Safari" : "Android · Chrome"}
              </button>
            ))}
          </div>

          <ol data-testid="list-install-steps" className="space-y-3">
            {steps[device].map((step, index) => (
              <li key={`${device}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-slate-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-bold text-fuchsia-300">{index + 1}</span>
                <span>{step}</span>
                {device === "iphone" && index === 1 && <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" aria-hidden="true" />}
                {device === "android" && index === 0 && <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-400">No app store needed. You can open CampusX from your home screen anytime.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
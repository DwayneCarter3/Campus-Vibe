import { useState } from "react";
import { ShieldCheck, ScrollText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";

export default function SettingsLegalPanel({ onClose }: { onClose: () => void }) {
  const [legalOpen, setLegalOpen] = useState<"privacy" | "terms" | null>(null);

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-background/30 p-4" aria-label="Settings and legal">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Settings &amp; legal</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="border-white/10 text-xs" onClick={() => setLegalOpen("privacy")}>
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Privacy Policy
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-xs" onClick={() => setLegalOpen("terms")}>
            <ScrollText className="h-3.5 w-3.5 mr-1.5" /> Terms of Service
          </Button>
        </div>
      </section>

      <Dialog open={legalOpen !== null} onOpenChange={(open) => !open && setLegalOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85dvh] bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>{legalOpen === "privacy" ? "Privacy Policy" : "Terms of Service"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65dvh] overflow-y-auto rounded-xl bg-background/40 border border-white/5 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
              {legalOpen === "privacy" ? PRIVACY_POLICY : TERMS_OF_SERVICE}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
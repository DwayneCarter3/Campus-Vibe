import { useState } from "react";
import type { Service } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ShieldCheck, MapPin, AlertTriangle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CampusTitleBadge } from "@/components/campus-title-badge";
import { useStartConversation } from "@workspace/api-client-react";

async function notifyWhatsappClick(serviceId: number) {
  try {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${basePath}/api/services/${serviceId}/whatsapp-click`, { method: "POST" });
  } catch {
    // best-effort
  }
}

interface ServiceCardProps {
  service: Service;
  index?: number;
  currentUserId?: string;
}

function formatWhatsAppUrl(contactInfo: string, title: string): string {
  const digits = contactInfo.replace(/\D/g, "");
  let number = digits;
  if (digits.startsWith("0") && digits.length === 11) {
    number = "234" + digits.slice(1);
  } else if (!digits.startsWith("234") && digits.length === 10) {
    number = "234" + digits;
  }
  const message = encodeURIComponent(
    `Hello, I saw your hustle on CampusX and I'm interested! (${title})`
  );
  return `https://wa.me/${number}?text=${message}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Tutorials": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "Food & Snacks": "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "Gadgets": "bg-purple-500/15 text-purple-400 border-purple-500/25",
  "Freelance Services": "bg-pink-500/15 text-pink-400 border-pink-500/25",
  "Printing": "bg-pink-500/15 text-pink-400 border-pink-500/25",
  "Hair Styling": "bg-pink-500/15 text-pink-400 border-pink-500/25",
};

export function ServiceCard({ service, index = 0, currentUserId }: ServiceCardProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [, setLocation] = useLocation();
  const whatsappUrl = formatWhatsAppUrl(service.contactInfo, service.title);
  const categoryColor = CATEGORY_COLORS[service.category] ?? "bg-primary/15 text-primary border-primary/25";
  const startConversation = useStartConversation();

  const isMyService = currentUserId && service.providerId === currentUserId;

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowWarning(true);
  };

  const handleConfirm = () => {
    setShowWarning(false);
    notifyWhatsappClick(service.id);
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const handleMessageVendor = () => {
    if (!currentUserId) {
      setLocation("/sign-in");
      return;
    }
    startConversation.mutate(
      { data: { targetUserId: service.providerId } },
      {
        onSuccess: (conv) => {
          setLocation(`/messages?with=${service.providerId}`);
        },
      }
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="glass rounded-2xl overflow-hidden flex flex-col group border border-white/5 hover:border-primary/25 transition-all hover:shadow-lg hover:shadow-primary/5"
      >
        <div className="p-5 flex-1 flex flex-col gap-3">

          {/* Top row: category + price */}
          <div className="flex justify-between items-center gap-2">
            <Badge className={cn("text-[11px] px-2 py-0.5 border font-medium rounded-full", categoryColor)}>
              {service.category}
            </Badge>
            {service.price && (
              <span className="text-sm font-bold text-accent shrink-0">{service.price}</span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-bold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {service.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1 leading-relaxed">
            {service.description}
          </p>

          {/* Provider info */}
          <div className="pt-3 border-t border-white/5">
            <Link href={`/profile/${service.providerId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity mb-2">
              <Avatar className="h-8 w-8 border border-white/10">
                <AvatarImage src={service.providerAvatarUrl || undefined} />
                <AvatarFallback className="text-xs gradient-text font-bold">
                  {service.providerName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate leading-tight">{service.providerName}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                  <span>{service.providerFaculty}</span>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {service.providerCampusLocation}
                  </span>
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary font-medium">
                {service.providerLevel}
              </Badge>
              {service.providerIsVerified && (
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Verified Student
                </Badge>
              )}
              {service.providerCampusTitle && (
                <CampusTitleBadge title={service.providerCampusTitle} role={service.providerRole} />
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-white/5 flex">
          {/* Message Vendor */}
          {!isMyService && (
            <button
              onClick={handleMessageVendor}
              disabled={startConversation.isPending}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors flex-1 border-r border-white/5"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              {startConversation.isPending ? "Starting…" : "Message Vendor"}
            </button>
          )}

          {/* WhatsApp CTA */}
          <button
            onClick={handleWhatsAppClick}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border-t-0 border-[#25D366]/20 text-[#25D366] text-sm font-semibold transition-colors",
              isMyService ? "w-full" : "flex-1"
            )}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
        </div>
      </motion.div>

      {/* Safety Warning Modal */}
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="max-w-sm mx-4 bg-[#1a1008] border-2 border-orange-500 rounded-2xl p-0 overflow-hidden shadow-2xl shadow-orange-500/20 gap-0">
          <div className="bg-orange-500 px-5 py-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-white shrink-0" strokeWidth={2.5} />
            <DialogTitle className="text-white font-black text-base tracking-wide uppercase leading-tight">
              Safety Warning
            </DialogTitle>
          </div>
          <div className="px-5 py-5 space-y-4">
            <p className="text-orange-100 font-bold text-[15px] leading-relaxed">
              NEVER pay or transfer money upfront.
            </p>
            <p className="text-orange-200/90 text-sm leading-relaxed">
              Only meet the seller <span className="font-semibold text-orange-100">physically</span> at safe, crowded campus landmarks like the{" "}
              <span className="font-semibold text-orange-100">LASU Library</span> during daytime.
              Check the item fully before paying.
            </p>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 text-xs text-orange-300 leading-relaxed">
              🛡️ CampusX does not process payments. If anyone asks you to pay online before meeting, it is a scam.
            </div>
          </div>
          <div className="px-5 pb-5">
            <Button
              onClick={handleConfirm}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-black text-sm h-11 rounded-xl tracking-wide uppercase transition-colors"
            >
              I Understand — Contact Seller
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

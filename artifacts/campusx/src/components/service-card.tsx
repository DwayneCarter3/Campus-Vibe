import type { Service } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ShieldCheck, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

async function notifyWhatsappClick(serviceId: number) {
  try {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${basePath}/api/services/${serviceId}/whatsapp-click`, { method: "POST" });
  } catch {
    // best-effort; never block the WhatsApp link
  }
}

interface ServiceCardProps {
  service: Service;
  index?: number;
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

export function ServiceCard({ service, index = 0 }: ServiceCardProps) {
  const whatsappUrl = formatWhatsAppUrl(service.contactInfo, service.title);
  const categoryColor = CATEGORY_COLORS[service.category] ?? "bg-primary/15 text-primary border-primary/25";

  return (
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

          {/* Level + Verified badges */}
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
          </div>
        </div>
      </div>

      {/* WhatsApp CTA */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => notifyWhatsappClick(service.id)}
        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border-t border-[#25D366]/20 text-[#25D366] text-sm font-semibold transition-colors"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Message on WhatsApp
      </a>
    </motion.div>
  );
}

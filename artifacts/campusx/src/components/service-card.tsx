import type { Service } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Phone } from "lucide-react";

interface ServiceCardProps {
  service: Service;
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl overflow-hidden flex flex-col group border border-white/10 hover:border-primary/30 transition-colors"
    >
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 backdrop-blur-md">
            {service.category}
          </Badge>
          {service.price && (
            <span className="font-semibold text-accent">{service.price}</span>
          )}
        </div>
        
        <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{service.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
          {service.description}
        </p>
        
        <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
          <Link href={`/profile/${service.providerId}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Avatar className="h-8 w-8">
              <AvatarImage src={service.providerAvatarUrl || undefined} />
              <AvatarFallback className="text-xs">{service.providerName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="text-sm font-medium">{service.providerName}</div>
          </Link>
        </div>
      </div>
      <div className="p-2 bg-background/50 border-t border-white/5">
        <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-white/5" asChild>
          <a href={`tel:${service.contactInfo}`} className="flex items-center justify-center gap-2">
            <Phone className="h-3 w-3" /> Contact Provider
          </a>
        </Button>
      </div>
    </motion.div>
  );
}

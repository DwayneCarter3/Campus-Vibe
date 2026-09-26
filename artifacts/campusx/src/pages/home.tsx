import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-5xl mx-auto w-full text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="space-y-6"
      >
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4 backdrop-blur-sm">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
          LASU Ojo Campus Network
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-balance">
          The heartbeat of<br />
          <span className="gradient-text">Campus Life</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-[600px] mx-auto text-balance mt-6">
          A vibrant, electric social hub where LASU students post gist, find services, and connect. Urgent, social, and unmistakably collegiate.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link href="/sign-up">
            <Button size="lg" className="gradient-btn w-full sm:w-auto text-lg h-14 px-8 rounded-full shadow-[0_0_20px_rgba(245,40,110,0.3)] hover:shadow-[0_0_30px_rgba(245,40,110,0.5)]">
              Join the Network
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 rounded-full border-white/10 hover:bg-white/5 backdrop-blur-sm">
              Log In
            </Button>
          </Link>
        </div>
      </motion.div>
      
      {/* Decorative grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)] pointer-events-none -z-10 opacity-50" />
    </div>
  );
}

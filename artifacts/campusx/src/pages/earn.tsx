import { useState, useMemo } from "react";
import {
  useListServices,
  getListServicesQueryKey,
  useCreateService,
  useGetMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ServiceCard } from "@/components/service-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ShieldAlert, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

// ─── Categories ─────────────────────────────────────────────────────────────

const FILTER_TABS: { id: string | null; label: string; emoji: string; dbValue?: string }[] = [
  { id: null,         label: "All",      emoji: "🔥" },
  { id: "gadgets",    label: "Gadgets",  emoji: "📱", dbValue: "Gadgets" },
  { id: "tutorials",  label: "Tutorials",emoji: "📚", dbValue: "Tutorials" },
  { id: "food",       label: "Food",     emoji: "🍔", dbValue: "Food & Snacks" },
  { id: "services",   label: "Services", emoji: "✂️", dbValue: "Freelance Services" },
  { id: "fashion",    label: "Fashion",  emoji: "👗", dbValue: "Fashion & Tailoring" },
];

const FORM_CATEGORIES = [
  "Gadgets",
  "Tutorials",
  "Food & Snacks",
  "Freelance Services",
  "Fashion & Tailoring",
  "Printing",
  "Hair Styling",
  "Photography",
  "Graphic Design",
  "Writing & Editing",
  "Tech & Coding",
  "Music & Entertainment",
  "Other",
];

// ─── Schema ──────────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  title: z.string().min(3, "Name must be at least 3 characters"),
  price: z.string().optional(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Please select a category"),
  contactInfo: z.string().min(7, "Enter your WhatsApp number"),
});

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EarnPage() {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<"form" | "verify" | null>(null);
  const queryClient = useQueryClient();

  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });

  const activeCategory = FILTER_TABS.find((t) => t.id === activeTab)?.dbValue ?? undefined;

  const { data, isLoading } = useListServices(
    { category: activeCategory },
    { query: { queryKey: getListServicesQueryKey({ category: activeCategory }) } }
  );

  const createService = useCreateService();

  const form = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { title: "", price: "", description: "", category: "", contactInfo: "" },
  });

  // Client-side keyword search across title, description, provider name
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.services ?? [];
    return (data?.services ?? []).filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.providerName.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [data?.services, search]);

  const handleFabClick = () => {
    const hasMatric = profile?.matricNumber && profile.matricNumber.trim() !== "";
    setDialogMode(hasMatric ? "form" : "verify");
  };

  const onSubmit = (values: z.infer<typeof serviceSchema>) => {
    createService.mutate({ data: values }, {
      onSuccess: () => {
        setDialogMode(null);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      },
    });
  };

  const isFiltered = search.trim() !== "";

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl relative min-h-screen pb-24">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight gradient-text mb-0.5">Earn Legally 💼</h1>
        <p className="text-muted-foreground text-sm">Student-run hustles on LASU campus.</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          data-testid="input-search"
          placeholder="Search iPhone, Tutor, Indomie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 bg-white/5 border-white/10 focus:border-primary/40 rounded-xl h-11"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-2 mb-5"
        style={{ scrollbarWidth: "none" }}
      >
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={String(tab.id)}
              data-testid={`tab-${tab.id ?? "all"}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-all shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              <span className="text-base leading-none">{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Result count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground mb-4">
          {isFiltered
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
            : `${data?.total ?? 0} listing${(data?.total ?? 0) !== 1 ? "s" : ""} available`}
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-2xl" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState query={search} onPost={handleFabClick} />
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((service, i) => (
              <motion.div
                key={service.id}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.04 }}
              >
                <ServiceCard service={service} index={i} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleFabClick}
        data-testid="btn-fab-post"
        className="fixed bottom-20 right-5 z-40 h-14 w-14 rounded-full gradient-btn flex items-center justify-center shadow-xl shadow-primary/30"
        aria-label="Post a hustle"
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      {/* Verification Prompt Dialog */}
      <Dialog open={dialogMode === "verify"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-[420px] glass border-amber-500/20 p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500/10 to-transparent p-6 border-b border-white/5">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                </div>
                <DialogTitle className="text-lg font-bold text-amber-300">
                  Complete Identity Verification
                </DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To protect the LASU community, you need a verified matric number before posting a hustle.
                Add yours in your profile — it stays private and never shown publicly.
              </p>
            </DialogHeader>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <Link href="/profile">
              <Button className="w-full gradient-btn h-10 font-semibold" onClick={() => setDialogMode(null)}>
                Go to Profile & Add Matric
              </Button>
            </Link>
            <Button variant="ghost" className="w-full h-10 text-muted-foreground" onClick={() => setDialogMode(null)}>
              Maybe Later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post Hustle Form Dialog */}
      <Dialog open={dialogMode === "form"} onOpenChange={(o) => !o && setDialogMode(null)}>
        <DialogContent className="sm:max-w-[520px] glass border-primary/20 p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 to-transparent p-6 border-b border-white/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold gradient-text">Post Your Hustle 🚀</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                List your product or service for fellow LASU students.
              </p>
            </DialogHeader>
          </div>

          <div className="p-6 overflow-y-auto max-h-[70vh]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                {/* Item Name */}
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Item / Service Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. iPhone 11 (64GB), Maths Tutoring..."
                        className="bg-background/40 border-white/10 focus:border-primary/40 h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Price + Category row */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Price (₦) <span className="text-muted-foreground text-xs">optional</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="₦5,000"
                          className="bg-background/40 border-white/10 h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/40 border-white/10 h-10">
                            <SelectValue placeholder="Pick..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FORM_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Description */}
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell buyers what you're offering — condition, availability, delivery options..."
                        className="bg-background/40 border-white/10 focus:border-primary/40 resize-none min-h-[90px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* WhatsApp */}
                <FormField control={form.control} name="contactInfo" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Your WhatsApp Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="08012345678"
                        className="bg-background/40 border-white/10 focus:border-primary/40 h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Verified notice */}
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 flex gap-2 items-start">
                  <span className="text-base leading-none shrink-0">✅</span>
                  <span>Your matric number grants a <strong>Verified Student</strong> badge on your listing. It stays private and is never shown to buyers.</span>
                </div>

                <Button
                  type="submit"
                  className="w-full gradient-btn h-11 font-semibold"
                  disabled={createService.isPending}
                >
                  {createService.isPending ? "Posting..." : "Post My Hustle"}
                </Button>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ query, onPost }: { query: string; onPost: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-full"
    >
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-white/10 rounded-2xl bg-white/2">
        {/* Graphic */}
        <div className="relative mb-6">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center">
            <span className="text-4xl">🛒</span>
          </div>
          <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-gradient-to-br from-orange-500/30 to-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <span className="text-sm">✨</span>
          </div>
        </div>

        {query ? (
          <>
            <h3 className="text-lg font-bold mb-2">No hustles found for "{query}"</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              No results yet — why not be the first to post one?
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold mb-2">No hustles here yet!</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Be the first LASU student to list something in this category.
            </p>
          </>
        )}

        <button
          onClick={onPost}
          className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-full gradient-btn text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Post the First Hustle
        </button>
      </div>
    </motion.div>
  );
}

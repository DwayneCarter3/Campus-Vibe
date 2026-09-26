import { useState, useMemo, useEffect, useRef } from "react";
import {
  type Service,
  listServices,
  getListServicesQueryKey,
  useCreateService,
  useGetService,
  getGetServiceQueryKey,
  useGetMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ServiceCard } from "@/components/service-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ShieldAlert, X, Bookmark, ShoppingBag, ImagePlus, Loader2 } from "lucide-react";
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
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link, useLocation, useSearch } from "wouter";
import { useUser } from "@clerk/react";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { uploadCampusImage } from "@/lib/image-upload";

// ─── Categories ─────────────────────────────────────────────────────────────

const FILTER_TABS: { id: string | null; label: string; emoji: string; dbValue?: string }[] = [
  { id: null,         label: "All",      emoji: "🔥" },
  { id: "gadgets",    label: "Gadgets",  emoji: "📱", dbValue: "Gadgets" },
  { id: "tutorials",  label: "Tutorials",emoji: "📚", dbValue: "Tutorials" },
  { id: "food",       label: "Food",     emoji: "🍔", dbValue: "Food & Snacks" },
  { id: "services",   label: "Services", emoji: "✂️", dbValue: "Freelance Services" },
  { id: "fashion",    label: "Fashion",  emoji: "👗", dbValue: "Fashion & Tailoring" },
  { id: "flash-sale", label: "Flash Sale", emoji: "⚡" },
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
  isFlashSale: z.boolean(),
  originalPrice: z.string().optional(),
}).superRefine((values, context) => {
  if (!values.isFlashSale) return;
  const currentPrice = Number((values.price ?? "").replace(/[^\d.]/g, ""));
  const originalPrice = Number((values.originalPrice ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Enter a positive sale price." });
  }
  if (!Number.isFinite(originalPrice) || originalPrice <= 0 || originalPrice <= currentPrice) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["originalPrice"], message: "Original price must be greater than the sale price." });
  }
});

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EarnPage() {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { user, isLoaded: isUserLoaded } = useUser();
  const locationSearch = useSearch();
  const listingParam = new URLSearchParams(locationSearch).get("listing");
  const listingId = listingParam && /^[1-9]\d*$/.test(listingParam) ? Number(listingParam) : 0;
  const { data: linkedService, isLoading: linkedLoading, isError: linkedError, refetch: retryLinked } = useGetService(listingId, { query: { queryKey: getGetServiceQueryKey(listingId), enabled: !!listingId, refetchInterval: 60_000 } });
  const [search, setSearch] = useState("");
  const [listingImage, setListingImage] = useState<{ imageUrl: string; blurDataUrl: string } | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const listingImageInput = useRef<HTMLInputElement>(null);
  const listingGridRef = useRef<HTMLDivElement>(null);
  const [listingGridOffset, setListingGridOffset] = useState(0);
  const [dialogMode, setDialogMode] = useState<"form" | "verify" | null>(null);
  const queryClient = useQueryClient();

  const { data: profile } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() },
  });

  const activeCategory = FILTER_TABS.find((t) => t.id === activeTab)?.dbValue ?? undefined;
  const savedOnly = activeTab === "saved" ? true : undefined;
  const flashSale = activeTab === "flash-sale" ? true : undefined;

  const serviceParams = { category: activeCategory, savedOnly, flashSale, limit: 10 };
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: [...getListServicesQueryKey(serviceParams), user?.id ?? profile?.clerkUserId ?? null],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => listServices({ ...serviceParams, cursor: pageParam }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 60_000,
    enabled: isUserLoaded,
  });
  const listingsLoading = isLoading || !isUserLoaded;

  const createService = useCreateService();

  const form = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { title: "", price: "", description: "", category: "", contactInfo: "", isFlashSale: false, originalPrice: "" },
  });

  // Client-side keyword search across title, description, provider name
  const services = useMemo(() => {
    const byId = new Map<number, Service>();
    data?.pages.forEach((page) => page.services.forEach((service) => byId.set(service.id, service)));
    return [...byId.values()];
  }, [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.providerName.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [services, search]);
  const searchQuery = search.trim();

  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const grid = listingGridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColumns(width >= 980 ? 3 : width >= 580 ? 2 : 1);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: filtered.length + (hasNextPage && !searchQuery ? 1 : 0),
    lanes: columns,
    estimateSize: () => 360,
    getItemKey: (index) => filtered[index]?.id ?? `service-loader-${index}`,
    scrollMargin: listingGridOffset,
    overscan: 4,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const retryNextServicePage = () => { void fetchNextPage(); };
  useEffect(() => {
    if (searchQuery || isFetchNextPageError) return;
    const highestVisibleIndex = Math.max(-1, ...virtualItems.map((item) => item.index));
    if (highestVisibleIndex >= filtered.length - columns * 2 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, filtered.length, columns, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, searchQuery]);
  useEffect(() => {
    const updateOffset = () => {
      if (listingGridRef.current) setListingGridOffset(listingGridRef.current.getBoundingClientRect().top + window.scrollY);
    };
    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, [activeTab, search, listingsLoading, columns]);

  const handleFabClick = () => {
    const hasMatric = profile?.matricNumber && profile.matricNumber.trim() !== "";
    setDialogMode(hasMatric ? "form" : "verify");
  };

  const onSubmit = (values: z.infer<typeof serviceSchema>) => {
    if (imageUploading) return;
    createService.mutate({ data: {
      title: values.title,
      price: values.price || undefined,
      description: values.description,
      category: values.category,
      contactInfo: values.contactInfo,
      isFlashSale: values.isFlashSale,
      originalPrice: values.isFlashSale ? values.originalPrice || null : null,
      imageUrl: listingImage?.imageUrl ?? null,
      blurDataUrl: listingImage?.blurDataUrl ?? null,
    } }, {
      onSuccess: () => {
        setDialogMode(null);
        form.reset();
        setListingImage(null);
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      },
    });
  };

  const isFiltered = searchQuery !== "";

  const selectListingImage = async (file?: File) => {
    if (!file) return;
    setImageUploading(true);
    setImageError(null);
    try {
      setListingImage(await uploadCampusImage(file, "service-image"));
    } catch (uploadError) {
      setImageError(uploadError instanceof Error ? uploadError.message : "Couldn't upload listing image.");
    } finally {
      setImageUploading(false);
    }
  };

  return (
    <PullToRefresh className="container mx-auto px-4 py-6 max-w-6xl relative min-h-screen pb-24" onRefresh={() => refetch()}>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight gradient-text mb-0.5">Marketplace 💼</h1>
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
        <button data-testid="tab-saved" onClick={() => { if (!profile) { setLocation("/sign-in"); return; } setActiveTab("saved"); }} className={cn("flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-all shrink-0", activeTab === "saved" ? "bg-primary text-primary-foreground border-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground")}><Bookmark className="h-4 w-4" /> Saved listings</button>
      </div>

      {/* Result count */}
      {!listingsLoading && (
        <p className="text-xs text-muted-foreground mb-4">
          {isFiltered
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
            : `${data?.pages[0]?.total ?? 0} ${flashSale ? "flash sale " : ""}listing${(data?.pages[0]?.total ?? 0) !== 1 ? "s" : ""} available`}
        </p>
      )}

      {/* Virtualized marketplace grid */}
      {isError && (
        <div role="alert" className="mb-4 rounded-xl border border-white/10 p-5 text-sm">
          <p>Couldn't load marketplace listings{error instanceof Error ? `: ${error.message}` : "."}</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-3">Try again</Button>
        </div>
      )}
      <div ref={listingGridRef} className="relative" style={{ height: listingsLoading || filtered.length === 0 ? undefined : Math.max(0, virtualizer.getTotalSize() - listingGridOffset) }}>
        {listingsLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-2xl" />
          ))
        ) : filtered.length === 0 ? (
          isFetchingNextPage ? <Skeleton className="h-[320px] w-full rounded-2xl" /> : (
            activeTab === "saved" && !search ? <div className="text-center py-20 rounded-2xl border border-dashed border-white/10 bg-white/[.02]"><Bookmark className="h-10 w-10 mx-auto mb-4 text-primary/60" /><h3 className="font-bold text-lg">No saved listings yet</h3><p className="text-sm text-muted-foreground mt-1">Save listings from the three-dot menu to find them here.</p><Button className="mt-5" variant="outline" onClick={() => setActiveTab(null)}>Browse marketplace</Button></div> : <EmptyState query={search} onPost={handleFabClick} />
          )
        ) : (
          virtualItems.map((virtualItem) => {
            const service = filtered[virtualItem.index];
            const isLoader = virtualItem.index >= filtered.length;
            return (
              <div
                key={isLoader ? "service-loader" : service.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute top-0"
                style={{
                  left: `calc((100% - ${(columns - 1) * 16}px) / ${columns} * ${virtualItem.lane} + ${virtualItem.lane * 16}px)`,
                  width: `calc((100% - ${(columns - 1) * 16}px) / ${columns})`,
                  transform: `translateY(${virtualItem.start - listingGridOffset}px)`,
                }}
              >
                {isLoader
                  ? <div className="rounded-2xl border border-white/10 p-5 text-center text-sm text-muted-foreground">{isFetchingNextPage ? "Loading more listings…" : isFetchNextPageError ? "Couldn't load more listings." : "Loading…"}</div>
                  : <ServiceCard service={service} index={virtualItem.index} currentUserId={profile?.clerkUserId} />}
              </div>
            );
          })
        )}
      </div>
      {isFetchNextPageError && <div role="alert" className="py-3 text-center text-sm text-destructive">Couldn't load more listings. <Button variant="link" onClick={retryNextServicePage}>Retry</Button></div>}
      {searchQuery && hasNextPage && !isFetchNextPageError && (
        <div className="py-4 text-center">
          <p className="mb-2 text-xs text-muted-foreground">Search is currently checking {services.length} loaded listings.</p>
          <Button variant="outline" onClick={retryNextServicePage} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading more results…" : "Load more results"}
          </Button>
        </div>
      )}
      {!hasNextPage && filtered.length > 0 && <p className="py-5 text-center text-xs text-muted-foreground">You're all caught up.</p>}
      <Dialog open={!!listingParam} onOpenChange={(open) => { if (!open) setLocation("/earn"); }}>
        <DialogContent className="glass border-white/10 sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="text-lg font-bold">Marketplace listing</DialogTitle>
          {linkedLoading && <Skeleton className="h-72 rounded-2xl" />}
          {(!listingId || linkedError) && <div className="py-8 text-center"><ShoppingBag className="h-9 w-9 mx-auto text-muted-foreground/50 mb-3" /><p className="font-medium">This listing is unavailable.</p><p className="text-sm text-muted-foreground mt-1">It may have been removed or the link may be incorrect.</p><Button variant="outline" className="mt-4" onClick={() => retryLinked()}>Try again</Button></div>}
          {linkedService && <ServiceCard service={linkedService} currentUserId={profile?.clerkUserId} directView />}
        </DialogContent>
      </Dialog>

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

                <div className="space-y-2">
                  <span className="text-sm font-medium">Listing photo <span className="text-xs text-muted-foreground">optional · WebP under 80 KB</span></span>
                  <input ref={listingImageInput} type="file" accept="image/*" className="hidden" onChange={(event) => { void selectListingImage(event.target.files?.[0]); event.target.value = ""; }} />
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" disabled={imageUploading} onClick={() => listingImageInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />{imageUploading ? "Compressing…" : "Choose photo"}</Button>
                    {imageUploading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {listingImage && <button type="button" onClick={() => setListingImage(null)} className="text-xs text-muted-foreground hover:text-foreground">Remove photo</button>}
                  </div>
                  {listingImage && <img src={listingImage.imageUrl} alt="Listing preview" className="max-h-40 rounded-lg object-cover" />}
                  {imageError && <p role="alert" className="text-xs text-destructive">{imageError}</p>}
                </div>

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

                <FormField control={form.control} name="isFlashSale" render={({ field }) => (
                  <FormItem className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <FormControl><input data-testid="input-create-flash-sale" type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 accent-amber-400" /></FormControl>
                      <span className="text-sm font-semibold text-amber-100">⚡ Mark as a Flash Sale</span>
                    </label>
                    <p className="ml-7 text-xs text-muted-foreground">Create a limited-time discounted listing.</p>
                    <FormMessage />
                  </FormItem>
                )} />
                {form.watch("isFlashSale") && (
                  <FormField control={form.control} name="originalPrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Original Price (₦)</FormLabel>
                      <FormControl><Input data-testid="input-create-original-price" inputMode="decimal" placeholder="₦8,000" className="bg-background/40 border-amber-400/20 h-10" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

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
                  disabled={createService.isPending || imageUploading}
                >
                  {createService.isPending ? "Posting..." : "Post My Hustle"}
                </Button>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
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

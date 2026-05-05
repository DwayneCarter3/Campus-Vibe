import { useState } from "react";
import { useListServices, getListServicesQueryKey, useCreateService } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ServiceCard } from "@/components/service-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const FILTER_CATEGORIES = [
  { id: null,               label: "All Hustles",       emoji: "🔥" },
  { id: "Tutorials",        label: "Tutorials",          emoji: "📚" },
  { id: "Food & Snacks",    label: "Food & Snacks",      emoji: "🍔" },
  { id: "Gadgets",          label: "Gadgets",            emoji: "📱" },
  { id: "Freelance Services", label: "Freelance",        emoji: "✂️" },
];

const FORM_CATEGORIES = [
  "Tutorials",
  "Food & Snacks",
  "Gadgets",
  "Freelance Services",
  "Printing",
  "Hair Styling",
  "Photography",
  "Graphic Design",
  "Writing & Editing",
  "Tech & Coding",
  "Fashion & Tailoring",
  "Music & Entertainment",
  "Other",
];

const serviceSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Please select a category"),
  price: z.string().optional(),
  contactInfo: z.string().min(7, "Enter your WhatsApp number"),
});

export default function EarnPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListServices(
    { category: selectedCategory ?? undefined },
    { query: { queryKey: getListServicesQueryKey({ category: selectedCategory ?? undefined }) } }
  );

  const createService = useCreateService();

  const form = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { title: "", description: "", category: "", price: "", contactInfo: "" },
  });

  const onSubmit = (values: z.infer<typeof serviceSchema>) => {
    createService.mutate({ data: values }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      },
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl relative min-h-screen">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight gradient-text mb-1">Earn Legally 💼</h1>
        <p className="text-muted-foreground text-sm">Student-run hustles within the LASU community.</p>
      </div>

      {/* Category Filter Bar */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6" style={{ scrollbarWidth: "none" }}>
        {FILTER_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={String(cat.id)}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-all shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30"
                  : "glass border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Stats line */}
      {!isLoading && data && (
        <p className="text-xs text-muted-foreground mb-4">
          {data.total} listing{data.total !== 1 ? "s" : ""} available
          {selectedCategory ? ` in ${selectedCategory}` : ""}
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-2xl" />
          ))
        ) : data?.services.length === 0 ? (
          <div className="col-span-full py-20 text-center text-muted-foreground border border-dashed border-white/10 rounded-2xl">
            <div className="text-4xl mb-3">🛒</div>
            <p className="font-medium">No hustles listed here yet.</p>
            <p className="text-sm mt-1">Be the first — tap + to add yours.</p>
          </div>
        ) : (
          data?.services.map((service, i) => (
            <ServiceCard key={service.id} service={service} index={i} />
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsDialogOpen(true)}
        className="fixed bottom-20 right-5 z-40 h-14 w-14 rounded-full gradient-btn flex items-center justify-center shadow-xl shadow-primary/30"
        aria-label="Post a hustle"
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      {/* Post Hustle Dialog */}
      <AnimatePresence>
        {isDialogOpen && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-[520px] glass border-primary/20 p-0 overflow-hidden">
              <div className="bg-gradient-to-br from-primary/10 to-transparent p-6 border-b border-white/5">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold gradient-text">Post Your Hustle</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    List your service or product for fellow LASU students.
                  </p>
                </DialogHeader>
              </div>

              <div className="p-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Hustle Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Maths Tutoring for 200L" className="bg-background/40 border-white/10 focus:border-primary/40" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-background/40 border-white/10">
                              <SelectValue placeholder="Pick a category..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FORM_CATEGORIES.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What are you offering? Be specific so customers know what to expect."
                            className="bg-background/40 border-white/10 focus:border-primary/40 resize-none min-h-[90px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Price <span className="text-muted-foreground">(optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. ₦2,000/session" className="bg-background/40 border-white/10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="contactInfo" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">WhatsApp Number</FormLabel>
                          <FormControl>
                            <Input placeholder="08012345678" className="bg-background/40 border-white/10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                      ✅ Your matric number will be used to show a <strong>Verified Student</strong> badge on your listing. It stays private.
                    </div>

                    <Button
                      type="submit"
                      className="w-full gradient-btn h-11 font-semibold"
                      disabled={createService.isPending}
                    >
                      {createService.isPending ? "Posting..." : "🚀 Post My Hustle"}
                    </Button>
                  </form>
                </Form>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}

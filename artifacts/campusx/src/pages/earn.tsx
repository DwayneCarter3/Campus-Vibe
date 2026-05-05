import { useState } from "react";
import { useListServices, getListServicesQueryKey, useCreateService } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ServiceCard } from "@/components/service-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const categories = [
  "Tutoring & Academic Help", "Graphic Design & Art", "Tech & Coding", 
  "Fashion & Tailoring", "Food & Catering", "Photography", 
  "Music & Entertainment", "Writing & Editing", "Business & Finance", "Other"
];

const serviceSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  category: z.string().min(1),
  price: z.string().optional(),
  contactInfo: z.string().min(5),
});

export default function EarnPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const { data, isLoading } = useListServices(
    { category: selectedCategory }, 
    { query: { queryKey: getListServicesQueryKey({ category: selectedCategory }) } }
  );

  const createService = useCreateService();

  const form = useForm<z.infer<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      price: "",
      contactInfo: "",
    }
  });

  const onSubmit = (values: z.infer<typeof serviceSchema>) => {
    createService.mutate({ data: values }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Earn Legally</h1>
          <p className="text-muted-foreground">Find or offer services within the LASU community.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-btn rounded-full px-6">
              <Plus className="h-4 w-4 mr-2" /> List a Service
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] glass border-primary/20">
            <DialogHeader>
              <DialogTitle className="text-xl gradient-text">List Your Service</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Title</FormLabel><FormControl><Input className="bg-background/50" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger className="bg-background/50"><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea className="bg-background/50 resize-none" {...field} /></FormControl></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem><FormLabel>Price (Optional)</FormLabel><FormControl><Input placeholder="e.g. ₦5000 / hr" className="bg-background/50" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="contactInfo" render={({ field }) => (
                    <FormItem><FormLabel>Phone / WhatsApp</FormLabel><FormControl><Input className="bg-background/50" {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full gradient-btn" disabled={createService.isPending}>
                  {createService.isPending ? "Listing..." : "Post Service"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Badge 
          variant={selectedCategory === null ? "default" : "outline"} 
          className={`cursor-pointer ${selectedCategory === null ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </Badge>
        {categories.map(cat => (
          <Badge 
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            className={`cursor-pointer ${selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[250px] w-full rounded-2xl glass" />
          ))
        ) : data?.services.length === 0 ? (
          <div className="col-span-full py-20 text-center text-muted-foreground border border-dashed border-white/10 rounded-2xl">
            No services found in this category.
          </div>
        ) : (
          data?.services.map(service => (
            <ServiceCard key={service.id} service={service} />
          ))
        )}
      </div>
    </div>
  );
}

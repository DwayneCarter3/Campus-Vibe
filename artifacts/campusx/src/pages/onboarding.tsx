import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useGetMyProfile, useUpdateMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const UNIVERSITIES = [
  { value: "Lagos State University (LASU)", label: "Lagos State University (LASU)" },
  { value: "University of Lagos (UNILAG)", label: "University of Lagos (UNILAG)" },
  { value: "University of Benin (UNIBEN)", label: "University of Benin (UNIBEN)" },
  { value: "University of Nigeria, Nsukka (UNN)", label: "University of Nigeria, Nsukka (UNN)" },
  { value: "Obafemi Awolowo University (OAU)", label: "Obafemi Awolowo University (OAU)" },
  { value: "University of Ibadan (UI)", label: "University of Ibadan (UI)" },
  { value: "Ahmadu Bello University (ABU)", label: "Ahmadu Bello University (ABU)" },
  { value: "Covenant University", label: "Covenant University" },
  { value: "Babcock University", label: "Babcock University" },
  { value: "Pan-Atlantic University (PAU)", label: "Pan-Atlantic University (PAU)" },
];

const CAMPUS_LOCATIONS = [
  { value: "Ojo", label: "Ojo (Headquarters)" },
  { value: "Epe", label: "Epe" },
  { value: "Ikeja", label: "Ikeja" },
];

const formSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  school: z.string().min(1, "University is required"),
  campusLocation: z.string().min(1, "Campus location is required"),
  level: z.string().min(1, "Level is required"),
  faculty: z.string().min(1, "Faculty is required"),
  enrollmentStatus: z.string().min(1, "Enrollment status is required"),
  matricNumber: z.string().min(5, "Matriculation number is required"),
  campus: z.string().default("LASU Ojo"),
});

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [schoolOpen, setSchoolOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetMyProfile({ query: { retry: false, queryKey: getGetMyProfileQueryKey() } });
  const updateProfile = useUpdateMyProfile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      school: "Lagos State University (LASU)",
      campusLocation: "",
      level: "",
      faculty: "",
      enrollmentStatus: "",
      matricNumber: "",
      campus: "LASU Ojo",
    },
  });

  useEffect(() => {
    if (profile?.id) {
      setLocation("/feed");
    }
  }, [profile, setLocation]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateProfile.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        setLocation("/feed");
      }
    });
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

  const selectedSchool = form.watch("school");

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <Card className="glass border-primary/20">
          <CardHeader className="pb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl gradient-btn flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold gradient-text">Complete Your Profile</CardTitle>
            </div>
            <CardDescription>Tell us about yourself to join the CampusX network.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-fullname"
                          placeholder="e.g. Adaeze Okonkwo"
                          className="bg-background/50 border-white/10 focus:border-primary/50"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* University (Searchable Combobox) */}
                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>University</FormLabel>
                      <Popover open={schoolOpen} onOpenChange={setSchoolOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              data-testid="btn-university-select"
                              variant="outline"
                              role="combobox"
                              aria-expanded={schoolOpen}
                              className={cn(
                                "w-full justify-between bg-background/50 border-white/10 hover:bg-background/70 font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value
                                ? UNIVERSITIES.find(u => u.value === field.value)?.label ?? field.value
                                : "Select University"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0 bg-card border-white/10" align="start">
                          <Command className="bg-transparent">
                            <CommandInput
                              data-testid="input-university-search"
                              placeholder="Search university..."
                              className="border-b border-white/10"
                            />
                            <CommandList>
                              <CommandEmpty>No university found.</CommandEmpty>
                              <CommandGroup>
                                {UNIVERSITIES.map((uni) => (
                                  <CommandItem
                                    key={uni.value}
                                    value={uni.value}
                                    onSelect={(val) => {
                                      field.onChange(val);
                                      setSchoolOpen(false);
                                    }}
                                    className="cursor-pointer hover:bg-primary/10"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === uni.value ? "opacity-100 text-primary" : "opacity-0"
                                      )}
                                    />
                                    {uni.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Campus Location */}
                <FormField
                  control={form.control}
                  name="campusLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger
                            data-testid="select-campus-location"
                            className="bg-background/50 border-white/10"
                          >
                            <SelectValue placeholder="Select Campus" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CAMPUS_LOCATIONS.map(loc => (
                            <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Level + Enrollment Status */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-level" className="bg-background/50 border-white/10">
                              <SelectValue placeholder="Select Level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {["100L", "200L", "300L", "400L", "500L"].map(lvl => (
                              <SelectItem key={lvl} value={lvl}>{lvl}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enrollmentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-enrollment" className="bg-background/50 border-white/10">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Full-Time">Full-Time</SelectItem>
                            <SelectItem value="Part-Time">Part-Time</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Faculty */}
                <FormField
                  control={form.control}
                  name="faculty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Faculty</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-faculty" className="bg-background/50 border-white/10">
                            <SelectValue placeholder="Select Faculty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            "Arts", "Science", "Law", "Social Sciences", "Education",
                            "Engineering", "Management Sciences", "Communication & Media Studies"
                          ].map(fac => (
                            <SelectItem key={fac} value={fac}>{fac}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Matric Number */}
                <FormField
                  control={form.control}
                  name="matricNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matriculation Number <span className="text-muted-foreground text-xs">(Private)</span></FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-matric"
                          placeholder="e.g. 200212345"
                          className="bg-background/50 border-white/10 font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  data-testid="button-submit-onboarding"
                  type="submit"
                  className="w-full gradient-btn h-12 mt-2"
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? "Saving..." : "Enter CampusX"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

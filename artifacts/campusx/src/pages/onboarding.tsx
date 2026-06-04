import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useGetMyProfile, useUpdateMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Vote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

const SCHOOLS = [
  "Lagos State University (LASU)",
  "University of Lagos (UNILAG)",
  "Lagos State University of Education (LASUED)",
  "My School is Not Listed",
] as const;

const NOT_LISTED = "My School is Not Listed";

const CAMPUS_LOCATIONS = [
  { value: "Ojo", label: "Ojo (Main Campus)" },
  { value: "Epe", label: "Epe Campus" },
  { value: "Ikeja", label: "Ikeja Campus" },
];

const formSchema = z
  .object({
    fullName: z.string().min(2, "Full name is required"),
    school: z.string().min(1, "School is required"),
    campusLocation: z.string().min(1, "Campus location is required"),
    level: z.string().min(1, "Level is required"),
    faculty: z.string().min(1, "Faculty is required"),
    enrollmentStatus: z.string().min(1, "Enrollment status is required"),
    matricNumber: z.string().default(""),
    campus: z.string().default("LASU Ojo"),
  })
  .superRefine((data, ctx) => {
    if (data.school !== NOT_LISTED && !data.matricNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Matriculation number is required",
        path: ["matricNumber"],
      });
    }
  });

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();
  const { data: profile, isLoading } = useGetMyProfile({ query: { retry: false, queryKey: getGetMyProfileQueryKey() } });
  const updateProfile = useUpdateMyProfile();

  const [voteSchool, setVoteSchool] = useState("");
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [voteCount, setVoteCount] = useState<number | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      school: "",
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

  const selectedSchool = form.watch("school");
  const isNotListed = selectedSchool === NOT_LISTED;

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateProfile.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        setLocation("/feed");
      }
    });
  };

  const handleVote = async () => {
    if (!voteSchool.trim() || !clerkUser) return;
    setVoteSubmitting(true);
    try {
      const res = await fetch("/api/school-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schoolName: voteSchool.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { votes: number };
        setVoteCount(data.votes);
        setVoted(true);
        toast({ title: "🗳️ Vote recorded!", description: `"${voteSchool.trim()}" now has ${data.votes} vote${data.votes !== 1 ? "s" : ""}.` });
      }
    } finally {
      setVoteSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

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

                {/* School */}
                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>School</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger
                            data-testid="select-school"
                            className="bg-background/50 border-white/10"
                          >
                            <SelectValue placeholder="Select your school" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SCHOOLS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* "Not Listed" vote box */}
                <AnimatePresence>
                  {isNotListed && (
                    <motion.div
                      key="vote-box"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <Vote className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            CampusX expands campus-by-campus! Enter your school name below to vote for your campus.{" "}
                            <span className="text-primary font-medium">The next campus with 500 votes gets unlocked next!</span>
                          </p>
                        </div>
                        {voted ? (
                          <div className="text-center py-2">
                            <p className="text-sm font-semibold text-primary">🎉 Your vote is in!</p>
                            {voteCount !== null && (
                              <p className="text-xs text-muted-foreground mt-1">
                                "{voteSchool}" — <span className="font-mono font-bold">{voteCount}</span> / 500 votes
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g. Yaba College of Technology (YABATECH)"
                              className="bg-background/50 border-white/10 focus:border-primary/50 text-sm flex-1"
                              value={voteSchool}
                              onChange={(e) => setVoteSchool(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleVote(); } }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="gradient-btn shrink-0 px-4"
                              disabled={!voteSchool.trim() || voteSubmitting}
                              onClick={() => void handleVote()}
                            >
                              {voteSubmitting ? "..." : "Vote"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Campus Location */}
                <FormField
                  control={form.control}
                  name="campusLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus Location</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger
                            data-testid="select-campus-location"
                            className="bg-background/50 border-white/10"
                          >
                            <SelectValue placeholder="Select campus" />
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

                {/* Level + Enrollment */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                      <FormLabel>Faculty / Department</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
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

                {/* Matric Number — hidden when "Not Listed" */}
                <AnimatePresence>
                  {!isNotListed && (
                    <motion.div
                      key="matric-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <FormField
                        control={form.control}
                        name="matricNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Matriculation Number{" "}
                              <span className="text-muted-foreground text-xs">(Private)</span>
                            </FormLabel>
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
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  data-testid="button-submit-onboarding"
                  type="submit"
                  className="w-full gradient-btn h-12 mt-2"
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? "Saving..." : "Enter CampusX →"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

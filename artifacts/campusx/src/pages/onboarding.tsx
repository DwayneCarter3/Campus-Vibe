import { useEffect, useId, useRef, useState } from "react";
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
import { CAMPUS_INSTITUTIONS, getInstitutionByName } from "@workspace/campus-institutions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type MatricClaimStatus = {
  id: number;
  institution: string;
  matricNumber: string;
  status: "pending" | "approved" | "rejected";
  adminDecisionNote?: string | null;
  createdAt: string;
};

const NOT_LISTED = "My School is Not Listed";
const OTHER_CAMPUS = "Other campus";
const OTHER_DEPARTMENT = "Other department";

interface SearchableSelectorProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
  testId: string;
}

function SearchableSelector({
  id,
  label,
  placeholder,
  value,
  options,
  disabled = false,
  onChange,
  testId,
}: SearchableSelectorProps) {
  const listboxId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const previousValue = useRef(value);
  const filteredOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (query === previousValue.current) setQuery(value);
    previousValue.current = value;
  }, [query, value]);

  const choose = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <Input
        id={id}
        data-testid={testId}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        className="mt-2 bg-background/50 border-white/10 focus:border-primary/50"
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index < 0 ? 0 : index + 1, Math.max(filteredOptions.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && filteredOptions[activeIndex < 0 ? 0 : activeIndex]) {
            event.preventDefault();
            choose(filteredOptions[activeIndex < 0 ? 0 : activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(value);
          }
        }}
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-white/10 bg-popover p-1 text-popover-foreground shadow-md">
          {filteredOptions.length ? (
            <div id={listboxId} role="listbox" aria-label={`${label} options`}>
              {filteredOptions.map((option, index) => (
                <div
                  id={`${listboxId}-option-${index}`}
                  key={option}
                  role="option"
                  aria-selected={option === value}
                  tabIndex={-1}
                  data-testid={`${testId}-option-${index}`}
                  className={`w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                    index === activeIndex ? "bg-accent text-accent-foreground" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  {option}
                </div>
              ))}
            </div>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              No matching options
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const formSchema = z
  .object({
    fullName: z.string().min(2, "Full name is required"),
    school: z.string().min(1, "School is required"),
    campusLocation: z.string().min(1, "Campus location is required"),
    level: z.enum(["", "100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"]),
    faculty: z.string().min(1, "Faculty is required"),
    enrollmentStatus: z.string().min(1, "Enrollment status is required"),
    matricNumber: z.string().default(""),
    campus: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.school !== NOT_LISTED && !data.matricNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Matriculation number is required",
        path: ["matricNumber"],
      });
    }
    if (data.level === "" && (!/^\d{2}/.test(data.matricNumber.trim()) || Number(data.matricNumber.trim().slice(0, 2)) > 25)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Automatic level needs a matric number starting with a valid two-digit entry year",
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
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimInstitution, setClaimInstitution] = useState("");
  const [claimMatricNumber, setClaimMatricNumber] = useState("");
  const [claimDocumentType, setClaimDocumentType] = useState<"student-id" | "course-form">("student-id");
  const [claimEvidenceFile, setClaimEvidenceFile] = useState<File | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimStatuses, setClaimStatuses] = useState<MatricClaimStatus[]>([]);
  const [claimStatusError, setClaimStatusError] = useState("");

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
      campus: "",
    },
  });

  useEffect(() => {
    if (profile?.id) {
      setLocation("/feed");
    }
  }, [profile, setLocation]);

  const selectedSchool = form.watch("school");
  const isNotListed = selectedSchool === NOT_LISTED;
  const selectedInstitution = getInstitutionByName(selectedSchool);
  const campusOptions = selectedInstitution?.campuses ?? (isNotListed ? [OTHER_CAMPUS] : []);
  const facultyOptions = selectedInstitution
    ? [...selectedInstitution.faculties, OTHER_DEPARTMENT]
    : isNotListed
      ? [OTHER_DEPARTMENT]
      : [];

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateProfile.mutate({ data: { ...values, campus: values.campusLocation } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        setLocation("/feed");
      },
      onError: (error) => {
        const apiError = error as unknown as { status?: number; data?: { error?: string; code?: string } };
        if (
          apiError.status === 409 &&
          (apiError.data?.code === "MATRIC_CONFLICT" ||
            apiError.data?.error?.toLowerCase().includes("matriculation number"))
        ) {
          setClaimInstitution(values.school);
          setClaimMatricNumber(values.matricNumber.trim());
          setClaimEvidenceFile(null);
          setClaimDialogOpen(true);
          return;
        }
        alert("Could not save your profile. Please check your details and try again.");
      },
    });
  };

  useEffect(() => {
    if (!claimDialogOpen) return;
    let active = true;
    fetch("/api/matric-claims/mine", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        return await response.json() as { claims: MatricClaimStatus[] };
      })
      .then((data) => {
        if (active) {
          setClaimStatuses(data.claims ?? []);
          setClaimStatusError("");
        }
      })
      .catch(() => {
        if (active) setClaimStatusError("Could not load previous claim statuses.");
      });
    return () => { active = false; };
  }, [claimDialogOpen]);

  const submitMatricClaim = async () => {
    if (!claimEvidenceFile || !claimInstitution || !claimMatricNumber) return;
    if (claimEvidenceFile.size > 10 * 1024 * 1024) {
      toast({ title: "Evidence file is too large", description: "Choose a PDF or image up to 10 MB.", variant: "destructive" });
      return;
    }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(claimEvidenceFile.type)) {
      toast({ title: "Unsupported evidence file", description: "Choose a PDF, JPEG, PNG, or WebP image.", variant: "destructive" });
      return;
    }

    setClaimSubmitting(true);
    try {
      const uploadResponse = await fetch("/api/matric-claims/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: claimEvidenceFile.name,
          size: claimEvidenceFile.size,
          contentType: claimEvidenceFile.type,
          documentType: claimDocumentType,
        }),
      });
      const uploadData = await uploadResponse.json() as { uploadURL?: string; objectPath?: string; error?: string };
      if (!uploadResponse.ok || !uploadData.uploadURL || !uploadData.objectPath) {
        throw new Error(uploadData.error || "Could not prepare the private evidence upload.");
      }
      const directUploadResponse = await fetch(uploadData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": claimEvidenceFile.type },
        body: claimEvidenceFile,
        credentials: "omit",
      });
      if (!directUploadResponse.ok) throw new Error("Evidence upload failed. Please try again.");

      const claimResponse = await fetch("/api/matric-claims", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matricNumber: claimMatricNumber,
          institution: claimInstitution,
          evidenceObjectPath: uploadData.objectPath,
        }),
      });
      const claimData = await claimResponse.json() as { error?: string };
      if (!claimResponse.ok) throw new Error(claimData.error || "Could not submit your claim.");
      toast({ title: "Claim submitted for review", description: "Your account and matric details remain unchanged while the report is reviewed." });
      setClaimEvidenceFile(null);
      const statusResponse = await fetch("/api/matric-claims/mine", { credentials: "include" });
      if (statusResponse.ok) {
        const statusData = await statusResponse.json() as { claims: MatricClaimStatus[] };
        setClaimStatuses(statusData.claims ?? []);
      }
    } catch (error) {
      toast({
        title: "Could not submit claim",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setClaimSubmitting(false);
    }
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
                      <FormControl>
                        <SearchableSelector
                          id="school"
                          label="School"
                          placeholder="Search your institution"
                          value={field.value}
                          options={[...CAMPUS_INSTITUTIONS.map((institution) => institution.name), NOT_LISTED]}
                          testId="select-school"
                          onChange={(value) => {
                            field.onChange(value);
                            form.setValue("campusLocation", "", { shouldValidate: true });
                            form.setValue("faculty", "", { shouldValidate: true });
                          }}
                        />
                      </FormControl>
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
                      <FormControl>
                        <SearchableSelector
                          id="campus-location"
                          label="Campus Location"
                          placeholder={selectedSchool ? "Search campus locations" : "Select a school first"}
                          value={field.value}
                          options={campusOptions}
                          disabled={!selectedSchool}
                          testId="select-campus-location"
                          onChange={(value) => {
                            field.onChange(value);
                            form.setValue("faculty", "", { shouldValidate: true });
                          }}
                        />
                      </FormControl>
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
                        <Select onValueChange={(value) => field.onChange(value === "automatic" ? "" : value)} value={field.value || "automatic"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-level" className="bg-background/50 border-white/10">
                              <SelectValue placeholder="Select Level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="automatic">Automatic (from matric number)</SelectItem>
                            {["100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"].map(lvl => (
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
                      <FormControl>
                        <SearchableSelector
                          id="faculty"
                          label="Faculty / School / Department"
                          placeholder={field.value ? field.value : "Select a campus first"}
                          value={field.value}
                          options={facultyOptions}
                          disabled={!form.watch("campusLocation")}
                          testId="select-faculty"
                          onChange={field.onChange}
                        />
                      </FormControl>
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
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="glass border-primary/20 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Claim Account / Report Fraud</DialogTitle>
            <DialogDescription>
              This matric number is already registered. Send private proof for review. Filing a claim does not transfer or change either account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-background/40 p-3 text-sm">
              <p><span className="text-muted-foreground">Institution:</span> {claimInstitution}</p>
              <p className="mt-1"><span className="text-muted-foreground">Matric number:</span> <span className="font-mono">{claimMatricNumber}</span></p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-document-type">Evidence type</Label>
              <Select value={claimDocumentType} onValueChange={(value) => setClaimDocumentType(value as "student-id" | "course-form")}>
                <SelectTrigger id="claim-document-type" className="bg-background/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student-id">Student ID</SelectItem>
                  <SelectItem value="course-form">Course form</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-evidence-file">Private proof (PDF or image, up to 10 MB)</Label>
              <Input
                id="claim-evidence-file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="bg-background/50 border-white/10 file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1 file:text-xs"
                onChange={(event) => setClaimEvidenceFile(event.target.files?.[0] ?? null)}
              />
              {claimEvidenceFile && <p className="text-xs text-muted-foreground">{claimEvidenceFile.name} · {(claimEvidenceFile.size / (1024 * 1024)).toFixed(2)} MB</p>}
            </div>
            {claimStatusError && <p role="alert" className="text-sm text-rose-300">{claimStatusError}</p>}
            {claimStatuses.length > 0 && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-sm font-semibold">Your claim status</p>
                {claimStatuses.map((claim) => (
                  <div key={claim.id} className="rounded-lg bg-background/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{claim.institution}</span>
                      <span className={claim.status === "pending" ? "text-amber-300" : claim.status === "approved" ? "text-emerald-300" : "text-rose-300"}>
                        {claim.status === "pending" ? "Under review" : claim.status === "approved" ? "Reviewed" : "Not approved"}
                      </span>
                    </div>
                    {claim.adminDecisionNote && <p className="mt-1 text-xs text-muted-foreground">{claim.adminDecisionNote}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setClaimDialogOpen(false)}>Close</Button>
              <Button
                type="button"
                className="gradient-btn"
                disabled={!claimEvidenceFile || claimSubmitting || claimStatuses.some((claim) => claim.status === "pending" && claim.institution.toLowerCase() === claimInstitution.toLowerCase() && claim.matricNumber.replace(/\s+/g, "").toUpperCase() === claimMatricNumber.replace(/\s+/g, "").toUpperCase())}
                onClick={() => void submitMatricClaim()}
              >
                {claimSubmitting ? "Uploading securely…" : "Submit claim"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useRef } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useGetUserPosts,
  getGetUserPostsQueryKey,
  useGetUserServices,
  getGetUserServicesQueryKey,
  useRequestUploadUrl,
  useClaimAdmin,
  useInitializePayment,
} from "@workspace/api-client-react";
import type { PaymentPackage, UpdateProfileBodyLevel } from "@workspace/api-client-react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Lock,
  LogOut,
  GraduationCap,
  MapPin,
  Pencil,
  ShieldCheck,
  FileText,
  Briefcase,
  Camera,
  Loader2,
  Crown,
  Star,
  Settings,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { PostCard } from "@/components/post-card";
import { ServiceCard } from "@/components/service-card";
import { CampusTitleBadge } from "@/components/campus-title-badge";
import { VerificationBadge } from "@/components/verification-badge";
import { AvatarModal } from "@/components/avatar-modal";
import { cn } from "@/lib/utils";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";

type Tab = "posts" | "hustles";

export default function MyProfilePage() {
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [editOpen, setEditOpen] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editLevel, setEditLevel] = useState<UpdateProfileBodyLevel>("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [legalOpen, setLegalOpen] = useState<"privacy" | "terms" | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const requestUploadUrl = useRequestUploadUrl();
  const claimAdmin = useClaimAdmin();
  const initializePayment = useInitializePayment();

  const { data: profile, isLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  const updateProfile = useUpdateMyProfile();

  const userId = clerkUser?.id ?? "";

  const startPayment = (packageType: PaymentPackage) => {
    initializePayment.mutate(
      { data: { packageType } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          if (result.requiresPayment && result.authorizationUrl) {
            window.location.assign(result.authorizationUrl);
            return;
          }
          alert(result.message ?? "Your CampusX benefit is now active.");
        },
        onError: (error) => {
          alert(error instanceof Error ? error.message : "Could not start payment.");
        },
      },
    );
  };

  const { data: postsData, isLoading: postsLoading } = useGetUserPosts(userId, undefined, {
    query: { queryKey: getGetUserPostsQueryKey(userId), enabled: !!userId && activeTab === "posts" },
  });

  const { data: servicesData, isLoading: servicesLoading } = useGetUserServices(userId, undefined, {
    query: { queryKey: getGetUserServicesQueryKey(userId), enabled: !!userId && activeTab === "hustles" },
  });

  const handleLogout = async () => {
    await clerk.signOut();
    setLocation("/");
  };

  const openEdit = () => {
    setEditBio(profile?.bio ?? "");
    const savedLevel = profile?.manualLevel ?? "";
    setEditLevel((["", "100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"].includes(savedLevel) ? savedLevel : "") as UpdateProfileBodyLevel);
    setEditAvatarUrl(profile?.avatarUrl ?? "");
    setEditOpen(true);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAvatarUploading(true);
    try {
      const uploadData = await requestUploadUrl.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      await fetch(uploadData.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      setEditAvatarUrl(`/api/storage${uploadData.objectPath}`);
    } catch {
      // ignore
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleClaimAdmin = () => {
    claimAdmin.mutate(undefined, {
      onSuccess: (res) => {
        alert(res.message);
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      },
      onError: () => {
        alert("An admin already exists. You cannot claim this role.");
      },
    });
  };

  const handleSaveEdit = () => {
    if (!profile) return;
    updateProfile.mutate(
      { data: { bio: editBio || null, avatarUrl: editAvatarUrl || null, level: editLevel } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setEditOpen(false);
        },
        onError: () => alert("Could not save your profile. Please try again."),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex gap-6 items-center">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-3 flex-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profile) return null;

  const hasMatric = !!(profile.matricNumber && profile.matricNumber.trim());
  const CEO_EMAIL = "dwaynecartergabriel@gmail.com";
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const effectiveIsAdmin = profile.isAdmin || clerkEmail === CEO_EMAIL;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-24">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

        {/* ── Identity Header ─────────────────────────────── */}
        <div className="glass rounded-3xl p-6 border border-white/5">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">

            <div className="relative shrink-0 cursor-pointer group/avatar" onClick={() => setAvatarModalOpen(true)}>
              <Avatar className="h-20 w-20 border-2 border-primary/30 shadow-lg group-hover/avatar:border-primary/60 transition-colors">
                <AvatarImage src={profile.avatarUrl || undefined} />
                <AvatarFallback className="text-2xl gradient-text font-bold">
                  {profile.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover/avatar:bg-black/20 transition-colors flex items-center justify-center">
                <Camera className="h-5 w-5 text-white opacity-0 group-hover/avatar:opacity-80 transition-opacity" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold inline-flex items-center gap-1.5">
                  {profile.fullName}
                  {["approved", "Student_Verified", "Premium_Approved"].includes(profile.verificationStatus) && (
                    <VerificationBadge size="lg" />
                  )}
                </h1>
                {profile.verificationStatus === "Premium_Approved" && (
                  <Badge className="text-[10px] bg-blue-500/20 text-blue-200 border border-blue-400/40">
                    Premium Blue Tick
                  </Badge>
                )}
                {profile.campusTitle && (
                  <CampusTitleBadge title={profile.campusTitle} role={profile.role ?? undefined} />
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">{profile.level}</Badge>
                <Badge variant="secondary" className="text-xs">{profile.faculty}</Badge>
                <Badge variant="secondary" className="text-xs">{profile.enrollmentStatus}</Badge>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {profile.campusLocation} Campus
                </span>
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-3 w-3" /> {profile.school}
                </span>
              </div>

              {profile.bio && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{profile.bio}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="border-white/15 hover:border-primary/40 text-sm"
                onClick={openEdit}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
              </Button>
              <Button
                data-testid="button-logout"
                variant="outline"
                size="sm"
                className="border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign Out
              </Button>
            </div>
          </div>
        </div>

        {/* ── Private Data Section (owner-only) ───────────── */}
        <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-full bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
              <Lock className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <span className="text-sm font-semibold text-orange-300">Private Information — Only visible to you</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-background/40 rounded-xl p-4 border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">Matriculation Number</span>
              <span
                data-testid="text-matric-number"
                className="font-mono text-lg font-bold tracking-widest"
              >
                {profile.matricNumber || <span className="text-muted-foreground text-sm font-normal">Not set</span>}
              </span>
            </div>
            <div className="bg-background/40 rounded-xl p-4 border border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">Enrollment Status</span>
              <span className="font-semibold text-sm">{profile.enrollmentStatus}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            Your matric number is encrypted and never shared publicly. It is used only to grant your Verified Student badge.
          </p>
        </div>

        {/* ── Early Bird Promo Banner ────────────────────── */}
        {profile.promoExpiresAt && new Date(profile.promoExpiresAt) > new Date() && (() => {
          const msLeft = new Date(profile.promoExpiresAt!).getTime() - Date.now();
          const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
          const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          return (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 flex items-center gap-3">
              <div className="text-2xl shrink-0">🎉</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-300">Early Bird Launch Perk — Active</p>
                <p className="text-[11px] text-amber-200/70 mt-0.5">
                  Free Blue Tick + Unlimited Hustle Promotions
                </p>
                <p className="text-[11px] text-amber-400 font-semibold mt-1">
                  ⏳ Expires in {daysLeft}d {hoursLeft}h
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-amber-300/60 font-medium">Registrant</div>
                <div className="text-lg font-black text-amber-400">#{profile.registrationRank}</div>
                <div className="text-[10px] text-amber-300/60">of first 100</div>
              </div>
            </div>
          );
        })()}

        {/* ── Badge Request Section ──────────────────────── */}
        {hasMatric && !["approved", "Student_Verified", "Premium_Approved"].includes(profile.verificationStatus) && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Star className="h-4 w-4 text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-sky-200">Verified Student Badge</p>
                 <p className="text-[11px] text-muted-foreground">
                   {["pending", "Student_Pending", "pending_promo", "pending_paid", "Premium_Pending_Approval"].includes(profile.verificationStatus)
                    ? "Your badge request is pending admin review."
                     : profile.promoExpiresAt
                       ? "Request your free blue verification badge while your launch perk is active."
                       : "The launch perk has ended. Request a paid verification tier to renew."}
                </p>
              </div>
            </div>
            {profile.verificationStatus === "none" && (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
                  onClick={() => startPayment("student_verification")}
                  disabled={initializePayment.isPending}
                >
                  {initializePayment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : profile.promoExpiresAt ? "Claim Free" : "Verify · ₦1,500"}
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-blue-600/80 hover:bg-blue-600 text-white shadow-[0_0_14px_rgba(37,99,235,0.3)]"
                  onClick={() => startPayment("premium_blue_tick")}
                  disabled={initializePayment.isPending}
                >
                  Premium · ₦5,000
                </Button>
              </div>
            )}
             {["pending", "Student_Pending", "pending_promo", "pending_paid", "Premium_Pending_Approval"].includes(profile.verificationStatus) && (
              <Badge className="shrink-0 text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/25">Pending</Badge>
            )}
          </div>
        )}

        {hasMatric && profile.verificationStatus === "Premium_Pending_Approval" && (
          <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4 flex items-center gap-3 shadow-[0_0_20px_rgba(37,99,235,0.12)]">
            <Star className="h-5 w-5 text-blue-300 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-200">Premium Blue Tick payment received</p>
              <p className="text-[11px] text-blue-200/70 mt-0.5">An admin will review your student details before activating the glowing badge.</p>
            </div>
          </div>
        )}

        {servicesData?.services && servicesData.services.length > 0 && (
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-violet-200">Promote your Hustle</p>
                <p className="text-[11px] text-muted-foreground">Boost marketplace visibility for 30 days · ₦1,500</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-violet-400/30 text-violet-200 hover:bg-violet-500/15 text-xs"
              onClick={() => startPayment("marketplace_promotion")}
              disabled={initializePayment.isPending}
            >
              Promote
            </Button>
          </div>
        )}

        {/* ── Admin Section ──────────────────────────────── */}
        {effectiveIsAdmin ? (
          <button
            onClick={() => setLocation("/admin")}
            className="w-full text-left rounded-2xl border border-primary/25 bg-primary/5 p-4 flex items-center gap-3 hover:bg-primary/10 hover:border-primary/40 transition-all group"
          >
            <div className="h-9 w-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition-colors">
              <Crown className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">
                {(profile.role === "ceo" || clerkEmail === CEO_EMAIL) ? "CEO Control Panel" : "Campus Admin Panel"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {(profile.role === "ceo" || clerkEmail === CEO_EMAIL)
                  ? "Manage roles, approve badges, view all users →"
                  : "Approve student verification badges →"}
              </p>
            </div>
            <div className="text-primary/50 group-hover:text-primary transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </button>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-background/40 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Crown className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Claim Admin Role</p>
                <p className="text-[11px] text-muted-foreground">First-come, first-served. Only one admin per campus.</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 text-xs shrink-0"
              onClick={handleClaimAdmin}
              disabled={claimAdmin.isPending}
            >
              {claimAdmin.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Become Admin"}
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Settings & legal</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-white/10 text-xs" onClick={() => setLegalOpen("privacy")}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Privacy Policy
            </Button>
            <Button variant="outline" size="sm" className="border-white/10 text-xs" onClick={() => setLegalOpen("terms")}>
              <ScrollText className="h-3.5 w-3.5 mr-1.5" /> Terms of Service
            </Button>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────── */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/5">
          {([
            { id: "posts",   label: "Gist History",   icon: FileText,  count: postsData?.total },
            { id: "hustles", label: "Active Hustles",  icon: Briefcase, count: servicesData?.total },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                  activeTab === tab.id ? "bg-white/20" : "bg-white/10"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────── */}
        {activeTab === "posts" && (
          <div>
            {postsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                ))}
              </div>
            ) : postsData?.posts.length === 0 ? (
              <EmptyTabState icon="🎙️" message="No gist posted yet." sub="Your campus posts will appear here." />
            ) : (
              <div className="space-y-1">
                {postsData?.posts.map((post) => (
                  <PostCard key={post.id} post={post} isAdmin={profile?.isAdmin} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "hustles" && (
          <div>
            {servicesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-2xl" />
                ))}
              </div>
            ) : servicesData?.services.length === 0 ? (
              <EmptyTabState icon="💼" message="No active hustles yet." sub="Post a service in the Marketplace." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servicesData?.services.map((s, i) => (
                  <ServiceCard key={s.id} service={s} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Edit Profile Dialog ─────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px] glass border-primary/20 p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 to-transparent p-6 border-b border-white/5">
            <DialogHeader>
              <DialogTitle className="gradient-text font-bold">Edit Profile</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Update your photo, academic level, and bio.</p>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Profile Photo</Label>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14 border-2 border-primary/30 shrink-0">
                  <AvatarImage src={editAvatarUrl || undefined} />
                  <AvatarFallback className="gradient-text font-bold">
                    {profile.fullName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-xs w-full"
                    onClick={() => avatarFileRef.current?.click()}
                    disabled={isAvatarUploading}
                  >
                    {isAvatarUploading ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                    ) : (
                      <><Camera className="h-3.5 w-3.5 mr-1.5" /> {editAvatarUrl ? "Change Photo" : "Upload Photo"}</>
                    )}
                  </Button>
                  {editAvatarUrl && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-destructive mt-1 w-full text-center"
                      onClick={() => setEditAvatarUrl("")}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-level" className="text-sm font-medium">Level</Label>
              <Select value={editLevel || "automatic"} onValueChange={(value) => setEditLevel(value === "automatic" ? "" : value as UpdateProfileBodyLevel)}>
                <SelectTrigger id="edit-level" className="bg-background/40 border-white/10">
                  <SelectValue placeholder="Select Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic (from matric number)</SelectItem>
                  {["100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"].map((level) => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Automatic follows the 2025/26 academic session using the first two digits of your matric number.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Bio</Label>
              <Textarea
                placeholder="Tell your fellow LASU students a bit about yourself..."
                className="bg-background/40 border-white/10 focus:border-primary/40 resize-none min-h-[90px]"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSaveEdit}
                className="flex-1 gradient-btn h-10 font-semibold"
                disabled={updateProfile.isPending || isAvatarUploading}
              >
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" className="border-white/10" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AvatarModal
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        avatarUrl={profile.avatarUrl}
        name={profile.fullName}
      />

      <Dialog open={legalOpen !== null} onOpenChange={(open) => !open && setLegalOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85dvh] bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>{legalOpen === "privacy" ? "Privacy Policy" : "Terms of Service"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65dvh] overflow-y-auto rounded-xl bg-background/40 border border-white/5 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
              {legalOpen === "privacy" ? PRIVACY_POLICY : TERMS_OF_SERVICE}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyTabState({ icon, message, sub }: { icon: string; message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center border border-dashed border-white/10 rounded-2xl">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="font-semibold text-foreground/80">{message}</p>
      <p className="text-sm text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

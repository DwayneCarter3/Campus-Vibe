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
} from "@workspace/api-client-react";
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
} from "lucide-react";
import { motion } from "framer-motion";
import { PostCard } from "@/components/post-card";
import { ServiceCard } from "@/components/service-card";
import { cn } from "@/lib/utils";

type Tab = "posts" | "hustles";

export default function MyProfilePage() {
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const requestUploadUrl = useRequestUploadUrl();
  const claimAdmin = useClaimAdmin();

  const { data: profile, isLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  const updateProfile = useUpdateMyProfile();

  const userId = clerkUser?.id ?? "";

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
      { data: { bio: editBio || null, avatarUrl: editAvatarUrl || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          setEditOpen(false);
        },
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

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-24">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

        {/* ── Identity Header ─────────────────────────────── */}
        <div className="glass rounded-3xl p-6 border border-white/5">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">

            <div className="relative shrink-0">
              <Avatar className="h-20 w-20 border-2 border-primary/30 shadow-lg">
                <AvatarImage src={profile.avatarUrl || undefined} />
                <AvatarFallback className="text-2xl gradient-text font-bold">
                  {profile.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {hasMatric && (
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                  <ShieldCheck className="h-3 w-3 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold">{profile.fullName}</h1>
                {hasMatric && (
                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-0.5">
                    <ShieldCheck className="h-2.5 w-2.5" /> Verified
                  </Badge>
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

        {/* ── Admin Section ──────────────────────────────── */}
        {profile.isAdmin ? (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Crown className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Campus Admin</p>
              <p className="text-[11px] text-muted-foreground">You can pin posts to the main feed.</p>
            </div>
          </div>
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
              <EmptyTabState icon="💼" message="No active hustles yet." sub="Post a service in the Earn Legally marketplace." />
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
              <p className="text-sm text-muted-foreground mt-1">Update your bio and profile photo URL.</p>
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

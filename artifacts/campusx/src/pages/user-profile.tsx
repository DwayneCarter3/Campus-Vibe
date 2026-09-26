import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetUserProfile,
  getGetUserProfileQueryKey,
  useGetUserPosts,
  getGetUserPostsQueryKey,
  useGetUserServices,
  getGetUserServicesQueryKey,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { ShieldCheck, MapPin, GraduationCap, FileText, Briefcase, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { PostCard } from "@/components/post-card";
import { ServiceCard } from "@/components/service-card";
import { cn } from "@/lib/utils";
import { UserVerificationMarks } from "@/components/user-verification-marks";

type Tab = "posts" | "hustles";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const { user: clerkUser } = useUser();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("posts");

  const { data: profile, isLoading, error } = useGetUserProfile(userId, {
    query: { queryKey: getGetUserProfileQueryKey(userId), enabled: !!userId },
  });

  const { data: postsData, isLoading: postsLoading } = useGetUserPosts(userId, undefined, {
    query: { queryKey: getGetUserPostsQueryKey(userId), enabled: !!userId && activeTab === "posts" },
  });

  const { data: servicesData, isLoading: servicesLoading } = useGetUserServices(userId, undefined, {
    query: { queryKey: getGetUserServicesQueryKey(userId), enabled: !!userId && activeTab === "hustles" },
  });

  // Redirect to own profile if viewing yourself
  if (clerkUser && clerkUser.id === userId) {
    navigate("/profile");
    return null;
  }

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

  if (error || !profile) {
    return (
      <div className="p-20 text-center text-muted-foreground">
        <div className="text-4xl mb-4">👤</div>
        <p className="font-semibold">Student not found</p>
        <Link href="/feed">
          <Button variant="outline" className="mt-4 border-white/10">Back to Feed</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-24">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

        {/* Back nav */}
        <button
          onClick={() => history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* ── Identity Header ─────────────────────────────── */}
        <div className="glass rounded-3xl p-6 border border-white/5">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">

            <div className="relative shrink-0">
              <Avatar className="h-20 w-20 border-2 border-white/10 shadow-lg">
                <AvatarImage src={profile.avatarUrl || undefined} />
                <AvatarFallback className="text-2xl gradient-text font-bold">
                  {profile.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-xl font-bold inline-flex items-center gap-1.5">
                  {profile.fullName}
                </h1>
                <UserVerificationMarks status={profile.verificationStatus} />
              </div>
              {(profile.username || profile.department) && (
                <p className="text-xs text-muted-foreground mb-2">
                  {[profile.username ? `@${profile.username}` : null, profile.department].filter(Boolean).join(" · ")}
                </p>
              )}

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
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed border-t border-white/5 pt-3">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────── */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/5">
          {([
            { id: "posts",   label: "Gist History",  icon: FileText,  count: postsData?.total },
            { id: "hustles", label: "Active Hustles", icon: Briefcase, count: servicesData?.total },
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
              <EmptyTabState icon="🎙️" message="No gist from this student yet." />
            ) : (
              <div className="space-y-1">
                {postsData?.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
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
              <EmptyTabState icon="💼" message="No active hustles listed." />
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
    </div>
  );
}

function EmptyTabState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center border border-dashed border-white/10 rounded-2xl">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="font-semibold text-foreground/80">{message}</p>
    </div>
  );
}

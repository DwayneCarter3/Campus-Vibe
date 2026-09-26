import { useEffect, useState } from "react";
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useUpdateUserRole,
  useListPendingVerifications,
  getListPendingVerificationsQueryKey,
  useApproveBadge,
  useRejectBadge,
  useSetUserVerification,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useListPosts,
  getListPostsQueryKey,
  useClaimAdmin,
  useListAdminReports,
  getListAdminReportsQueryKey,
  useReviewAdminReport,
  useDeletePost,
  useDeleteService,
} from "@workspace/api-client-react";
import type { AdminUserItem, PendingVerificationItem, ReportItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, CheckCircle, Crown, Search, ShieldCheck, Lock, FileText, Flag, Trash2, Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { PostCard } from "@/components/post-card";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

type AdminTab = "users" | "verifications" | "posts" | "reports" | "claims" | "ads";
type AdminAdCampaign = {
  id: number;
  ownerClerkUserId: string;
  paymentReference: string;
  packageType: string;
  title: string;
  body: string;
  destinationUrl: string;
  school: string;
  campusLocation: string;
  status: "pending";
  expiresAt: string;
  createdAt: string;
};
type MatricClaimItem = {
  id: number;
  claimantClerkId: string;
  existingAccountId: number;
  matricNumber: string;
  institution: string;
  evidenceType: "student-id" | "course-form";
  evidenceObjectPath: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const CEO_EMAIL = "dwaynecartergabriel@gmail.com";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReportItem | null>(null);
  const [matricClaims, setMatricClaims] = useState<MatricClaimItem[]>([]);
  const [matricClaimsLoading, setMatricClaimsLoading] = useState(false);
  const [matricClaimsError, setMatricClaimsError] = useState("");
  const [claimDecisionNotes, setClaimDecisionNotes] = useState<Record<number, string>>({});
  const [claimActionId, setClaimActionId] = useState<number | null>(null);
  const [pendingAds, setPendingAds] = useState<AdminAdCampaign[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState("");
  const [adDecisionId, setAdDecisionId] = useState<number | null>(null);
  const [adRejectionReasons, setAdRejectionReasons] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();

  const { data: profile, isLoading: profileLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const isCEO = profile?.role === "ceo" || clerkEmail === CEO_EMAIL;
  const isAdminOrCEO = isCEO || profile?.role === "admin";
  const isModerator = profile?.role === "moderator";
  const displayedTab = isModerator && !isAdminOrCEO && activeTab !== "posts" ? "posts" : activeTab;
  useEffect(() => {
    if (!isAdminOrCEO || activeTab !== "claims") return;
    let active = true;
    setMatricClaimsLoading(true);
    fetch("/api/admin/matric-claims?status=pending", { credentials: "include" })
      .then(async (response) => {
        const data = await response.json() as { claims?: MatricClaimItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load claims.");
        return data;
      })
      .then((data) => {
        if (active) {
          setMatricClaims(data.claims ?? []);
          setMatricClaimsError("");
        }
      })
      .catch((error) => {
        if (active) setMatricClaimsError(error instanceof Error ? error.message : "Could not load claims.");
      })
      .finally(() => { if (active) setMatricClaimsLoading(false); });
    return () => { active = false; };
  }, [isAdminOrCEO, activeTab]);
  useEffect(() => {
    if (!isAdminOrCEO || activeTab !== "ads") return;
    let active = true;
    const loadPendingAds = async () => {
      try {
        const response = await fetch("/api/admin/ads", { credentials: "include" });
        const data = await response.json() as { campaigns?: AdminAdCampaign[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load campaigns.");
        if (active) {
          setPendingAds(data.campaigns ?? []);
          setAdsError("");
        }
      } catch (error) {
        if (active) setAdsError(error instanceof Error ? error.message : "Could not load campaigns.");
      } finally {
        if (active) setAdsLoading(false);
      }
    };
    setAdsLoading(true);
    void loadPendingAds();
    const refreshInterval = window.setInterval(() => void loadPendingAds(), 15_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, [isAdminOrCEO, activeTab]);
  const { data: reportsData, isLoading: reportsLoading, isError: reportsError, refetch: refetchReports } = useListAdminReports({
    query: { queryKey: getListAdminReportsQueryKey(), enabled: isAdminOrCEO, refetchOnMount: "always", refetchInterval: 15000 },
  });
  const reviewReport = useReviewAdminReport();
  const deletePost = useDeletePost();
  const deleteService = useDeleteService();
  const pendingReports = reportsData?.reports.filter((report) => report.status === "pending") ?? [];
  const review = (report: ReportItem, status: "dismissed" | "reviewed") => {
    reviewReport.mutate({ reportId: report.id, data: { status } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAdminReportsQueryKey() }); toast({ title: status === "dismissed" ? "Report dismissed" : "Report marked reviewed" }); },
      onError: () => toast({ title: "Could not update report", variant: "destructive" }),
    });
  };
  const removeReportedContent = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.postId != null) {
        await deletePost.mutateAsync({ postId: deleteTarget.postId });
        await queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      } else if (deleteTarget.serviceId != null) {
        await deleteService.mutateAsync({ serviceId: deleteTarget.serviceId });
        await queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0].startsWith("/api/services") || q.queryKey[0].includes("/services")) });
      } else {
        throw new Error("Missing target");
      }
      queryClient.invalidateQueries({ queryKey: getListAdminReportsQueryKey() });
      toast({ title: "Content and associated reports removed" });
      setDeleteTarget(null);
    } catch {
      queryClient.invalidateQueries({ queryKey: getListAdminReportsQueryKey() });
      toast({ title: "Could not complete removal. Please check the report and try again.", variant: "destructive" });
    }
  };

  const { data: postsData, isLoading: postsLoading } = useListPosts(undefined, {
    query: {
      queryKey: getListPostsQueryKey(),
      enabled: (isAdminOrCEO || isModerator) && displayedTab === "posts",
    },
  });

  const { data: usersData, isLoading: usersLoading } = useListAdminUsers(
    { search: search || undefined },
    {
      query: {
        queryKey: getListAdminUsersQueryKey({ search: search || undefined }),
        enabled: isAdminOrCEO,
        refetchOnMount: "always",
      },
    }
  );

  const { data: pendingData, isLoading: pendingLoading } = useListPendingVerifications({
    query: {
      queryKey: getListPendingVerificationsQueryKey(),
      enabled: isAdminOrCEO,
      refetchOnMount: "always",
      refetchInterval: 15000,
    },
  });

  const updateRole = useUpdateUserRole();
  const approveBadge = useApproveBadge();
  const rejectBadge = useRejectBadge();
  const setUserVerification = useSetUserVerification();
  const claimAdmin = useClaimAdmin();

  if (profileLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (!isAdminOrCEO && !isModerator) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-xl text-center">
        <Lock className="h-16 w-16 mx-auto mb-4 text-primary/40" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm">This area is for CampusX admins and moderators only.</p>
        <Button
          variant="outline"
          className="mt-5 border-white/10"
          disabled={claimAdmin.isPending}
          onClick={() => claimAdmin.mutate(undefined, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }),
            onError: () => toast({ title: "An admin already exists. You cannot claim this role.", variant: "destructive" }),
          })}
        >
          {claimAdmin.isPending ? "Checking…" : "Claim first admin role"}
        </Button>
        <Button className="mt-6 gradient-btn" onClick={() => setLocation("/feed")}>Back to Feed</Button>
      </div>
    );
  }

  const handleRoleChange = (userId: string, role: string) => {
    updateRole.mutate(
      { userId, data: { role: role as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        },
        onError: () => toast({ title: "Could not change the user's role", variant: "destructive" }),
      }
    );
  };

  const handleApprove = (userId: string) => {
    approveBadge.mutate(
      { userId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        },
        onError: () => toast({ title: "Could not approve verification", variant: "destructive" }),
      }
    );
  };

  const handleVerificationToggle = (userId: string, verified: boolean) => {
    setUserVerification.mutate(
      { userId, data: { verified: !verified, ...(!verified ? { badgeTier: "student" } : {}) } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        },
        onError: () => toast({ title: "Could not update verification", variant: "destructive" }),
      },
    );
  };

  const handleReject = (userId: string) => {
    rejectBadge.mutate(
      { userId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        },
        onError: () => toast({ title: "Could not reject verification", variant: "destructive" }),
      },
    );
  };

  const ROLE_COLORS: Record<string, string> = {
    ceo: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    moderator: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    student: "bg-white/10 text-foreground/60 border-white/10",
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    ...(isAdminOrCEO ? [{ id: "users" as AdminTab, label: "All Users", icon: <Users className="h-4 w-4" /> }] : []),
    ...(isAdminOrCEO ? [{ id: "verifications" as AdminTab, label: "Pending Verifications", icon: <CheckCircle className="h-4 w-4" /> }] : []),
    { id: "posts", label: "Moderate Posts", icon: <FileText className="h-4 w-4" /> },
    ...(isAdminOrCEO ? [{ id: "reports" as AdminTab, label: "Reports", icon: <Flag className="h-4 w-4" /> }] : []),
    ...(isAdminOrCEO ? [{ id: "claims" as AdminTab, label: "Fraud Claims", icon: <ShieldCheck className="h-4 w-4" /> }] : []),
    ...(isAdminOrCEO ? [{ id: "ads" as AdminTab, label: "Ad Campaigns", icon: <Megaphone className="h-4 w-4" /> }] : []),
  ];

  const decideAdCampaign = async (campaign: AdminAdCampaign, decision: "approved" | "rejected") => {
    setAdDecisionId(campaign.id);
    try {
      const response = await fetch(`/api/admin/ads/${campaign.id}/decision`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          rejectionReason: decision === "rejected" ? adRejectionReasons[campaign.id]?.trim() || undefined : undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Decision could not be saved.");
      setPendingAds((current) => current.filter((item) => item.id !== campaign.id));
      toast({ title: decision === "approved" ? "Ad campaign approved" : "Ad campaign rejected" });
    } catch (error) {
      toast({ title: "Could not save ad decision", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setAdDecisionId(null);
    }
  };

  const downloadClaimEvidence = async (claim: MatricClaimItem) => {
    try {
      const response = await fetch(`/api/matric-claims/${claim.id}/evidence`, { credentials: "include" });
      if (!response.ok) throw new Error("Evidence could not be loaded.");
      const evidence = await response.blob();
      const objectUrl = URL.createObjectURL(evidence);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `matric-claim-${claim.id}-evidence`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      toast({ title: "Could not download private evidence", variant: "destructive" });
    }
  };

  const resolveMatricClaim = async (claim: MatricClaimItem, decision: "approved" | "rejected") => {
    setClaimActionId(claim.id);
    try {
      const response = await fetch(`/api/admin/matric-claims/${claim.id}/decision`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: claimDecisionNotes[claim.id]?.trim() || undefined }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Decision could not be saved.");
      setMatricClaims((claims) => claims.filter((item) => item.id !== claim.id));
      toast({ title: decision === "approved" ? "Claim review approved" : "Claim review rejected", description: "No account ownership or matric data was changed." });
    } catch (error) {
      toast({ title: "Could not resolve claim", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setClaimActionId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-500/30 to-primary/30 flex items-center justify-center border border-yellow-500/20">
            <Crown className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-black gradient-text">Admin Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              {isCEO ? "CEO Access — Full Control" : "Admin Access"}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              displayedTab === tab.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "verifications" && (pendingData?.users ?? []).length > 0 && (
              <span className="ml-1 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                {(pendingData?.users ?? []).length}
              </span>
            )}
            {tab.id === "reports" && pendingReports.length > 0 && <span className="ml-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">{pendingReports.length}</span>}
          </button>
        ))}
      </div>
      {isAdminOrCEO && displayedTab === "reports" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between"><div><h2 className="text-lg font-bold">Pending reports</h2><p className="text-sm text-muted-foreground">Review flagged content without exposing private identities.</p></div><span className="text-xs text-muted-foreground">{pendingReports.length} awaiting review</span></div>
          {reportsLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          {reportsError && <div className="glass border border-rose-500/20 rounded-xl p-6"><p className="text-sm">Could not load reports.</p><Button variant="outline" className="mt-3" onClick={() => refetchReports()}>Try again</Button></div>}
          {!reportsLoading && !reportsError && pendingReports.length === 0 && <div className="glass rounded-2xl border border-white/10 py-16 text-center"><CheckCircle className="h-11 w-11 mx-auto mb-3 text-primary/60" /><p className="font-semibold">Queue is clear</p><p className="text-sm text-muted-foreground mt-1">New reports will appear here.</p></div>}
          {pendingReports.map((report) => (
            <article key={report.id} data-testid={`report-${report.id}`} className="glass rounded-2xl p-5 border border-white/10 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Badge className="bg-rose-500/10 text-rose-300 border border-rose-500/20">{report.postId != null ? "Post" : "Listing"}</Badge><span className="text-xs text-muted-foreground">Report #{report.id}</span></div><h3 className="font-semibold mt-2 break-words line-clamp-2">{report.targetTitle || "Content unavailable"}</h3></div><time className="text-xs text-muted-foreground" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</time></div>
              <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {report.reason}</p>
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4"><Button size="sm" variant="outline" disabled={reviewReport.isPending} onClick={() => review(report, "dismissed")}>Dismiss</Button><Button size="sm" variant="outline" disabled={reviewReport.isPending} onClick={() => review(report, "reviewed")}>Mark reviewed</Button><Button size="sm" className="bg-rose-600 hover:bg-rose-500 text-white" onClick={() => setDeleteTarget(report)}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete {report.postId != null ? "post" : "listing"}</Button></div>
            </article>
          ))}
        </section>
      )}
      {isAdminOrCEO && displayedTab === "claims" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Matric fraud claims</h2>
              <p className="text-sm text-muted-foreground">Review private evidence. Decisions are recorded without transferring or editing accounts.</p>
            </div>
            <span className="text-xs text-muted-foreground">{matricClaims.length} pending</span>
          </div>
          {matricClaimsLoading && <div className="space-y-3"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div>}
          {matricClaimsError && <div role="alert" className="rounded-xl border border-rose-500/20 p-4 text-sm text-rose-200">{matricClaimsError}</div>}
          {!matricClaimsLoading && !matricClaimsError && matricClaims.length === 0 && (
            <div className="glass rounded-2xl border border-white/10 py-14 text-center">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-primary/60" />
              <p className="font-semibold">No pending claims</p>
              <p className="text-sm text-muted-foreground mt-1">New authenticated reports will appear here.</p>
            </div>
          )}
          {matricClaims.map((claim) => (
            <article key={claim.id} data-testid={`matric-claim-${claim.id}`} className="glass rounded-2xl p-5 border border-white/10 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20">Pending</Badge><span className="text-xs text-muted-foreground">Claim #{claim.id}</span></div>
                  <h3 className="mt-2 font-semibold">{claim.institution}</h3>
                  <p className="text-sm text-muted-foreground">Matric <span className="font-mono text-foreground">{claim.matricNumber}</span> · Existing account #{claim.existingAccountId}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Submitted proof: {claim.evidenceType === "student-id" ? "Student ID" : "Course form"}</p>
                </div>
                <time className="text-xs text-muted-foreground" dateTime={claim.createdAt}>{new Date(claim.createdAt).toLocaleString()}</time>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadClaimEvidence(claim)}>
                  <FileText className="h-4 w-4 mr-2" />Download private evidence
                </Button>
                <span className="text-xs text-muted-foreground">Evidence is served only through the authenticated claim endpoint.</span>
              </div>
              <div className="space-y-2">
                <label htmlFor={`claim-note-${claim.id}`} className="text-sm font-medium">Decision note (optional)</label>
                <Textarea
                  id={`claim-note-${claim.id}`}
                  maxLength={2000}
                  value={claimDecisionNotes[claim.id] ?? ""}
                  onChange={(event) => setClaimDecisionNotes((notes) => ({ ...notes, [claim.id]: event.target.value }))}
                  placeholder="Add an audit note explaining the review decision."
                  className="bg-background/40 border-white/10"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                <Button type="button" variant="outline" className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10" disabled={claimActionId === claim.id} onClick={() => void resolveMatricClaim(claim, "rejected")}>Reject review</Button>
                <Button type="button" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={claimActionId === claim.id} onClick={() => void resolveMatricClaim(claim, "approved")}>Approve review</Button>
              </div>
            </article>
          ))}
        </section>
      )}
      {isAdminOrCEO && displayedTab === "ads" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Ad campaign moderation</h2>
              <p className="text-sm text-muted-foreground">Review paid campaigns. Nothing is published until you explicitly approve it.</p>
            </div>
            <span className="text-xs text-muted-foreground">{pendingAds.length} pending</span>
          </div>
          {adsLoading && <div className="space-y-3"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div>}
          {adsError && <div role="alert" className="rounded-xl border border-rose-500/20 p-4 text-sm text-rose-200">{adsError}</div>}
          {!adsLoading && !adsError && pendingAds.length === 0 && (
            <div className="glass rounded-2xl border border-white/10 py-14 text-center">
              <Megaphone className="h-10 w-10 mx-auto mb-3 text-primary/60" />
              <p className="font-semibold">No pending campaigns</p>
              <p className="text-sm text-muted-foreground mt-1">New paid ad submissions will appear here.</p>
            </div>
          )}
          {pendingAds.map((campaign) => (
            <article key={campaign.id} className="glass rounded-2xl p-5 border border-white/10 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20">Pending</Badge><span className="text-xs text-muted-foreground">Campaign #{campaign.id}</span></div>
                  <h3 className="mt-2 font-semibold break-words">{campaign.title}</h3>
                  <p className="mt-2 text-sm whitespace-pre-wrap break-words">{campaign.body}</p>
                </div>
                <time className="text-xs text-muted-foreground" dateTime={campaign.createdAt}>{new Date(campaign.createdAt).toLocaleString()}</time>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <p>{campaign.packageType === "corporate_ad_30_day" ? "Corporate Ad" : "Event / Performance Ad"} · expires {new Date(campaign.expiresAt).toLocaleDateString()}</p>
                <p>{campaign.school} · {campaign.campusLocation} campus</p>
                <p className="break-all">Purchase: {campaign.paymentReference}</p>
                <p className="break-all">Owner: {campaign.ownerClerkUserId}</p>
              </div>
              <a href={campaign.destinationUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline break-all">{campaign.destinationUrl}</a>
              <div className="space-y-2">
                <label htmlFor={`ad-reason-${campaign.id}`} className="text-sm font-medium">Rejection reason (optional)</label>
                <Textarea
                  id={`ad-reason-${campaign.id}`}
                  maxLength={500}
                  value={adRejectionReasons[campaign.id] ?? ""}
                  onChange={(event) => setAdRejectionReasons((current) => ({ ...current, [campaign.id]: event.target.value }))}
                  placeholder="Give the advertiser a brief reason if rejecting."
                  className="bg-background/40 border-white/10"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                <Button type="button" variant="outline" className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10" disabled={adDecisionId === campaign.id} onClick={() => void decideAdCampaign(campaign, "rejected")}>Reject</Button>
                <Button type="button" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={adDecisionId === campaign.id} onClick={() => void decideAdCampaign(campaign, "approved")}>Approve &amp; publish</Button>
              </div>
            </article>
          ))}
        </section>
      )}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="glass border-rose-500/20 sm:max-w-sm"><DialogTitle>Remove reported content?</DialogTitle><p className="text-sm text-muted-foreground">This permanently deletes the {deleteTarget?.postId != null ? "post" : "listing"} and its associated reports. This cannot be undone.</p><div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button data-testid="button-confirm-delete-reported" disabled={deletePost.isPending || deleteService.isPending} className="bg-rose-600 hover:bg-rose-500 text-white" onClick={removeReportedContent}>Delete content</Button></div></DialogContent>
      </Dialog>

      {displayedTab === "posts" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Review posts here. Moderation actions are only available in this dashboard.</p>
          {postsLoading && <Skeleton className="h-28 rounded-xl" />}
          {!postsLoading && !postsData?.posts.length && <p className="text-sm text-muted-foreground">No posts to review.</p>}
          {postsData?.posts.map((post) => (
            <PostCard key={post.id} post={post} moderationMode isAdmin={isAdminOrCEO} isModerator={isModerator} />
          ))}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && isAdminOrCEO && (
        <div>
          {/* Search */}
          <div className="relative mb-4 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, matric or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/40 border-white/10 focus:border-primary/40"
            />
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {(usersData?.users ?? []).map((u: AdminUserItem) => (
                <motion.div
                  key={u.clerkUserId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 flex flex-wrap items-center gap-3 border border-white/5"
                >
                  <Avatar className="h-10 w-10 border border-white/10 shrink-0">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs gradient-text font-bold">
                      {u.fullName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm truncate">{u.fullName}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{u.faculty} · {u.level}</span>
                      <span>·</span>
                      <span>{u.matricNumber || "No matric"}</span>
                      <span>·</span>
                      <span>{u.postCount} posts</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Select
                      value={u.role}
                      onValueChange={(val) => handleRoleChange(u.clerkUserId, val)}
                      disabled={updateRole.isPending || !isCEO}
                    >
                      <SelectTrigger className={cn("h-8 text-xs w-32 border", ROLE_COLORS[u.role] ?? "border-white/10")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass border-white/10">
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="ceo">CEO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(() => {
                    const verified = ["approved", "Student_Verified", "Gold_Approved", "Premium_Approved"].includes(u.verificationStatus);
                    const protectedAccount = u.role === "admin" || u.role === "ceo";
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-8 text-[11px] shrink-0",
                          protectedAccount
                            ? "border-amber-500/30 text-amber-300"
                            : verified
                            ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                            : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10",
                        )}
                        onClick={() => handleVerificationToggle(u.clerkUserId, verified)}
                        disabled={setUserVerification.isPending || protectedAccount}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                        {protectedAccount ? "Always Verified" : verified ? "Revoke Verification" : "Approve Verification"}
                      </Button>
                    );
                  })()}
                </motion.div>
              ))}

              {!usersLoading && (usersData?.users ?? []).length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No users found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending Verifications Tab */}
      {activeTab === "verifications" && (
        <div>
          {pendingLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (pendingData?.users ?? []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle className="h-14 w-14 mx-auto mb-3 opacity-20" />
              <p className="font-medium">All clear!</p>
              <p className="text-sm mt-1">No pending badge verifications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(pendingData?.users ?? []).map((u: PendingVerificationItem) => (
                <motion.div
                  key={u.clerkUserId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-5 flex items-center gap-4 border border-white/5"
                >
                  <Avatar className="h-12 w-12 border border-white/10 shrink-0">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-sm gradient-text font-bold">
                      {u.fullName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{u.fullName}</span>
                      <Badge className={cn(
                        "text-[10px] px-2 py-0.5 h-5 border font-semibold",
                        u.badgeType.includes("Paid")
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-sky-500/20 text-sky-400 border-sky-500/30"
                      )}>
                        {u.badgeType}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                      <span>{u.faculty} · {u.level}</span>
                      <span className="flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        {u.matricNumber || "No matric"}
                      </span>
                    </div>
                  </div>

                  <Button
                    className="shrink-0 h-9 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold gap-1.5"
                    onClick={() => handleApprove(u.clerkUserId)}
                    disabled={approveBadge.isPending}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {u.verificationStatus === "Student_Pending" ? "Activate free Green Tick" : "Approve purchased tier"}
                  </Button>
                  <Button
                    variant="outline"
                    className="shrink-0 h-9 px-3 border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-bold"
                    onClick={() => handleReject(u.clerkUserId)}
                    disabled={rejectBadge.isPending}
                  >
                    Revoke / Reject
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

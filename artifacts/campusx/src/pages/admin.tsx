import { useState } from "react";
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useUpdateUserRole,
  useListPendingVerifications,
  getListPendingVerificationsQueryKey,
  useApproveBadge,
  useGetMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import type { AdminUserItem, PendingVerificationItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Shield, Users, CheckCircle, Crown, Search, ShieldCheck, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { CampusTitleBadge } from "@/components/campus-title-badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

type AdminTab = "users" | "verifications";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  const isCEO = profile?.role === "ceo";
  const isAdminOrCEO = isCEO || profile?.role === "admin";

  const { data: usersData, isLoading: usersLoading } = useListAdminUsers(
    { search: search || undefined },
    {
      query: {
        queryKey: getListAdminUsersQueryKey({ search: search || undefined }),
        enabled: isCEO,
      },
    }
  );

  const { data: pendingData, isLoading: pendingLoading } = useListPendingVerifications({
    query: {
      queryKey: getListPendingVerificationsQueryKey(),
      enabled: isAdminOrCEO,
    },
  });

  const updateRole = useUpdateUserRole();
  const approveBadge = useApproveBadge();

  if (profileLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (!isAdminOrCEO) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-xl text-center">
        <Lock className="h-16 w-16 mx-auto mb-4 text-primary/40" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm">This area is for CampusX admins only.</p>
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
        },
      }
    );
  };

  const handleApprove = (userId: string) => {
    approveBadge.mutate(
      { userId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
        },
      }
    );
  };

  const ROLE_COLORS: Record<string, string> = {
    ceo: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    moderator: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    student: "bg-white/10 text-foreground/60 border-white/10",
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    ...(isCEO ? [{ id: "users" as AdminTab, label: "All Users", icon: <Users className="h-4 w-4" /> }] : []),
    { id: "verifications", label: "Pending Verifications", icon: <CheckCircle className="h-4 w-4" /> },
  ];

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
              activeTab === tab.id
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
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {activeTab === "users" && isCEO && (
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
                  className="glass rounded-xl p-4 flex items-center gap-3 border border-white/5"
                >
                  <Avatar className="h-10 w-10 border border-white/10 shrink-0">
                    <AvatarImage src={u.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs gradient-text font-bold">
                      {u.fullName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm truncate">{u.fullName}</span>
                      <CampusTitleBadge title={u.campusTitle} role={u.role} />
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
                      disabled={updateRole.isPending}
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
                    Approve Badge
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

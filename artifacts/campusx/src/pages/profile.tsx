import { useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, LogOut, GraduationCap, MapPin, Building2 } from "lucide-react";
import { motion } from "framer-motion";

export default function MyProfilePage() {
  const clerk = useClerk();
  const [, setLocation] = useLocation();
  const { data: profile, isLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() }
  });

  const handleLogout = async () => {
    await clerk.signOut();
    setLocation("/");
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-8">
        <Skeleton className="h-32 w-32 rounded-full" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

        {/* Hero card */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 glass p-8 rounded-3xl border-primary/20">
          <Avatar className="h-28 w-28 border-4 border-background shadow-xl shrink-0">
            <AvatarImage src={profile.avatarUrl || undefined} />
            <AvatarFallback className="text-4xl gradient-text">{profile.fullName.charAt(0)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <h1 className="text-3xl font-bold">{profile.fullName}</h1>
              <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                <Building2 className="h-3.5 w-3.5" />
                {profile.school}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">{profile.faculty}</Badge>
              <Badge variant="secondary" className="text-xs">{profile.level}</Badge>
              <Badge className="text-xs bg-primary/20 text-primary border-none">{profile.enrollmentStatus}</Badge>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {profile.campusLocation} Campus
              </span>
              <span className="flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" />
                {profile.campus}
              </span>
            </div>
          </div>

          <Button
            data-testid="button-logout"
            variant="outline"
            className="border-red-500/20 text-red-400 hover:bg-red-500/10 shrink-0"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Academic Info */}
          <Card className="glass border-white/5">
            <CardHeader>
              <CardTitle className="text-base">Academic Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">University</span>
                <span className="font-medium">{profile.school}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">Campus</span>
                <span className="font-medium">{profile.campusLocation} — {profile.campus}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">Enrollment Type</span>
                <span className="font-medium">{profile.enrollmentStatus}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">Email</span>
                <span className="font-medium">{profile.email}</span>
              </div>
              {profile.bio && (
                <div>
                  <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">Bio</span>
                  <span>{profile.bio}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wider">Member Since</span>
                <span className="font-medium">{new Date(profile.createdAt).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</span>
              </div>
            </CardContent>
          </Card>

          {/* Private Info */}
          <Card className="glass border-orange-500/20 bg-orange-500/5">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
              <Lock className="h-4 w-4 text-orange-400" />
              <CardTitle className="text-base text-orange-400">Private Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-background/50 rounded-xl border border-white/5">
                <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-2">Matriculation Number</span>
                <span
                  data-testid="text-matric-number"
                  className="font-mono text-xl tracking-widest font-bold"
                >
                  {profile.matricNumber}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This information is encrypted and only visible to you and system administrators. It is never shared publicly.
              </p>
            </CardContent>
          </Card>
        </div>

      </motion.div>
    </div>
  );
}

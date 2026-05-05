import { useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, LogOut } from "lucide-react";
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
    return <div className="p-8 max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  if (!profile) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 glass p-8 rounded-3xl border-primary/20">
          <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
            <AvatarImage src={profile.avatarUrl || undefined} />
            <AvatarFallback className="text-4xl">{profile.fullName.charAt(0)}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-3xl font-bold">{profile.fullName}</h1>
              <p className="text-muted-foreground">{profile.campus}</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{profile.faculty}</Badge>
              <Badge variant="secondary">{profile.level}</Badge>
              <Badge className="bg-primary/20 text-primary border-none">{profile.enrollmentStatus}</Badge>
            </div>
          </div>
          
          <Button variant="outline" className="border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="glass border-white/5">
            <CardHeader>
              <CardTitle className="text-lg">Public Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div><span className="text-muted-foreground block mb-1">Email</span>{profile.email}</div>
              <div><span className="text-muted-foreground block mb-1">Joined</span>{new Date(profile.createdAt).toLocaleDateString()}</div>
              {profile.bio && <div><span className="text-muted-foreground block mb-1">Bio</span>{profile.bio}</div>}
            </CardContent>
          </Card>

          <Card className="glass border-accent/20 bg-accent/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg text-accent flex items-center gap-2">
                <Lock className="h-4 w-4" /> Private Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="p-4 bg-background/50 rounded-xl border border-white/5">
                <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Matriculation Number</span>
                <span className="font-mono text-xl tracking-widest">{profile.matricNumber}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                This information is only visible to you and system administrators.
              </p>
            </CardContent>
          </Card>
        </div>
        
      </motion.div>
    </div>
  );
}

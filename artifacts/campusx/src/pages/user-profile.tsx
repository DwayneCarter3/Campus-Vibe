import { useParams } from "wouter";
import { useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  
  const { data: profile, isLoading, error } = useGetUserProfile(userId, {
    query: { queryKey: getGetUserProfileQueryKey(userId), enabled: !!userId }
  });

  if (isLoading) {
    return <div className="p-8 max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  if (error || !profile) {
    return <div className="p-20 text-center text-muted-foreground">User not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 glass p-8 rounded-3xl">
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
            
            {profile.bio && (
              <p className="text-sm mt-4 p-4 glass rounded-xl border-white/5">{profile.bio}</p>
            )}
          </div>
        </div>
        
      </motion.div>
    </div>
  );
}

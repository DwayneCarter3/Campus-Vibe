import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider, Show, useAuth, useClerk } from "@/lib/auth";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/toaster";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { NotificationProvider } from "@/context/notifications";

// Pages
import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Onboarding from "@/pages/onboarding";
import PostDetailPage from "@/pages/post-detail";
import UserProfilePage from "@/pages/user-profile";
import NotFound from "@/pages/not-found";
import ResetPasswordPage from "@/pages/reset-password";

const FeedPage = lazy(() => import("@/pages/feed"));
const EarnPage = lazy(() => import("@/pages/earn"));
const CgpaPage = lazy(() => import("@/pages/cgpa"));
const MyProfilePage = lazy(() => import("@/pages/profile"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const AdminPage = lazy(() => import("@/pages/admin"));

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AuthLoading() {
  return <div className="min-h-[40vh] flex items-center justify-center" aria-busy="true"><div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AuthBootError() {
  const { bootError, refresh } = useAuth();
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <p className="text-lg font-semibold text-foreground">Session check failed</p>
      <p className="text-sm text-muted-foreground max-w-sm">{bootError}</p>
      <button type="button" onClick={() => void refresh()} className="mt-2 h-10 px-5 rounded-lg bg-gradient-to-r from-pink-500 to-orange-500 text-white font-semibold">Try again</button>
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded, bootError } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (bootError) return <AuthBootError />;
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/feed" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, bootError } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (bootError) return <AuthBootError />;
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <NotificationProvider>
          <Layout>
            <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
              <Switch>
                <Route path="/" component={HomeRedirect} />
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />
                <Route path="/reset-password" component={ResetPasswordPage} />
                <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
                <Route path="/feed" component={() => <ProtectedRoute component={FeedPage} />} />
                <Route path="/post/:id" component={() => <ProtectedRoute component={PostDetailPage} />} />
                <Route path="/earn" component={() => <ProtectedRoute component={EarnPage} />} />
                <Route path="/cgpa" component={() => <ProtectedRoute component={CgpaPage} />} />
                <Route path="/messages" component={() => <ProtectedRoute component={MessagesPage} />} />
                <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} />} />
                <Route path="/profile" component={() => <ProtectedRoute component={MyProfilePage} />} />
                <Route path="/profile/:userId" component={() => <ProtectedRoute component={UserProfilePage} />} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Layout>
        </NotificationProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="campusx-theme">
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;

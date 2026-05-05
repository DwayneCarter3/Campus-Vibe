import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

// Pages
import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Onboarding from "@/pages/onboarding";
import FeedPage from "@/pages/feed";
import EarnPage from "@/pages/earn";
import MyProfilePage from "@/pages/profile";
import UserProfilePage from "@/pages/user-profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
  },
  variables: {
    colorPrimary: "#f5286e",
    colorBackground: "#0a0a0f",
    colorForeground: "#f0f0f5",
    colorInput: "#15151f",
    colorInputForeground: "#f0f0f5",
    colorNeutral: "#333345",
    colorMutedForeground: "#8c8c9e",
    colorDanger: "#ef4444",
    fontFamily: "'Space Grotesk', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0a0a0f] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10 shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#f0f0f5]",
    headerSubtitle: "text-[#8c8c9e]",
    socialButtonsBlockButtonText: "text-[#f0f0f5]",
    formFieldLabel: "text-[#f0f0f5]",
    footerActionLink: "text-[#f5286e] hover:text-[#f5286e]/80",
    footerActionText: "text-[#8c8c9e]",
    dividerText: "text-[#8c8c9e]",
    identityPreviewEditButton: "text-[#f5286e]",
    formFieldSuccessText: "text-[#10b981]",
    alertText: "text-[#f0f0f5]",
    logoBox: "",
    logoImage: "",
    socialButtonsBlockButton: "border-[#333345] hover:bg-[#15151f]",
    formButtonPrimary: "bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-semibold",
    formFieldInput: "bg-[#15151f] border-[#333345] text-[#f0f0f5]",
    footerAction: "",
    dividerLine: "bg-[#333345]",
    alert: "",
    otpCodeFieldInput: "bg-[#15151f] border-[#333345] text-[#f0f0f5]",
    formFieldRow: "",
    main: "",
  },
};

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

function HomeRedirect() {
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
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return <div className="p-8 text-center text-red-500">Missing Clerk Publishable Key</div>;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Layout>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
            <Route path="/feed" component={() => <ProtectedRoute component={FeedPage} />} />
            <Route path="/earn" component={() => <ProtectedRoute component={EarnPage} />} />
            <Route path="/profile" component={() => <ProtectedRoute component={MyProfilePage} />} />
            <Route path="/profile/:userId" component={() => <ProtectedRoute component={UserProfilePage} />} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;

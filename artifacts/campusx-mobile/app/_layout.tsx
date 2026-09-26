import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  getGetMyProfileQueryKey,
  setBaseUrl,
  setAuthTokenGetter,
  useGetMyProfile,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

SplashScreen.preventAutoHideAsync();

const publishableKey: string =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  Constants.expoConfig?.extra?.clerkPublishableKey ||
  "";
const devDomain: string =
  process.env.EXPO_PUBLIC_DOMAIN ||
  Constants.expoConfig?.extra?.devDomain ||
  "campus-vibe-carterthe3rd.replit.dev";

if (devDomain) {
  setBaseUrl(`https://${devDomain}`);
}

const tokenCache =
  Platform.OS === "web"
    ? undefined
    : {
        getToken: (key: string) =>
          SecureStore.getItemAsync(key).catch(() => null),
        saveToken: (key: string, token: string) =>
          SecureStore.setItemAsync(key, token).catch(() => {}),
        clearToken: (key: string) =>
          SecureStore.deleteItemAsync(key).catch(() => {}),
      };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ApiAuthBridge() {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    return () => {
      setAuthTokenGetter(null);
    };
  }, [getToken]);

  useEffect(() => {
    const currentUserId = userId ?? null;
    if (previousUserId.current !== currentUserId) {
      if (previousUserId.current !== null || currentUserId !== null) {
        queryClient.clear();
      }
      previousUserId.current = currentUserId;
    }
  }, [queryClient, userId]);

  return null;
}

function RootLayoutNav() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const segments = useSegments();
  const profileQuery = useGetMyProfile({
    query: {
      queryKey: getGetMyProfileQueryKey(),
      enabled: isLoaded && !!isSignedIn,
      retry: false,
    },
  });
  const isOnboardingRoute = segments.includes("onboarding" as never);
  const profileErrorStatus = (profileQuery.error as { status?: number } | null)?.status;
  const profileMissing = profileErrorStatus === 404;
  const profileMatchesUser = Boolean(
    userId && profileQuery.data?.clerkUserId === userId,
  );

  useEffect(() => {
    if (isSignedIn && profileMatchesUser && isOnboardingRoute) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, profileMatchesUser, isOnboardingRoute, router]);

  if (
    !isLoaded ||
    (isSignedIn &&
      (profileQuery.isLoading ||
        (!profileMatchesUser && !profileMissing && !profileQuery.isError)))
  ) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isSignedIn && profileMissing && !isOnboardingRoute) {
    return <Redirect href="/onboarding" />;
  }

  if (isSignedIn && profileQuery.isError && !profileMissing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
          We couldn’t load your profile
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20, textAlign: "center" }}>
          Check your connection and try again. CampusX will keep your account content private until your profile is ready.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => profileQuery.refetch()}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="cgpa" options={{ headerShown: false }} />
      <Stack.Screen
        name="admin"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <QueryClientProvider client={queryClient}>
            <ApiAuthBridge />
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

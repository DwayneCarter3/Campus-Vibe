import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";

type Mode = "signIn" | "signUp" | "confirm" | "forgot";

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn, signIn, signUp, requestPasswordReset } = useAuth();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)");
  }, [isSignedIn]);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const fail = (err: unknown, fallback: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError(err instanceof Error && err.message ? err.message : fallback);
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const r = await signIn(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(r.needsOnboarding ? "/onboarding" : "/(tabs)");
    } catch (err) {
      fail(err, "Sign-in failed. Check your details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !fullName.trim()) return;
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const msg = await signUp(email.trim(), password, fullName.trim());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setNotice(msg);
      setPassword("");
      setMode("confirm");
    } catch (err) {
      fail(err, "Sign-up failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      setNotice(await requestPasswordReset(email.trim()));
    } catch (err) {
      fail(err, "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "50" }]}>
            <Text style={[styles.logoText, { color: colors.primary }]}>CX</Text>
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>CampusX</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Your campus community</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {mode === "confirm" ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Check your email</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                We sent a confirmation link to {email.trim()}
              </Text>
              {notice ? <Text style={[styles.notice, { color: colors.foreground }]}>{notice}</Text> : null}
              <Text style={[styles.cardSub, { color: colors.mutedForeground, marginTop: 0 }]}>
                Open the link to confirm your account, then come back and sign in to set up your profile.
              </Text>
              <ActionButton label="Back to Sign In" onPress={() => switchMode("signIn")} loading={false} disabled={false} colors={colors} />
            </>
          ) : mode === "forgot" ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Reset password</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                We will email you a secure link to set a new password.
              </Text>
              <Field
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="youremail@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                colors={colors}
                testID="input-reset-email"
              />
              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
              {notice ? <Text style={[styles.notice, { color: colors.foreground }]}>{notice}</Text> : null}
              <ActionButton label="Send Reset Link" onPress={handleForgot} loading={loading} disabled={!email.trim()} colors={colors} />
              <TouchableOpacity onPress={() => switchMode("signIn")} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Back to sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(["signIn", "signUp"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`tab-${m}`}
                    onPress={() => switchMode(m)}
                    style={[styles.tab, mode === m && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.tabText, { color: mode === m ? "#fff" : colors.mutedForeground }]}>
                      {m === "signIn" ? "Sign In" : "Sign Up"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {mode === "signIn" ? "Welcome back" : "Join CampusX"}
              </Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                {mode === "signIn" ? "Sign in to your account" : "Create your student account"}
              </Text>

              {mode === "signUp" && (
                <Field
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Tunde Bello"
                  colors={colors}
                />
              )}

              <Field
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="youremail@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                colors={colors}
              />

              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Password</Text>
                <View style={[styles.passwordRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.foreground }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"}
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {mode === "signIn" ? (
                <TouchableOpacity onPress={() => switchMode("forgot")} style={{ alignSelf: "flex-end", marginTop: -6 }} testID="link-forgot-password">
                  <Text style={[styles.switchLink, { color: colors.primary, fontSize: 13 }]}>Forgot password?</Text>
                </TouchableOpacity>
              ) : null}

              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

              <ActionButton
                label={mode === "signIn" ? "Sign In" : "Create Account"}
                onPress={mode === "signIn" ? handleSignIn : handleSignUp}
                loading={loading}
                disabled={!email.trim() || !password || (mode === "signUp" && !fullName.trim())}
                colors={colors}
              />

              {mode === "signIn" ? (
                <Text style={[styles.cardSub, { color: colors.mutedForeground, marginTop: 0, fontSize: 12, lineHeight: 17 }]}>
                  Joined before our sign-in update? Tap Forgot password once to set a new password. Your posts and profile stay the same.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          By continuing, you agree to the CampusX community guidelines for students.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, colors, ...props }: { label: string; colors: ReturnType<typeof useColors> } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
        placeholderTextColor={colors.mutedForeground}
        {...props}
      />
    </View>
  );
}

function ActionButton({ label, onPress, loading, disabled, colors }: { label: string; onPress: () => void; loading: boolean; disabled: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.actionBtn, { backgroundColor: disabled || loading ? colors.muted : colors.primary }]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.actionBtnText, { color: disabled ? colors.mutedForeground : "#fff" }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  brand: { alignItems: "center", marginBottom: 32 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: "800", letterSpacing: -1 },
  appName: { fontSize: 30, fontWeight: "800", letterSpacing: -1, marginBottom: 4 },
  tagline: { fontSize: 14 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  cardTitle: { fontSize: 22, fontWeight: "700" },
  cardSub: { fontSize: 14, marginTop: -8 },
  fieldWrapper: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12,
  },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  eyeBtn: { paddingHorizontal: 14 },
  error: { fontSize: 13, fontWeight: "500" },
  actionBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnText: { fontSize: 16, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  switchText: { fontSize: 14 },
  switchLink: { fontSize: 14, fontWeight: "700" },
  link: { alignItems: "center" },
  linkText: { fontSize: 14, textDecorationLine: "underline" },
  tabs: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabText: { fontSize: 14, fontWeight: "700" },
  notice: { fontSize: 13, lineHeight: 19 },
  footer: { fontSize: 12, textAlign: "center", marginTop: 24, lineHeight: 18 },
});

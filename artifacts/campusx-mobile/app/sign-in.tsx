import { useSignIn, useSignUp, useAuth } from "@clerk/expo";
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

import { useColors } from "@/hooks/useColors";

type Mode = "signIn" | "signUp" | "verify";

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const authLoading = signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)");
  }, [isSignedIn]);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 24 : insets.top;

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const { error: signInError } = await signIn.password({
        emailAddress: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        setError("Your account needs an additional verification step. Please use the web app to finish signing in.");
      } else {
        setError("Sign-in incomplete. Please try again.");
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.longMessage || err?.message || "Sign-in failed. Check your details.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !fullName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const [firstName, ...lastName] = fullName.trim().split(/\s+/);
      const { error: signUpError } = await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName: lastName.join(" ") || undefined,
      });
      if (signUpError) throw signUpError;
      const { error: verificationError } = await signUp.verifications.sendEmailCode();
      if (verificationError) throw verificationError;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMode("verify");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.longMessage || err?.message || "Sign-up failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { error: verificationError } = await signUp.verifications.verifyEmailCode({
        code: verifyCode.trim(),
      });
      if (verificationError) throw verificationError;
      if (signUp.status === "complete") {
        await signUp.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/onboarding");
          },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError("Verification incomplete. Try again.");
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.longMessage || err?.message || "Wrong code. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setPassword("");
  };

  const resendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const { error: verificationError } = await signUp.verifications.sendEmailCode();
      if (verificationError) throw verificationError;
    } catch (err: any) {
      setError(err?.longMessage || err?.message || "Could not resend the code.");
    } finally {
      setLoading(false);
    }
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
        {/* Branding */}
        <View style={styles.brand}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "50" }]}>
            <Text style={[styles.logoText, { color: colors.primary }]}>CX</Text>
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>CampusX</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Your campus community</Text>
        </View>

        {/* Form card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {mode === "verify" ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Check your email 📬</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                We sent a 6-digit code to {email}
              </Text>
              <Field
                label="Verification Code"
                value={verifyCode}
                onChangeText={setVerifyCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                colors={colors}
              />
              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
              <ActionButton
                label="Verify Email"
                onPress={handleVerify}
                loading={loading || authLoading}
                disabled={!verifyCode.trim() || authLoading}
                colors={colors}
              />
              <TouchableOpacity onPress={resendCode} disabled={loading || authLoading} style={styles.link}>
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Resend code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {mode === "signIn" ? "Welcome back 👋" : "Join CampusX 🎓"}
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
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

              <ActionButton
                label={mode === "signIn" ? "Sign In" : "Create Account"}
                onPress={mode === "signIn" ? handleSignIn : handleSignUp}
                loading={loading || authLoading}
                disabled={!email.trim() || !password || (mode === "signUp" && !fullName.trim())}
                colors={colors}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
                  {mode === "signIn" ? "New student?" : "Already have an account?"}
                </Text>
                <TouchableOpacity onPress={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}>
                  <Text style={[styles.switchLink, { color: colors.primary }]}>
                    {mode === "signIn" ? " Sign up" : " Sign in"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        {mode === "signIn" ? null : <View nativeID="clerk-captcha" />}

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
  footer: { fontSize: 12, textAlign: "center", marginTop: 24, lineHeight: 18 },
});

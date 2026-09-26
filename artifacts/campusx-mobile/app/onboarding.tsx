import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import {
  CAMPUS_INSTITUTIONS,
  type CampusInstitution,
} from "@workspace/campus-institutions";
import {
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
} from "@workspace/api-client-react";

const LEVELS = ["", "100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"] as const;
const ENROLLMENT_TYPES = ["Full-Time", "Part-Time"] as const;

type PickerProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onSelect: (value: string) => void;
};

function SearchPicker({ label, placeholder, value, options, disabled, onSelect }: PickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((option) => option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
    [options, search],
  );

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={[
            styles.selectButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            disabled && styles.disabled,
          ]}
        >
          <Text numberOfLines={1} style={[styles.selectText, { color: value ? colors.foreground : colors.mutedForeground }]}>
            {value || placeholder}
          </Text>
          <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={[styles.pickerPage, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : 16 }]}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{label}</Text>
              <Text style={[styles.pickerSubtitle, { color: colors.mutedForeground }]}>Search and choose one option</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={17} color={colors.mutedForeground} />
            <TextInput
              autoFocus
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${label.toLocaleLowerCase()}`}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              returnKeyType="search"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.optionList}
            ListEmptyComponent={
              <Text style={[styles.emptyOptions, { color: colors.mutedForeground }]}>No matching options</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onSelect(item);
                  close();
                }}
                style={[styles.optionRow, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>{item}</Text>
                {item === value ? <Feather name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

function OptionChips({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option || "automatic"}
              onPress={() => onSelect(option)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary + "18" : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.primary : colors.foreground }]}>
                {option || "Automatic"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const updateProfile = useUpdateMyProfile();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [matricNumber, setMatricNumber] = useState("");
  const [school, setSchool] = useState("");
  const [campusLocation, setCampusLocation] = useState("");
  const [faculty, setFaculty] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("");
  const [enrollmentStatus, setEnrollmentStatus] = useState<(typeof ENROLLMENT_TYPES)[number] | "">("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!fullName.trim() && user?.fullName) setFullName(user.fullName);
  }, [user?.fullName]);

  const institution: CampusInstitution | undefined = CAMPUS_INSTITUTIONS.find((item) => item.name === school);

  const submit = async () => {
    const cleanMatric = matricNumber.trim().toUpperCase();
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError("Enter your full name.");
      return;
    }
    if (!institution || !campusLocation || !faculty || !enrollmentStatus) {
      setFormError("Choose your school, campus, faculty, and enrollment type.");
      return;
    }
    if (!cleanMatric) {
      setFormError("Your matriculation number is required.");
      return;
    }
    if (level === "" && (!/^\d{2}/.test(cleanMatric) || Number(cleanMatric.slice(0, 2)) > 25)) {
      setFormError("Automatic level needs a matric number starting with a valid two-digit entry year.");
      return;
    }

    setFormError("");
    try {
      const profile = await updateProfile.mutateAsync({
        data: {
          fullName: fullName.trim(),
          school: institution.name,
          campusLocation,
          campus: campusLocation,
          level,
          faculty,
          enrollmentStatus,
          matricNumber: cleanMatric,
          // Email is intentionally omitted: the API reads the verified primary email from Clerk.
        },
      });
      queryClient.setQueryData(getGetMyProfileQueryKey(), profile);
      await queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      router.replace("/(tabs)");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your profile. Please try again.";
      setFormError(message);
    }
  };

  const campusOptions = institution?.campuses ?? [];
  const facultyOptions = institution?.faculties ?? [];
  const webInsets = Platform.OS === "web";
  const errorMessage = formError || (
    updateProfile.isError
      ? "Could not save your profile. Please check your details and try again."
      : ""
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: (webInsets ? 67 : insets.top) + 24, paddingBottom: (webInsets ? 34 : insets.bottom) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: colors.primary + "18" }]}>
            <Text style={[styles.logoLetters, { color: colors.primary }]}>CX</Text>
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WELCOME TO CAMPUSX</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Set up your student profile</Text>
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>
            Tell us where you study to unlock your campus community.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Full name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your first and last name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Email address</Text>
            <View style={[styles.readOnly, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text numberOfLines={1} style={[styles.readOnlyText, { color: colors.mutedForeground }]}>
                {user?.primaryEmailAddress?.emailAddress ?? "Verified by Clerk"}
              </Text>
              <Feather name="lock" size={15} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
              Your verified email is securely confirmed by CampusX and cannot be edited here.
            </Text>
          </View>

          <SearchPicker
            label="School"
            placeholder="Search official institutions"
            value={school}
            options={CAMPUS_INSTITUTIONS.map((item) => item.name)}
            onSelect={(value) => {
              setSchool(value);
              setCampusLocation("");
              setFaculty("");
            }}
          />

          <SearchPicker
            label="Campus"
            placeholder={school ? "Choose your campus" : "Choose a school first"}
            value={campusLocation}
            options={campusOptions}
            disabled={!school}
            onSelect={(value) => {
              setCampusLocation(value);
              setFaculty("");
            }}
          />

          <SearchPicker
            label="Faculty / School"
            placeholder={campusLocation ? "Choose your faculty or school" : "Choose a campus first"}
            value={faculty}
            options={facultyOptions}
            disabled={!campusLocation}
            onSelect={setFaculty}
          />

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Matriculation number</Text>
            <TextInput
              value={matricNumber}
              onChangeText={setMatricNumber}
              placeholder="e.g. 200212345"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              style={[styles.input, styles.matricInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
            />
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>Used to determine your level. Kept private.</Text>
          </View>

          <OptionChips label="Current level" options={LEVELS} value={level} onSelect={(value) => setLevel(value as (typeof LEVELS)[number])} />
          <OptionChips
            label="Enrollment type"
            options={ENROLLMENT_TYPES}
            value={enrollmentStatus}
            onSelect={(value) => setEnrollmentStatus(value as (typeof ENROLLMENT_TYPES)[number])}
          />

          {errorMessage ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "12" }]}>
              <Feather name="alert-circle" size={17} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={submit}
            disabled={updateProfile.isPending}
            style={[styles.submit, { backgroundColor: updateProfile.isPending ? colors.muted : colors.primary }]}
          >
            {updateProfile.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitText}>Complete profile</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
        <Text style={[styles.privacyNote, { color: colors.mutedForeground }]}>
          By continuing, you confirm these details are accurate. Your email is verified directly with Clerk.
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 22, flexGrow: 1 },
  brand: { marginBottom: 24 },
  logo: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  logoLetters: { fontSize: 17, fontWeight: "800", letterSpacing: -0.5 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 },
  intro: { fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 340 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 18 },
  fieldGroup: { gap: 7 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 15 },
  matricInput: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 0.4 },
  readOnly: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  readOnlyText: { flex: 1, fontSize: 14 },
  helper: { fontSize: 11, lineHeight: 16 },
  selectButton: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectText: { flex: 1, fontSize: 14 },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 },
  chipText: { fontSize: 13, fontWeight: "600" },
  errorBox: { padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  submit: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 2 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  privacyNote: { textAlign: "center", fontSize: 11, lineHeight: 17, paddingHorizontal: 12, paddingTop: 18 },
  pickerPage: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  pickerTitle: { fontSize: 21, fontWeight: "700" },
  pickerSubtitle: { fontSize: 13, marginTop: 3 },
  closeButton: { padding: 8 },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  optionList: { paddingBottom: 24 },
  optionRow: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  optionText: { flex: 1, fontSize: 14 },
  emptyOptions: { textAlign: "center", paddingVertical: 28, fontSize: 14 },
});
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import {
  getGetMyCgpaPlanQueryKey,
  useGetMyCgpaPlan,
  useSaveMyCgpaPlan,
} from "@workspace/api-client-react";
import type { CgpaPlanCourseGrade } from "@workspace/api-client-react";

type CourseDraft = {
  id: string;
  code: string;
  units: string;
  grade: CgpaPlanCourseGrade | "";
};

type PlanForm = {
  currentCgpa: string;
  completedUnits: string;
  targetCgpa: string;
  remainingUnits: string;
  courses: CourseDraft[];
};

const EMPTY_FORM: PlanForm = {
  currentCgpa: "",
  completedUnits: "",
  targetCgpa: "",
  remainingUnits: "",
  courses: [],
};

const GRADES: { grade: CgpaPlanCourseGrade; points: number }[] = [
  { grade: "A", points: 5 },
  { grade: "B", points: 4 },
  { grade: "C", points: 3 },
  { grade: "D", points: 2 },
  { grade: "E", points: 1 },
  { grade: "F", points: 0 },
];

const isNumeric = (value: string) => value.trim() !== "" && Number.isFinite(Number(value));
const gradePoints = (grade: CgpaPlanCourseGrade) =>
  GRADES.find((item) => item.grade === grade)?.points ?? 0;

export default function CgpaScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn || !userId) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <CgpaCalculator key={userId} userId={userId} />;
}

function CgpaCalculator({ userId }: { userId: string }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const queryKey = [...getGetMyCgpaPlanQueryKey(), userId];
  const { data, isLoading, isFetched, isError } = useGetMyCgpaPlan({
    query: { queryKey, enabled: !!userId, gcTime: 0 },
  });
  const savePlan = useSaveMyCgpaPlan();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (!isFetched || hasHydrated) return;
    if (data) {
      setForm({
        currentCgpa: data.currentCgpa == null ? "" : String(data.currentCgpa),
        completedUnits: data.completedUnits == null ? "" : String(data.completedUnits),
        targetCgpa: data.targetCgpa == null ? "" : String(data.targetCgpa),
        remainingUnits: data.remainingUnits == null ? "" : String(data.remainingUnits),
        courses: data.courses.map((course, index) => ({
          id: `${userId}-${index}`,
          code: course.code,
          units: String(course.units),
          grade: course.grade,
        })),
      });
    }
    setHasHydrated(true);
  }, [data, hasHydrated, isFetched, userId]);

  const current = isNumeric(form.currentCgpa) ? Number(form.currentCgpa) : null;
  const completed = isNumeric(form.completedUnits) ? Number(form.completedUnits) : null;
  const target = isNumeric(form.targetCgpa) ? Number(form.targetCgpa) : null;
  const remaining = isNumeric(form.remainingUnits) ? Number(form.remainingUnits) : null;

  const plannedCourses = form.courses.flatMap((course) => {
    const code = course.code.trim();
    const units = course.units.trim();
    if (!code || !units || !course.grade || !isNumeric(units)) return [];
    const unitsNumber = Number(units);
    if (!Number.isInteger(unitsNumber) || unitsNumber < 1) return [];
    return [{ code, units: unitsNumber, grade: course.grade }];
  });
  const plannedUnits = plannedCourses.reduce((sum, course) => sum + course.units, 0);
  const weightedPoints = plannedCourses.reduce(
    (sum, course) => sum + gradePoints(course.grade) * course.units,
    0,
  );
  const semesterGpa = plannedUnits > 0 ? weightedPoints / plannedUnits : null;
  const projectedCgpa =
    plannedUnits > 0 && completed !== null && (completed === 0 || current !== null)
      ? ((current ?? 0) * completed + weightedPoints) / (completed + plannedUnits)
      : null;

  let requirementMessage = "Enter your CGPA, completed units, target, and remaining units.";
  let isImpossible = false;
  let maximumCgpa: number | null = null;
  let requiredGpa: number | null = null;
  const hasValidTarget = current !== null && current >= 0 && current <= 5 &&
    completed !== null && Number.isInteger(completed) && completed >= 0 &&
    target !== null && target >= 0 && target <= 5 &&
    remaining !== null && Number.isInteger(remaining) && remaining >= 0;
  if (completed === 0 && remaining === 0) {
    requirementMessage = "Indeterminate — awaiting units.";
  } else if (hasValidTarget && current !== null && completed !== null && target !== null && remaining !== null) {
    if (remaining === 0) {
      maximumCgpa = current;
      if (current >= target) requirementMessage = "Target already reached.";
      else {
        isImpossible = true;
        requirementMessage = "Impossible ⚠️";
      }
    } else {
      const required = (target * (completed + remaining) - current * completed) / remaining;
      maximumCgpa = (current * completed + 5 * remaining) / (completed + remaining);
      if (required <= 0) {
        requiredGpa = 0;
        requirementMessage = "0.00 needed — target already guaranteed.";
      } else if (required > 5) {
        requiredGpa = required;
        isImpossible = true;
        requirementMessage = "Impossible ⚠️";
      } else {
        requiredGpa = required;
        requirementMessage = `${required.toFixed(2)} semester GPA needed`;
      }
    }
  }

  const update = (key: keyof Omit<PlanForm, "courses">, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError("");
  };

  const setCourse = (id: string, patch: Partial<CourseDraft>) => {
    setForm((prev) => ({
      ...prev,
      courses: prev.courses.map((course) => (course.id === id ? { ...course, ...patch } : course)),
    }));
    setFormError("");
  };

  const validateNumericField = (
    label: string,
    value: string,
    max?: number,
    integer = false,
  ): string | null => {
    if (!value.trim()) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (max !== undefined && number > max)) {
      return `${label} must be between 0 and ${max ?? "a valid number"}.`;
    }
    if (integer && !Number.isInteger(number)) return `${label} must be a whole number.`;
    return null;
  };

  const handleSave = () => {
    if (form.currentCgpa.trim() && !form.completedUnits.trim()) {
      setFormError("Enter completed units with your current CGPA.");
      return;
    }
    if (form.completedUnits.trim() && !form.currentCgpa.trim()) {
      setFormError("Enter your current CGPA with completed units.");
      return;
    }
    const validation =
      validateNumericField("Current CGPA", form.currentCgpa, 5) ??
      validateNumericField("Completed units", form.completedUnits, undefined, true) ??
      validateNumericField("Target CGPA", form.targetCgpa, 5) ??
      validateNumericField("Remaining units", form.remainingUnits, undefined, true);
    if (validation) {
      setFormError(validation);
      return;
    }
    const incompleteCourse = form.courses.some((course) => {
      const hasCode = !!course.code.trim();
      const hasUnits = !!course.units.trim();
      const hasGrade = !!course.grade;
      return (hasCode || hasUnits || hasGrade) && !(hasCode && hasUnits && hasGrade);
    });
    if (incompleteCourse) {
      setFormError("Complete each course row or clear it before saving.");
      return;
    }
    const invalidCourse = form.courses.find((course) => {
      const units = course.units.trim();
      if (!course.code.trim() && !units && !course.grade) return false;
      return course.code.trim().length > 32 ||
        !Number.isInteger(Number(units)) ||
        Number(units) < 1 ||
        Number(units) > 30;
    });
    if (invalidCourse) {
      setFormError("Course codes must be 32 characters or fewer and units must be a whole number from 1 to 30.");
      return;
    }
    if (remaining !== null && plannedUnits > remaining) {
      setFormError("Planned course units cannot exceed your remaining units.");
      return;
    }
    if (plannedCourses.length > 100) {
      setFormError("You can save up to 100 planned courses.");
      return;
    }

    setFormError("");
    savePlan.mutate(
      {
        data: {
          currentCgpa: form.currentCgpa.trim() ? Number(form.currentCgpa) : null,
          completedUnits: form.completedUnits.trim() ? Number(form.completedUnits) : null,
          targetCgpa: form.targetCgpa.trim() ? Number(form.targetCgpa) : null,
          remainingUnits: form.remainingUnits.trim() ? Number(form.remainingUnits) : null,
          courses: plannedCourses,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey, exact: true });
          Alert.alert("Plan saved", "Your CGPA plan has been saved.");
        },
        onError: () => setFormError("Could not save your plan. Please try again."),
      },
    );
  };

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  if (!hasHydrated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>CGPA Calculator</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>CGPA Calculator</Text>
        <View style={styles.backButton} />
      </View>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 26 }]}
        bottomOffset={84}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={[styles.intro, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Plan your next semester</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Track your target and explore how planned courses can move your CGPA.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.inlineLoading}><ActivityIndicator color={colors.primary} /></View>
        ) : isError ? (
          <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.destructive }]}>
              Could not load your saved plan. You can still enter details and try saving.
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your academic numbers</Text>
          <View style={styles.fieldRow}>
            <NumberField label="Current CGPA" value={form.currentCgpa} onChangeText={(v) => update("currentCgpa", v)} colors={colors} decimal />
            <NumberField label="Completed units" value={form.completedUnits} onChangeText={(v) => update("completedUnits", v)} colors={colors} />
          </View>
          <View style={styles.fieldRow}>
            <NumberField label="Target CGPA" value={form.targetCgpa} onChangeText={(v) => update("targetCgpa", v)} colors={colors} decimal />
            <NumberField label="Remaining units" value={form.remainingUnits} onChangeText={(v) => update("remainingUnits", v)} colors={colors} />
          </View>
          <View style={[styles.resultBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>Target plan</Text>
            <Text style={[styles.resultValue, { color: isImpossible ? colors.destructive : colors.foreground }]}>
              {requirementMessage}
            </Text>
            {hasValidTarget && !(completed === 0 && remaining === 0) && (
              <View style={{ alignSelf: "flex-start", marginTop: 9, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: isImpossible ? colors.destructive : colors.primary, backgroundColor: colors.surface }}>
                <Text style={{ color: isImpossible ? colors.destructive : colors.primary, fontSize: 12, fontWeight: "700" }}>
                  {isImpossible ? "Impossible ⚠️" : "Achievable 🎉"}
                </Text>
              </View>
            )}
            {isImpossible && maximumCgpa !== null && (
              <Text style={[styles.resultHint, { color: colors.mutedForeground }]}>
                Maximum possible CGPA: {maximumCgpa.toFixed(2)}
              </Text>
            )}
            {isImpossible && requiredGpa !== null && remaining !== 0 && (
              <Text style={[styles.resultHint, { color: colors.mutedForeground }]}>
                Would require {requiredGpa.toFixed(2)} / 5.00
              </Text>
            )}
            {remaining === 0 && completed !== 0 && !isImpossible && target !== null && current !== null && current >= target && (
              <Text style={[styles.resultHint, { color: colors.mutedForeground }]}>
                No remaining units to raise the CGPA.
              </Text>
            )}
            {plannedUnits > 0 && remaining !== null && plannedUnits > remaining && (
              <Text style={[styles.warning, { color: colors.destructive }]}>
                Planned units exceed remaining units.
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Course simulator</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Incomplete rows are skipped.</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Add course"
              onPress={() => setForm((prev) => ({
                ...prev,
                courses: [...prev.courses, { id: `${userId}-${Date.now()}-${prev.courses.length}`, code: "", units: "", grade: "" }],
              }))}
              style={[styles.addButton, { backgroundColor: colors.primary }]}
            >
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Add</Text>
            </TouchableOpacity>
          </View>
          {form.courses.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add courses to simulate a semester.</Text>
          ) : form.courses.map((course, index) => (
            <View key={course.id} style={[styles.courseRow, { borderTopColor: colors.border }]}>
              <View style={styles.courseTopline}>
                <Text style={[styles.courseNumber, { color: colors.mutedForeground }]}>Course {index + 1}</Text>
                <TouchableOpacity accessibilityLabel={`Remove course ${index + 1}`} onPress={() => setForm((prev) => ({
                  ...prev,
                  courses: prev.courses.filter((item) => item.id !== course.id),
                }))}>
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <View style={styles.courseFields}>
                <TextInput
                  accessibilityLabel="Course code"
                  value={course.code}
                  onChangeText={(code) => setCourse(course.id, { code })}
                  placeholder="Course code"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  style={[styles.input, styles.courseCode, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                />
                <TextInput
                  accessibilityLabel="Course units"
                  value={course.units}
                  onChangeText={(units) => setCourse(course.id, { units })}
                  placeholder="Units"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[styles.input, styles.courseUnits, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                />
                <View style={[styles.gradeSelect, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  {GRADES.map(({ grade }) => (
                    <TouchableOpacity
                      key={grade}
                      accessibilityLabel={`Grade ${grade}`}
                      onPress={() => setCourse(course.id, { grade })}
                      style={[
                        styles.gradeOption,
                        course.grade === grade && { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text style={[
                        styles.gradeText,
                        { color: course.grade === grade ? colors.primaryForeground : colors.mutedForeground },
                      ]}>{grade}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ))}
          <View style={[styles.metricsRow, { borderTopColor: colors.border }]}>
            <Metric label="Semester GPA" value={semesterGpa?.toFixed(2) ?? "—"} colors={colors} />
            <Metric label="Projected CGPA" value={projectedCgpa?.toFixed(2) ?? "—"} colors={colors} />
          </View>
        </View>

        {formError ? (
          <Text accessibilityRole="alert" style={[styles.formError, { color: colors.destructive }]}>{formError}</Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={savePlan.isPending}
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: savePlan.isPending ? 0.65 : 1 }]}
        >
          {savePlan.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="save" size={17} color={colors.primaryForeground} />}
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {savePlan.isPending ? "Saving plan…" : "Save Plan"}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function NumberField({
  label,
  value,
  onChangeText,
  colors,
  decimal = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useColors>;
  decimal?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
      />
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  intro: { borderRadius: 16, borderWidth: 1, padding: 17 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: { borderRadius: 16, borderWidth: 1, padding: 15 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionHint: { fontSize: 12, marginTop: 4 },
  fieldRow: { flexDirection: "row", gap: 10, marginTop: 13 },
  field: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, minHeight: 42, fontSize: 14 },
  resultBox: { borderWidth: 1, borderRadius: 12, marginTop: 14, padding: 13 },
  resultLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  resultValue: { fontSize: 16, fontWeight: "700", marginTop: 5 },
  resultHint: { fontSize: 12, marginTop: 5 },
  warning: { fontSize: 12, fontWeight: "600", marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addButton: { height: 34, paddingHorizontal: 11, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  addButtonText: { fontSize: 12, fontWeight: "700" },
  emptyText: { fontSize: 13, marginTop: 15 },
  courseRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 11 },
  courseTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  courseNumber: { fontSize: 12, fontWeight: "600" },
  courseFields: { flexDirection: "row", alignItems: "center", gap: 7 },
  courseCode: { flex: 1 },
  courseUnits: { width: 68, textAlign: "center" },
  gradeSelect: { flexDirection: "row", borderWidth: 1, borderRadius: 9, padding: 2 },
  gradeOption: { width: 23, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  gradeText: { fontSize: 11, fontWeight: "700" },
  metricsRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 13 },
  metric: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11 },
  metricValue: { fontSize: 18, fontWeight: "700" },
  formError: { fontSize: 13, fontWeight: "600" },
  saveButton: { minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  saveText: { fontSize: 15, fontWeight: "700" },
  inlineLoading: { alignItems: "center", paddingVertical: 4 },
  noticeCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
  body: { fontSize: 13, lineHeight: 19 },
});
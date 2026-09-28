import { Feather } from "@expo/vector-icons";
import { getSearchStudentsQueryKey, useSearchStudents } from "@workspace/api-client-react";
import type { StudentSearchResult } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserVerificationMarks } from "@/components/UserVerificationMarks";
import { useColors } from "@/hooks/useColors";

function StudentRow({
  student,
  onMessage,
}: {
  student: StudentSearchResult;
  onMessage: (userId: string) => void;
}) {
  const colors = useColors();
  const name = student.fullName;

  return (
    <View style={[styles.studentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {student.avatarUrl ? (
        <Image source={{ uri: student.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary + "20" }]}>
          <Text style={[styles.avatarLetter, { color: colors.primary }]}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.studentDetails}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
          <UserVerificationMarks status={student.verificationStatus} />
        </View>
        {student.username ? (
          <Text style={[styles.username, { color: colors.mutedForeground }]} numberOfLines={1}>@{student.username}</Text>
        ) : null}
        <Text style={[styles.department, { color: colors.mutedForeground }]} numberOfLines={1}>
          {student.department || "Department not listed"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message ${name}`}
        testID={`message-student-${student.userId}`}
        onPress={() => onMessage(student.userId)}
        style={({ pressed }) => [styles.messageButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
      >
        <Feather name="message-circle" size={17} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

export default function ExploreScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [searchText, setSearchText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const term = searchText.trim();
  const query = debouncedQuery.trim();
  const canSearch = query.length >= 2;
  const { data, isLoading, isError, refetch, isFetching } = useSearchStudents(
    { q: query },
    { query: { queryKey: getSearchStudentsQueryKey({ q: query }), enabled: canSearch, retry: false } },
  );
  const students = data?.students ?? [];

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchText), 350);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const openMessage = (userId: string) => {
    router.push(`/messages?with=${encodeURIComponent(userId)}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: (isWeb ? 67 : insets.top) + 18, paddingBottom: (isWeb ? 34 : insets.bottom + 58) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CAMPUSX / PEOPLE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Find your people.</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Search students at your school by name, username, or department.
          </Text>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel="Search students"
            testID="student-search-input"
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Name, username, or department"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {searchText.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearchText("")}
              hitSlop={10}
              style={styles.clearButton}
            >
              <Feather name="x-circle" size={17} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {term.length < 2 ? (
          <View style={[styles.infoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconTile, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="users" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Your campus, closer</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Enter at least two characters to discover students in your school.
            </Text>
          </View>
        ) : query !== term || ((isLoading || isFetching) && students.length === 0) ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>Looking for students…</Text>
          </View>
        ) : isError ? (
          <View style={[styles.infoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconTile, { backgroundColor: colors.destructive + "18" }]}>
              <Feather name="wifi-off" size={20} color={colors.destructive} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Search couldn’t load</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Check your connection and try again.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              style={[styles.retryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryText, { color: colors.foreground }]}>Try again</Text>
            </Pressable>
          </View>
        ) : students.length === 0 ? (
          <View style={[styles.infoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconTile, { backgroundColor: colors.surface }]}>
              <Feather name="search" size={20} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>No students found</Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Try a different name, username, or department.
            </Text>
          </View>
        ) : (
          <View style={styles.resultsSection}>
            <View style={styles.resultsHeading}>
              <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Students</Text>
              {isFetching && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
            <View style={styles.resultsList}>
              {students.map((student) => (
                <StudentRow key={student.userId} student={student} onMessage={openMessage} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headingBlock: { marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 9 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 7 },
  searchBox: { minHeight: 54, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 14 },
  clearButton: { padding: 3 },
  status: { alignItems: "center", paddingTop: 70, gap: 14 },
  statusText: { fontSize: 14 },
  infoPanel: { alignItems: "center", borderWidth: 1, borderRadius: 18, marginTop: 24, paddingHorizontal: 24, paddingVertical: 28 },
  iconTile: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  infoTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  infoText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7, maxWidth: 270 },
  retryButton: { borderWidth: 1, borderRadius: 10, marginTop: 17, paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { fontSize: 13, fontWeight: "600" },
  resultsSection: { marginTop: 29 },
  resultsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  resultsTitle: { fontSize: 18, fontWeight: "700" },
  resultsList: { gap: 10 },
  studentCard: { minHeight: 82, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 19, fontWeight: "700" },
  studentDetails: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  name: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  username: { fontSize: 12, marginTop: 2 },
  department: { fontSize: 12, marginTop: 4 },
  messageButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
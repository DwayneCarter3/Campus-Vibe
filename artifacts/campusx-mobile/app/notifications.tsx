import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNotificationsQueryKey,
  useListNotifications,
  markNotificationsRead,
} from "@workspace/api-client-react";
import type { AppNotification } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type NotificationWithSource = AppNotification & {
  sourceType?: string;
  entityType?: string;
  targetType?: string;
  postId?: number | string;
  conversationId?: number | string;
};

function notificationDestination(notification: AppNotification) {
  const item = notification as NotificationWithSource;
  const kind = (item.sourceType ?? item.entityType ?? item.targetType ?? "").toLowerCase();
  if (item.postId || kind.includes("post")) return "/(tabs)";
  if (item.conversationId || /dm|message|conversation/.test(kind)) return "/messages";
  if (/profile|user/.test(kind)) return "/(tabs)/profile";
  return null;
}

function notificationIcon(type: string): React.ComponentProps<typeof Feather>["name"] {
  if (/like|fire|react/i.test(type)) return "heart";
  if (/comment|post/i.test(type)) return "message-circle";
  if (/dm|message/i.test(type)) return "send";
  if (/profile|user/i.test(type)) return "user";
  return "bell";
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [markingRead, setMarkingRead] = useState(false);
  const [markError, setMarkError] = useState("");
  const topPad = insets.top + 10;

  const { data, isLoading, isError, refetch, isRefetching } = useListNotifications(
    { limit: 50 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 50 }),
        refetchInterval: 12_000,
      },
    },
  );
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markAllRead = async () => {
    if (unreadCount === 0 || markingRead) return;
    setMarkingRead(true);
    setMarkError("");
    try {
      await markNotificationsRead();
      queryClient.setQueryData(
        getListNotificationsQueryKey({ limit: 50 }),
        (current: typeof data) => current
          ? {
              ...current,
              unreadCount: 0,
              notifications: current.notifications.map((notification) => ({ ...notification, isRead: true })),
            }
          : current,
      );
    } catch (error) {
      setMarkError(error instanceof Error ? error.message : "Could not mark notifications as read.");
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.headerIcon}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {unreadCount ? `${unreadCount} unread` : "You’re all caught up"}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            onPress={markAllRead}
            disabled={markingRead}
            style={styles.headerIcon}
          >
            {markingRead ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Feather name="check" size={20} color={colors.primary} />
            )}
          </Pressable>
        ) : <View style={styles.headerIcon} />}
      </View>

      {!!markError && (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
          {markError}
        </Text>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn’t load notifications</Text>
          <Pressable onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={[
            styles.list,
            notifications.length === 0 && styles.emptyList,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Feather name="bell" size={22} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Reactions and updates from your campus community will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const destination = notificationDestination(item);
            const timestamp = new Date(item.createdAt);
            return (
              <Pressable
                accessibilityRole={destination ? "button" : undefined}
                onPress={destination ? () => router.push(destination as never) : undefined}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: !item.isRead ? colors.primary + "12" : "transparent",
                    opacity: pressed && destination ? 0.75 : 1,
                  },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.surface }]}>
                  <Feather name={notificationIcon(item.type)} size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.message, { color: colors.foreground }]}>{item.message}</Text>
                  {!!item.actorName && (
                    <Text style={[styles.actor, { color: colors.mutedForeground }]}>from {item.actorName}</Text>
                  )}
                  <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
                    {Number.isNaN(timestamp.getTime()) ? "" : formatDistanceToNow(timestamp, { addSuffix: true })}
                  </Text>
                </View>
                {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: "#ef4444" }]} />}
                {destination && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: 19, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  list: { paddingHorizontal: 16 },
  emptyList: { flexGrow: 1 },
  row: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, gap: 3 },
  message: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  actor: { fontSize: 12 },
  timestamp: { fontSize: 11, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 6 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, marginTop: 4 },
  retryText: { color: "#fff", fontWeight: "700" },
  error: { paddingHorizontal: 16, paddingTop: 10, fontSize: 12 },
});
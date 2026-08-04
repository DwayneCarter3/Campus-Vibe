import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListConversations,
  getListConversationsQueryKey,
  useStartConversation,
  useListMessages,
  getListMessagesQueryKey,
  useSendMessage,
} from "@workspace/api-client-react";
import type { ConversationSummary, DirectMessage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ with?: string }>();
  const withUserId = params.with;

  const [view, setView] = useState<"list" | "chat">("list");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [activeOther, setActiveOther] = useState<{ id: string; name: string } | null>(null);
  const [input, setInput] = useState("");
  const flatRef = useRef<FlatList>(null);
  const autoStarted = useRef(false);

  const startConv = useStartConversation();
  const sendMessage = useSendMessage();

  const { data: convsData, isLoading: convsLoading } = useListConversations({
    query: { queryKey: getListConversationsQueryKey(), refetchInterval: 3000 },
  });

  const { data: msgsData, isLoading: msgsLoading } = useListMessages(
    activeConvId ?? 0,
    undefined,
    {
      query: {
        queryKey: getListMessagesQueryKey(activeConvId ?? 0),
        enabled: activeConvId !== null,
        refetchInterval: 1500,
      },
    }
  );

  const conversations = convsData?.conversations ?? [];
  const messages = msgsData?.messages ?? [];

  // Auto-open conversation when navigated with ?with=userId
  useEffect(() => {
    if (!withUserId || autoStarted.current || startConv.isPending) return;
    autoStarted.current = true;
    startConv.mutate(
      { data: { targetUserId: withUserId } },
      {
        onSuccess: (conv) => {
          setActiveConvId(conv.id);
          setActiveOther({ id: conv.otherUserId, name: conv.otherUserName });
          setView("chat");
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
      }
    );
  }, [withUserId]);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      flatRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const openConv = useCallback((conv: ConversationSummary) => {
    setActiveConvId(conv.id);
    setActiveOther({ id: conv.otherUserId, name: conv.otherUserName });
    setView("chat");
    queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conv.id) });
  }, [queryClient]);

  const handleSend = () => {
    if (!input.trim() || !activeConvId) return;
    const content = input.trim();
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage.mutate(
      { conversationId: activeConvId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(activeConvId) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
      }
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  // ── Conversation List ──────────────────────────────────────────────
  if (view === "list") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Messages</Text>
          <View style={{ width: 32 }} />
        </View>

        {convsLoading && (
          <View style={s.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!convsLoading && conversations.length === 0 && (
          <View style={s.centered}>
            <Feather name="message-circle" size={40} color={colors.mutedForeground} style={{ marginBottom: 12, opacity: 0.4 }} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No conversations yet</Text>
            <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
              Tap "Message Vendor" on any hustle listing
            </Text>
          </View>
        )}

        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: 80 + bottomPad }}
          renderItem={({ item: conv }) => (
            <Pressable
              onPress={() => openConv(conv)}
              style={({ pressed }) => [
                s.convRow,
                { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : "transparent" },
              ]}
            >
              <View style={[s.convAvatar, { backgroundColor: colors.primary + "25" }]}>
                <Text style={[s.convAvatarText, { color: colors.primary }]}>
                  {conv.otherUserName.charAt(0).toUpperCase()}
                </Text>
                {conv.unreadCount > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.primary }]}>
                    <Text style={s.unreadCount}>{conv.unreadCount > 9 ? "9+" : conv.unreadCount}</Text>
                  </View>
                )}
              </View>
              <View style={s.convInfo}>
                <View style={s.convTopRow}>
                  <Text style={[s.convName, { color: colors.foreground }]} numberOfLines={1}>
                    {conv.otherUserName}
                  </Text>
                  <Text style={[s.convTime, { color: colors.mutedForeground }]}>
                    {timeAgo(conv.lastMessageAt)}
                  </Text>
                </View>
                {conv.lastMessage ? (
                  <Text style={[s.convLast, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {conv.lastMessage}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  }

  // ── Chat View ──────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Chat Header */}
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setView("list")} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.chatHeaderInfo}>
          <View style={[s.chatAvatar, { backgroundColor: colors.primary + "25" }]}>
            <Text style={[s.chatAvatarText, { color: colors.primary }]}>
              {(activeOther?.name ?? "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[s.chatName, { color: colors.foreground }]}>{activeOther?.name}</Text>
            <Text style={[s.chatSub, { color: colors.mutedForeground }]}>Direct message</Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={
          msgsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.centered}>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No messages yet</Text>
              <Text style={[s.emptySub, { color: colors.mutedForeground }]}>Say hello! 👋</Text>
            </View>
          )
        }
        renderItem={({ item: msg }: { item: DirectMessage }) => {
          const isMe = msg.senderId === user?.id;
          return (
            <View style={[s.msgRow, isMe ? s.msgRowMe : s.msgRowThem]}>
              <View
                style={[
                  s.bubble,
                  isMe
                    ? [s.bubbleMe, { backgroundColor: colors.primary }]
                    : [s.bubbleThem, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}
              >
                <Text style={[s.bubbleText, { color: isMe ? "#fff" : colors.foreground }]}>
                  {msg.content}
                </Text>
                <Text style={[s.bubbleTime, { color: isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
                  {timeAgo(msg.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input */}
      <View style={[s.inputRow, { borderTopColor: colors.border, paddingBottom: bottomPad + 12, backgroundColor: colors.background }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
          multiline
          maxLength={1000}
          onSubmitEditing={Platform.OS === "web" ? handleSend : undefined}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          activeOpacity={0.8}
          style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.surface }]}
        >
          <Feather name="send" size={18} color={input.trim() ? "#fff" : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  chatHeaderInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 8 },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chatAvatarText: { fontSize: 16, fontWeight: "700" },
  chatName: { fontSize: 15, fontWeight: "700" },
  chatSub: { fontSize: 11 },

  convRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1 },
  convAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", position: "relative" },
  convAvatarText: { fontSize: 20, fontWeight: "700" },
  unreadDot: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  unreadCount: { color: "#fff", fontSize: 10, fontWeight: "700" },
  convInfo: { flex: 1 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  convName: { fontSize: 15, fontWeight: "700", flex: 1, marginRight: 8 },
  convTime: { fontSize: 11 },
  convLast: { fontSize: 13 },
  emptyText: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  emptySub: { fontSize: 13, textAlign: "center" },

  msgRow: { flexDirection: "row", marginBottom: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, marginTop: 3 },

  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});

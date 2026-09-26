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
  useGetWazobiaLanguage,
  getGetWazobiaLanguageQueryKey,
  useSetWazobiaLanguage,
  useChatWithWazobia,
} from "@workspace/api-client-react";
import type { ConversationSummary, DirectMessage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

const WAZOBIA_ID = "system:wazobia";
const WAZOBIA_LANGUAGES = [
  { value: "english", label: "🇬🇧 English", color: "#4567C9" },
  { value: "pidgin", label: "🇳🇬 Pidgin", color: "#218A55" },
  { value: "yoruba", label: "🟢 Yoruba", color: "#28945A" },
  { value: "hausa", label: "🔴 Hausa", color: "#D94B4B" },
  { value: "igbo", label: "🔵 Igbo", color: "#4778D0" },
] as const;
type WazobiaLanguage = (typeof WAZOBIA_LANGUAGES)[number]["value"];

function messageSendError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401) return "Your session has expired. Sign in again to send messages.";
  if (status === 403 || status === 404) return "This conversation is no longer available. Reopen it and try again.";
  if (status === 429) return "Too many messages. Please wait a moment before trying again.";
  return "Message not sent. Your draft is still here—please try again.";
}

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
  const userId = user?.id;
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ with?: string }>();
  const withUserId = params.with;

  const [view, setView] = useState<"list" | "chat">("list");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [activeOther, setActiveOther] = useState<{ id: string; name: string } | null>(null);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [languageOverride, setLanguageOverride] = useState<WazobiaLanguage | null>(null);
  const flatRef = useRef<FlatList>(null);
  const autoStarted = useRef(false);
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;
  const [screenUserId, setScreenUserId] = useState<string | undefined>(userId);
  const accountReady = Boolean(userId) && screenUserId === userId;

  const startConv = useStartConversation();
  const sendMessage = useSendMessage();
  const chatWithWazobia = useChatWithWazobia();
  const setWazobiaLanguage = useSetWazobiaLanguage();
  const { data: wazobiaLanguageData } = useGetWazobiaLanguage({
    query: {
      queryKey: [...getGetWazobiaLanguageQueryKey(), userId],
      enabled: accountReady,
    },
  });
  const selectedLanguage =
    languageOverride ?? wazobiaLanguageData?.language ?? "english";
  const isWazobia = activeOther?.id === WAZOBIA_ID;
  const isSending = isWazobia ? chatWithWazobia.isPending : sendMessage.isPending;

  const { data: convsData, isLoading: convsLoading } = useListConversations({
    query: {
      queryKey: [...getListConversationsQueryKey(), userId],
      enabled: accountReady,
      refetchInterval: 3000,
    },
  });

  const { data: msgsData, isLoading: msgsLoading } = useListMessages(
    activeConvId ?? 0,
    undefined,
    {
      query: {
        queryKey: [...getListMessagesQueryKey(activeConvId ?? 0), userId],
        enabled: accountReady && activeConvId !== null,
        refetchInterval: 1500,
      },
    }
  );

  const conversations = convsData?.conversations ?? [];
  const messages = msgsData?.messages ?? [];

  useEffect(() => {
    if (screenUserId === userId) return;
    setScreenUserId(userId);
    setView("list");
    setActiveConvId(null);
    setActiveOther(null);
    setInput("");
    setSendError(null);
    setLanguageOverride(null);
    autoStarted.current = false;
  }, [screenUserId, userId]);

  // Auto-open conversation when navigated with ?with=userId
  useEffect(() => {
    if (!accountReady || !userId || !withUserId || autoStarted.current || startConv.isPending) return;
    autoStarted.current = true;
    startConv.mutate(
      { data: { targetUserId: withUserId } },
      {
        onSuccess: (conv) => {
          if (currentUserIdRef.current !== userId) return;
          setActiveConvId(conv.id);
          setActiveOther({
            id: conv.otherUserId,
            name: conv.otherUserId === WAZOBIA_ID ? "WAZOBIA AI" : conv.otherUserName,
          });
          setView("chat");
          queryClient.invalidateQueries({
            queryKey: [...getListConversationsQueryKey(), userId],
          });
        },
      }
    );
  }, [accountReady, userId, withUserId, startConv.isPending, queryClient]);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      flatRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const openConv = useCallback((conv: ConversationSummary) => {
    setActiveConvId(conv.id);
    setActiveOther({
      id: conv.otherUserId,
      name: conv.otherUserId === WAZOBIA_ID ? "WAZOBIA AI" : conv.otherUserName,
    });
    setView("chat");
    queryClient.invalidateQueries({
      queryKey: [...getListMessagesQueryKey(conv.id), userId],
    });
  }, [queryClient, userId]);

  const handleSend = () => {
    if (!accountReady || !input.trim() || !activeConvId || isSending) return;
    const content = input.trim();
    setSendError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isWazobia) {
      chatWithWazobia.mutate(
        { data: { content } },
        {
          onSuccess: (result) => {
            if (currentUserIdRef.current !== userId) return;
            setInput((current) => (current.trim() === content ? "" : current));
            queryClient.invalidateQueries({
              queryKey: [...getListMessagesQueryKey(result.conversationId), userId],
            });
            queryClient.invalidateQueries({
              queryKey: [...getListConversationsQueryKey(), userId],
            });
            if (!result.reply) setSendError(result.warning ?? "Your message was sent, but WAZOBIA could not reply.");
          },
          onError: (error) => {
            if (currentUserIdRef.current !== userId) return;
            setSendError(messageSendError(error));
          },
        }
      );
      return;
    }
    sendMessage.mutate(
      { conversationId: activeConvId, data: { content } },
      {
        onSuccess: () => {
          if (currentUserIdRef.current !== userId) return;
          setInput((current) => current.trim() === content ? "" : current);
          queryClient.invalidateQueries({
            queryKey: [...getListMessagesQueryKey(activeConvId), userId],
          });
          queryClient.invalidateQueries({
            queryKey: [...getListConversationsQueryKey(), userId],
          });
        },
        onError: (error) => {
          if (currentUserIdRef.current === userId) setSendError(messageSendError(error));
        },
      }
    );
  };

  const handleLanguageSelect = (language: WazobiaLanguage) => {
    if (language === selectedLanguage || setWazobiaLanguage.isPending) return;
    const previousLanguage = selectedLanguage;
    setLanguageOverride(language);
    setWazobiaLanguage.mutate(
      { data: { language } },
      {
        onSuccess: () => {
          if (currentUserIdRef.current !== userId) return;
          queryClient.invalidateQueries({
            queryKey: [...getGetWazobiaLanguageQueryKey(), userId],
          });
          queryClient.invalidateQueries({
            queryKey: [...getListConversationsQueryKey(), userId],
          });
          if (activeConvId !== null) {
            queryClient.invalidateQueries({
              queryKey: [...getListMessagesQueryKey(activeConvId), userId],
            });
          }
        },
        onError: () => {
          if (currentUserIdRef.current === userId) {
            setLanguageOverride(previousLanguage);
          }
        },
      }
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  if (!accountReady) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={s.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

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
                <Text style={[s.convAvatarText, { color: conv.otherUserId === WAZOBIA_ID ? "#4567C9" : colors.primary }]}>
                  {conv.otherUserId === WAZOBIA_ID ? "🤖" : conv.otherUserName.charAt(0).toUpperCase()}
                </Text>
                {conv.otherUserId === WAZOBIA_ID && (
                  <View style={s.convVerified}>
                    <Feather name="check" size={9} color="#fff" />
                  </View>
                )}
                {conv.unreadCount > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.primary }]}>
                    <Text style={s.unreadCount}>{conv.unreadCount > 9 ? "9+" : conv.unreadCount}</Text>
                  </View>
                )}
              </View>
              <View style={s.convInfo}>
                <View style={s.convTopRow}>
                  <Text style={[s.convName, { color: colors.foreground }]} numberOfLines={1}>
                    {conv.otherUserId === WAZOBIA_ID ? "WAZOBIA AI" : conv.otherUserName}
                  </Text>
                  {conv.otherUserId === WAZOBIA_ID && (
                    <Feather name="check-circle" size={14} color="#4778D0" style={{ marginRight: 8 }} />
                  )}
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
          <View style={[s.chatAvatar, { backgroundColor: isWazobia ? "#E9F1FF" : colors.primary + "25" }]}>
            <Text style={[s.chatAvatarText, { color: isWazobia ? "#4567C9" : colors.primary }]}>
              {isWazobia ? "🤖" : (activeOther?.name ?? "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <View style={s.chatNameRow}>
              <Text style={[s.chatName, { color: colors.foreground }]}>
                {isWazobia ? "WAZOBIA AI" : activeOther?.name}
              </Text>
              {isWazobia && <Feather name="check-circle" size={15} color="#4778D0" />}
            </View>
            <Text style={[s.chatSub, { color: colors.mutedForeground }]}>
              {isWazobia ? "Official assistant" : "Direct message"}
            </Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isWazobia && (
        <FlatList
          horizontal
          data={WAZOBIA_LANGUAGES}
          keyExtractor={(item) => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.languageBar}
          renderItem={({ item }) => {
            const selected = selectedLanguage === item.value;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: setWazobiaLanguage.isPending }}
                onPress={() => handleLanguageSelect(item.value)}
                disabled={setWazobiaLanguage.isPending}
                style={[
                  s.languagePill,
                  {
                    borderColor: selected ? item.color : colors.border,
                    backgroundColor: selected ? `${item.color}18` : colors.surface,
                  },
                ]}
              >
                <Text style={[s.languageText, { color: selected ? item.color : colors.foreground }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

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
      {sendError && (
        <Text accessibilityRole="alert" style={[s.sendError, { color: "#D94B4B" }]}>
          {sendError}
        </Text>
      )}
      <View style={[s.inputRow, { borderTopColor: colors.border, paddingBottom: bottomPad + 12, backgroundColor: colors.background }]}>
        <TextInput
          value={input}
          onChangeText={(text) => {
            setInput(text);
            if (sendError) setSendError(null);
          }}
          editable={!(isWazobia && chatWithWazobia.isPending)}
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
          disabled={!input.trim() || isSending}
          activeOpacity={0.8}
          style={[s.sendBtn, { backgroundColor: input.trim() && !isSending ? colors.primary : colors.surface }]}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Feather name="send" size={18} color={input.trim() ? "#fff" : colors.mutedForeground} />
          )}
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
  chatNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  chatSub: { fontSize: 11 },
  languageBar: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  languagePill: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  languageText: { fontSize: 12, fontWeight: "600" },

  convRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1 },
  convAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", position: "relative" },
  convAvatarText: { fontSize: 20, fontWeight: "700" },
  convVerified: { position: "absolute", right: -2, bottom: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: "#4778D0", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#fff" },
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
  sendError: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12 },
  input: { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});

import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import {
  useListConversations,
  getListConversationsQueryKey,
  useStartConversation,
  useListMessages,
  getListMessagesQueryKey,
  useSendMessage,
} from "@workspace/api-client-react";
import type { ConversationSummary, DirectMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, MessageCircle, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const withUserId = params.get("with");

  const { user } = useUser();
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [activeOtherUser, setActiveOtherUser] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const startConversation = useStartConversation();
  const sendMessage = useSendMessage();

  const { data: convsData, isLoading: convsLoading } = useListConversations({
    query: { queryKey: getListConversationsQueryKey() },
  });

  const { data: messagesData, isLoading: msgsLoading } = useListMessages(
    activeConvId ?? 0,
    undefined,
    {
      query: {
        queryKey: getListMessagesQueryKey(activeConvId ?? 0),
        enabled: activeConvId !== null,
        refetchInterval: 10000, // SSE handles instant updates; this is a safety fallback
      },
    }
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages]);

  useEffect(() => {
    if (withUserId && !startConversation.isPending) {
      startConversation.mutate(
        { data: { targetUserId: withUserId } },
        {
          onSuccess: (conv) => {
            setActiveConvId(conv.id);
            setActiveOtherUser({ id: conv.otherUserId, name: conv.otherUserName, avatarUrl: conv.otherUserAvatarUrl });
            setMobileView("chat");
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          },
        }
      );
    }
  }, [withUserId]);

  const openConversation = (conv: ConversationSummary) => {
    setActiveConvId(conv.id);
    setActiveOtherUser({ id: conv.otherUserId, name: conv.otherUserName, avatarUrl: conv.otherUserAvatarUrl });
    setMobileView("chat");
    queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conv.id) });
  };

  const handleSend = () => {
    if (!messageInput.trim() || !activeConvId) return;
    sendMessage.mutate(
      { conversationId: activeConvId, data: { content: messageInput.trim() } },
      {
        onSuccess: () => {
          setMessageInput("");
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(activeConvId) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
      }
    );
  };

  const conversations = convsData?.conversations ?? [];

  return (
    <div className="container mx-auto px-0 sm:px-4 py-6 max-w-4xl">
      <div className="glass rounded-2xl overflow-hidden border border-white/5" style={{ minHeight: "calc(100vh - 140px)" }}>
        <div className="flex h-full" style={{ minHeight: "calc(100vh - 140px)" }}>

          {/* Sidebar: Conversation List */}
          <div className={cn(
            "w-full sm:w-72 border-r border-white/5 flex flex-col shrink-0",
            mobileView === "chat" ? "hidden sm:flex" : "flex"
          )}>
            <div className="p-4 border-b border-white/5">
              <h2 className="font-bold gradient-text text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Messages
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your conversations</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {convsLoading && (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!convsLoading && conversations.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No conversations yet.</p>
                  <p className="text-xs mt-1">Hit "Message Vendor" on any hustle listing to start one.</p>
                </div>
              )}

              {conversations.map((conv) => (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => openConversation(conv)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-white/5",
                    activeConvId === conv.id
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-white/5"
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10 border border-white/10">
                      <AvatarImage src={conv.otherUserAvatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs gradient-text font-bold">
                        {conv.otherUserName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm truncate">{conv.otherUserName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })}
                      </span>
                    </div>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className={cn(
            "flex-1 flex flex-col",
            mobileView === "list" ? "hidden sm:flex" : "flex"
          )}>
            {!activeConvId ? (
              <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground">
                <div>
                  <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-base font-medium">Select a conversation</p>
                  <p className="text-sm mt-1 opacity-70">or go to a hustle listing to start one</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-white/5 flex items-center gap-3">
                  <button
                    onClick={() => { setMobileView("list"); setActiveConvId(null); }}
                    className="sm:hidden p-1 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                    <AvatarImage src={activeOtherUser?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs gradient-text font-bold">
                      {(activeOtherUser?.name ?? "?").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-sm">{activeOtherUser?.name}</div>
                    <div className="text-xs text-muted-foreground">Direct message</div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {msgsLoading && (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                          <Skeleton className="h-10 w-48 rounded-2xl" />
                        </div>
                      ))}
                    </div>
                  )}

                  {!msgsLoading && (messagesData?.messages ?? []).length === 0 && (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      No messages yet — say hello! 👋
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {(messagesData?.messages ?? []).map((msg: DirectMessage) => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("flex", isMe ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                              isMe
                                ? "bg-gradient-to-br from-pink-500/80 to-orange-500/80 text-white rounded-br-md"
                                : "bg-white/10 text-foreground rounded-bl-md"
                            )}
                          >
                            <p className="break-words">{msg.content}</p>
                            <p className={cn("text-[10px] mt-1", isMe ? "text-white/60" : "text-muted-foreground")}>
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-white/5 flex gap-2">
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="bg-background/40 border-white/10 focus:border-primary/40 flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="gradient-btn h-10 w-10 shrink-0"
                    disabled={!messageInput.trim() || sendMessage.isPending}
                    onClick={handleSend}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

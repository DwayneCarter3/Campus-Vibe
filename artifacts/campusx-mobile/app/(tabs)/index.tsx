import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ExpoLinking from "expo-linking";
import { formatDistanceToNow } from "date-fns";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import {
  listPosts,
  getListPostsQueryKey,
  useListNotifications,
  getListNotificationsQueryKey,
  useLikePost,
  useNoCapPost,
  useCreatePost,
  useVotePoll,
  useGetMyProfile,
  useUpdatePost,
  useDeletePost,
  useToggleSavePost,
  useReportPost,
  useToggleFeaturePost,
  usePinPostToProfile,
  useRequestUploadUrl,
  getGetPostQueryKey,
  useGetShuttleStatus,
  getGetShuttleStatusQueryKey,
  useVoteShuttleStatus,
  Post,
  Poll,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { UserVerificationMarks } from "@/components/UserVerificationMarks";
import { uploadCampusImage } from "@/lib/mediaUpload";

const FACULTIES = [
  "Arts", "Science", "Law", "Social Sciences", "Education",
  "Engineering", "Management Sciences", "Communication & Media Studies",
];

const CATEGORIES = [
  { label: "All Gist", value: undefined, emoji: "✨" },
  { label: "Shuttle Updates", value: "Shuttle Updates", emoji: "🚌" },
  { label: "Portal Down", value: "Portal Down", emoji: "💻" },
  { label: "Exam Timetable", value: "Exam Timetable", emoji: "📅" },
  { label: "Amebo Hot", value: "Amebo Hot", emoji: "🌶️" },
] as const;

type FeedCategory = Post["category"];

const hiddenPostIds = new Set<number>();
const REPORT_REASONS = ["Spam", "Harassment", "Fake Listing", "Inappropriate Content"] as const;
const SHUTTLE_VOTES = [
  { value: "fast_moving", label: "Fast Moving 🟢", color: "#22C55E" },
  { value: "long_queue", label: "Long Queue 🟡", color: "#EAB308" },
  { value: "gridlock", label: "Gridlock/No Shuttles 🔴", color: "#EF4444" },
] as const;

function ShuttleStatusBanner() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const queryKey = getGetShuttleStatusQueryKey();
  const { data: shuttle, isLoading, isError } = useGetShuttleStatus({
    query: { queryKey, refetchInterval: 15_000 },
  });
  const [voteError, setVoteError] = useState("");
  const vote = useVoteShuttleStatus({
    mutation: {
      onSuccess: () => {
        setVoteError("");
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: (error) => setVoteError(error.message),
    },
  });
  const currentStatus = shuttle?.status;
  const statusOption = SHUTTLE_VOTES.find((option) => option.value === currentStatus);
  const updatedAgo = shuttle?.updatedAt
    ? formatDistanceToNow(new Date(shuttle.updatedAt), { addSuffix: true })
    : null;

  return (
    <View style={[styles.shuttleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.shuttleHeadingRow}>
        <View style={[styles.shuttleIcon, { backgroundColor: colors.primary + "20" }]}>
          <Feather name="truck" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shuttleTitle, { color: colors.foreground }]}>Ojo Gate Shuttle Status</Text>
          <Text style={[styles.shuttleCaption, { color: colors.mutedForeground }]}>Live student check-in · refreshes every 15s</Text>
        </View>
        {vote.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>

      {isLoading ? (
        <View style={styles.shuttleLoading}><ActivityIndicator color={colors.primary} size="small" /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Checking the gate…</Text></View>
      ) : isError ? (
        <Text style={[styles.shuttleEmpty, { color: colors.mutedForeground }]}>Couldn't load shuttle status. We'll try again in 15 seconds.</Text>
      ) : (
        <>
          <View style={[styles.shuttleCurrent, { backgroundColor: statusOption ? statusOption.color + "18" : colors.surface }]}>
            <View style={[styles.shuttleLiveDot, { backgroundColor: statusOption?.color ?? colors.mutedForeground }]} />
            <Text style={[styles.shuttleCurrentText, { color: statusOption?.color ?? colors.mutedForeground }]}>
              {statusOption ? statusOption.label : shuttle?.voteCount ? "No clear majority yet" : "No student updates yet"}
            </Text>
          </View>
          {updatedAgo && shuttle?.voteCount ? (
            <Text style={[styles.shuttleUpdated, { color: colors.mutedForeground }]}>
              {statusOption ? "Majority · " : ""}updated {updatedAgo} by {shuttle.voteCount} {shuttle.voteCount === 1 ? "student" : "students"}
            </Text>
          ) : (
            <Text style={[styles.shuttleUpdated, { color: colors.mutedForeground }]}>Be the first student to share a status.</Text>
          )}
          <View style={styles.shuttleVoteList}>
            {SHUTTLE_VOTES.map((option) => {
              const isOwnVote = shuttle?.myVote === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isOwnVote, disabled: vote.isPending }}
                  disabled={vote.isPending}
                  onPress={() => {
                    setVoteError("");
                    vote.mutate({ data: { status: option.value } });
                  }}
                  style={[
                    styles.shuttleVoteButton,
                    { borderColor: isOwnVote ? option.color : colors.border },
                    isOwnVote && { backgroundColor: option.color + "18" },
                  ]}
                >
                  <Text style={[styles.shuttleVoteText, { color: isOwnVote ? option.color : colors.foreground }]}>{option.label}</Text>
                  {isOwnVote ? <Feather name="check" size={15} color={option.color} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {shuttle?.myVote ? (
            <Text style={[styles.shuttleFeedback, { color: colors.primary }]}>Your vote is counted. Thanks for the update.</Text>
          ) : null}
          {vote.isPending ? (
            <Text style={[styles.shuttleFeedback, { color: colors.mutedForeground }]}>Sending your vote…</Text>
          ) : null}
          {voteError ? <Text style={[styles.shuttleFeedback, { color: colors.destructive ?? "#EF4444" }]}>{voteError}</Text> : null}
        </>
      )}
    </View>
  );
}

function mediaUri(path: string): string {
  if (!path.startsWith("/") || Platform.OS === "web") return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}${path}` : path;
}

export function PostCard({ post, onHide }: { post: Post; onHide?: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: profile } = useGetMyProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  // Keep only the just-submitted result locally; normal feed refreshes should win.
  const [poll, setPoll] = useState<Poll | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [voteError, setVoteError] = useState("");

  const likeMutation = useLikePost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() }),
    },
  });
  const noCapMutation = useNoCapPost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() }),
    },
  });
  const voteMutation = useVotePoll({
    mutation: {
      onSuccess: (updatedPoll) => {
        setPoll(updatedPoll);
        setSelectedOptionId(null);
        setVoteError("");
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
      onError: (error) => {
        setPoll(null);
        setVoteError(error.message);
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
    },
  });
  const invalidatePostData = () => {
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) });
  };
  const updateMutation = useUpdatePost({
    mutation: {
      onSuccess: () => {
        setEditOpen(false);
        invalidatePostData();
      },
      onError: (error) => Alert.alert("Couldn't update post", error.message),
    },
  });
  const deleteMutation = useDeletePost({
    mutation: {
      onSuccess: () => {
        invalidatePostData();
        setMenuOpen(false);
      },
      onError: (error) => Alert.alert("Couldn't delete post", error.message),
    },
  });
  const saveMutation = useToggleSavePost({
    mutation: {
      onSuccess: () => invalidatePostData(),
      onError: (error) => Alert.alert("Couldn't update saved posts", error.message),
    },
  });
  const reportMutation = useReportPost({
    mutation: {
      onSuccess: () => {
        setReportOpen(false);
        Alert.alert("Report submitted", "Thank you for helping keep CampusX safe.");
      },
      onError: (error) => Alert.alert("Couldn't submit report", error.message),
    },
  });
  const featureMutation = useToggleFeaturePost({
    mutation: {
      onSuccess: () => invalidatePostData(),
      onError: (error) => Alert.alert("Couldn't update trending feature", error.message),
    },
  });
  const pinMutation = usePinPostToProfile({
    mutation: {
      onSuccess: () => invalidatePostData(),
      onError: (error) => Alert.alert("Couldn't update profile pin", error.message),
    },
  });
  const isAdmin = profile?.isAdmin === true || profile?.role === "admin" || profile?.role === "ceo";

  const confirmDelete = (adminDelete = false) => {
    Alert.alert(
      adminDelete ? "Delete Post (Admin)" : "Delete Post",
      "This post will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ postId: post.id }),
        },
      ],
    );
  };

  const copyPostLink = () => {
    Clipboard.setString(ExpoLinking.createURL(`/post/${post.id}`));
    setMenuOpen(false);
    Alert.alert("Link copied", "Post link copied to clipboard.");
  };

  const hideForSession = () => {
    hiddenPostIds.add(post.id);
    setMenuOpen(false);
    onHide?.();
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
  };

  const handleFire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    likeMutation.mutate({ postId: post.id });
  };

  const handleNoCap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noCapMutation.mutate({ postId: post.id });
  };

  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
  const displayedPoll = poll?.id === post.poll?.id && post.poll?.selectedOptionId == null
    ? poll
    : post.poll;
  const pollExpired = displayedPoll
    ? displayedPoll.isExpired || new Date(displayedPoll.expiresAt).getTime() <= Date.now()
    : false;
  const pollHasVoted = Boolean(displayedPoll?.selectedOptionId !== null && displayedPoll?.selectedOptionId !== undefined);
  const showPollResults = displayedPoll?.totalVotes !== null && (pollExpired || pollHasVoted);
  const pollTotalVotes = displayedPoll
    ? displayedPoll.totalVotes ?? displayedPoll.options.reduce((total, option) => total + (option.voteCount ?? 0), 0)
    : 0;

  const handleVote = () => {
    if (!displayedPoll || selectedOptionId === null || pollExpired || pollHasVoted || voteMutation.isPending) return;
    setVoteError("");
    voteMutation.mutate({ pollId: displayedPoll.id, data: { optionId: selectedOptionId } });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: post.isAnonymous ? "#251739" : colors.surface }, post.isAnonymous && { borderWidth: 1, borderColor: "#8B5CF666" }]}>
          {post.isAnonymous
            ? <Feather name="user-x" size={20} color="#C4B5FD" />
            : post.authorAvatarUrl
              ? <Image source={{ uri: mediaUri(post.authorAvatarUrl) }} style={styles.avatarImage} />
              : <Text style={[styles.avatarText, { color: colors.primary }]}>{post.authorName.charAt(0)}</Text>}
        </View>
        <View style={styles.authorInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
            <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{post.authorName}</Text>
            {!post.isAnonymous && <UserVerificationMarks status={post.authorVerificationStatus} />}
            {post.isAnonymous && (
              <View style={{ backgroundColor: "#8B5CF622", borderColor: "#8B5CF666", borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: "#C4B5FD", fontWeight: "600" }}>Anon Post</Text>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{post.authorFaculty}</Text>
            </View>
            {!post.isAnonymous && (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{post.authorLevel}</Text>
              </View>
            )}
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo}</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Post options"
          onPress={() => setMenuOpen(true)}
          style={styles.optionsButton}
        >
          <Feather name="more-vertical" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={{ alignSelf: "flex-start", borderColor: colors.primary + "55", backgroundColor: colors.primary + "16", borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginTop: 8 }}>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>
          {CATEGORIES.find((item) => item.value === post.category)?.emoji ?? "🌶️"} {post.category}
        </Text>
      </View>
      {post.content ? <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text> : null}
      {post.imageUrl ? (
        <ExpoImage
          source={{ uri: mediaUri(post.imageUrl) }}
          placeholder={post.blurDataUrl ? { uri: post.blurDataUrl } : undefined}
          transition={180}
          contentFit="cover"
          style={[styles.postImage, { backgroundColor: colors.surface }]}
        />
      ) : null}
      {post.originalPost && (
        <View style={[styles.reshareCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.reshareHeader}>
            <View style={[styles.reshareAvatar, { backgroundColor: colors.card }]}>
              {post.originalPost.isAnonymous
                ? <Feather name="user-x" size={16} color={colors.mutedForeground} />
                : post.originalPost.authorAvatarUrl
                  ? <Image source={{ uri: mediaUri(post.originalPost.authorAvatarUrl) }} style={styles.avatarImage} />
                  : <Text style={[styles.reshareAvatarText, { color: colors.primary }]}>{post.originalPost.authorName.charAt(0)}</Text>}
            </View>
            <View style={styles.reshareAuthorInfo}>
              <View style={styles.reshareMetaRow}>
                <Text style={[styles.reshareAuthorName, { color: colors.foreground }]}>{post.originalPost.authorName}</Text>
                {!post.originalPost.isAnonymous && <UserVerificationMarks status={post.originalPost.authorVerificationStatus} />}
                <Text style={[styles.reshareLabel, { color: colors.mutedForeground, borderColor: colors.border }]}>Original post</Text>
                <Text style={[styles.timeTextSmall, { color: colors.mutedForeground }]}>
                  {formatDistanceToNow(new Date(post.originalPost.createdAt), { addSuffix: true })}
                </Text>
              </View>
            </View>
          </View>
          {post.originalPost.content ? <Text style={[styles.reshareContent, { color: colors.foreground }]}>{post.originalPost.content}</Text> : null}
          {post.originalPost.imageUrl ? (
            <ExpoImage
              source={{ uri: mediaUri(post.originalPost.imageUrl) }}
              transition={180}
              contentFit="cover"
              style={[styles.reshareImage, { backgroundColor: colors.card }]}
            />
          ) : null}
        </View>
      )}

      {displayedPoll && (
        <View style={[styles.pollContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.pollHeader}>
            <View style={styles.pollLabel}>
              <Feather name="bar-chart-2" size={14} color={colors.primary} />
              <Text style={[styles.pollLabelText, { color: colors.primary }]}>POLL</Text>
            </View>
            {(pollExpired || pollHasVoted) && (
              <View style={[styles.pollEndedBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.pollEndedText, { color: colors.mutedForeground }]}>{pollExpired ? "Poll Ended" : "Voted"}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.pollQuestion, { color: colors.foreground }]}>{displayedPoll.question}</Text>
          <Text style={[styles.pollExpiry, { color: colors.mutedForeground }]}>
            {pollExpired
              ? `Ended ${formatDistanceToNow(new Date(displayedPoll.expiresAt), { addSuffix: true })}`
              : `Ends ${formatDistanceToNow(new Date(displayedPoll.expiresAt), { addSuffix: true })}`}
          </Text>
          <View style={styles.pollOptions}>
            {displayedPoll.options.map((option) => {
              const isSelected = (showPollResults && displayedPoll.selectedOptionId === option.id)
                || (!showPollResults && selectedOptionId === option.id);
              const percentage = pollTotalVotes > 0
                ? Math.round(((option.voteCount ?? 0) / pollTotalVotes) * 100)
                : 0;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  disabled={showPollResults || pollExpired || voteMutation.isPending}
                  onPress={() => setSelectedOptionId(option.id)}
                  activeOpacity={showPollResults ? 1 : 0.75}
                  style={[
                    styles.pollOption,
                    { borderColor: isSelected ? colors.primary : colors.border },
                    isSelected && { backgroundColor: colors.primary + "12" },
                  ]}
                >
                  {showPollResults && (
                    <View style={[styles.pollBar, { width: `${percentage}%`, backgroundColor: colors.primary + "20" }]} />
                  )}
                  <View style={styles.pollOptionContent}>
                    {!showPollResults && (
                      <View style={[styles.pollRadio, { borderColor: isSelected ? colors.primary : colors.mutedForeground }]}>
                        {isSelected && <View style={[styles.pollRadioSelected, { backgroundColor: colors.primary }]} />}
                      </View>
                    )}
                    <Text style={[styles.pollOptionText, { color: colors.foreground }]}>{option.optionText}</Text>
                    {showPollResults && (
                      <Text style={[styles.pollPercentage, { color: isSelected ? colors.primary : colors.mutedForeground }]}>
                        {percentage}%
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {!showPollResults && !pollExpired && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleVote}
              disabled={selectedOptionId === null || voteMutation.isPending}
              style={[
                styles.voteButton,
                { backgroundColor: selectedOptionId !== null && !voteMutation.isPending ? colors.primary : colors.muted },
              ]}
            >
              {voteMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.voteButtonText, { color: selectedOptionId !== null ? "#fff" : colors.mutedForeground }]}>Vote</Text>}
            </TouchableOpacity>
          )}
          {voteError ? <Text style={[styles.pollError, { color: colors.destructive ?? "#ef4444" }]}>{voteError}</Text> : null}
          <Text style={[styles.pollVoteCount, { color: colors.mutedForeground }]}>
            {displayedPoll.totalVotes === null
              ? pollExpired ? "Loading final results…" : "Results appear after you vote"
              : `${pollTotalVotes} ${pollTotalVotes === 1 ? "vote" : "votes"}`}
          </Text>
        </View>
      )}

      <View style={[styles.reactions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleFire}
          style={[styles.reactionBtn, post.isLikedByMe && { backgroundColor: "#FF791A22" }]}
          activeOpacity={0.7}
          disabled={likeMutation.isPending}
        >
          <Text style={styles.reactionEmoji}>🔥</Text>
          <Text style={[styles.reactionCount, { color: post.isLikedByMe ? "#FF791A" : colors.mutedForeground }]}>
            {post.likesCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNoCap}
          style={[styles.reactionBtn, post.isNoCapByMe && { backgroundColor: "#3B82F622" }]}
          activeOpacity={0.7}
          disabled={noCapMutation.isPending}
        >
          <Text style={styles.reactionEmoji}>🧢</Text>
          <Text style={[styles.reactionCount, { color: post.isNoCapByMe ? "#3B82F6" : colors.mutedForeground }]}>
            {post.noCapsCount}
          </Text>
        </TouchableOpacity>

        <View style={styles.reactionSpacer} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open post"
          onPress={() => router.push(`/post/${post.id}`)}
          style={styles.detailLink}
        >
          <Feather name="external-link" size={14} color={colors.mutedForeground} />
          <Text style={[styles.timeTextSmall, { color: colors.mutedForeground }]}>Post</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {post.isOwnedByMe ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setEditedContent(post.content); setMenuOpen(false); setEditOpen(true); }}>
                  <Feather name="edit-2" size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>Edit Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => confirmDelete()}>
                  <Feather name="trash-2" size={18} color={colors.destructive ?? "#ef4444"} />
                  <Text style={[styles.menuText, { color: colors.destructive ?? "#ef4444" }]}>Delete Post</Text>
                </TouchableOpacity>
                {!post.isAnonymous && (
                  <TouchableOpacity style={styles.menuItem} onPress={() => { pinMutation.mutate({ postId: post.id }); setMenuOpen(false); }}>
                    <Feather name="map-pin" size={18} color={colors.foreground} />
                    <Text style={[styles.menuText, { color: colors.foreground }]}>{post.isPinnedToProfile ? "Unpin from Profile" : "Pin Profile"}</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { saveMutation.mutate({ postId: post.id }); setMenuOpen(false); }}>
                  <Feather name={post.isSavedByMe ? "bookmark" : "bookmark"} size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>{post.isSavedByMe ? "Unsave Post" : "Save Post"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={copyPostLink}>
                  <Feather name="link" size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>Copy Link to Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={hideForSession}>
                  <Feather name="eye-off" size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>Hide for session</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setReportOpen(true); }}>
                  <Feather name="flag" size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>Report</Text>
                </TouchableOpacity>
              </>
            )}
            {isAdmin && (
              <>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.menuItem} onPress={() => confirmDelete(true)}>
                  <Feather name="trash-2" size={18} color={colors.destructive ?? "#ef4444"} />
                  <Text style={[styles.menuText, { color: colors.destructive ?? "#ef4444" }]}>Delete Post (Admin)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { featureMutation.mutate({ postId: post.id }); setMenuOpen(false); }}>
                  <Feather name="trending-up" size={18} color={colors.foreground} />
                  <Text style={[styles.menuText, { color: colors.foreground }]}>{post.isFeaturedTrending ? "Remove from Trending Gist" : "Feature on Trending Gist"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <View style={[styles.editModal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setEditOpen(false)} style={styles.modalHeaderBtn}>
              <Text style={[styles.modalHeaderBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Post</Text>
            <TouchableOpacity
              disabled={updateMutation.isPending || !editedContent.trim()}
              onPress={() => updateMutation.mutate({ postId: post.id, data: { content: editedContent.trim() } })}
              style={[styles.postButton, { backgroundColor: editedContent.trim() && !updateMutation.isPending ? colors.primary : colors.muted }]}
            >
              {updateMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.postButtonText, { color: editedContent.trim() ? "#fff" : colors.mutedForeground }]}>Save</Text>}
            </TouchableOpacity>
          </View>
          <TextInput
            value={editedContent}
            onChangeText={setEditedContent}
            multiline
            maxLength={500}
            placeholder="Edit your post"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.editInput, { color: colors.foreground }]}
          />
        </View>
      </Modal>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.menuBackdrop}>
          <View style={[styles.menuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.reportTitle, { color: colors.foreground }]}>Report post</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                disabled={reportMutation.isPending}
                style={styles.menuItem}
                onPress={() => reportMutation.mutate({ postId: post.id, data: { reason } })}
              >
                <Feather name="flag" size={17} color={colors.mutedForeground} />
                <Text style={[styles.menuText, { color: colors.foreground }]}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.reportCancel} onPress={() => setReportOpen(false)}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ComposeModal({ visible, onClose, onPosted }: { visible: boolean; onClose: () => void; onPosted: (category: FeedCategory) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [category, setCategory] = useState<FeedCategory | "All">("Amebo Hot");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [showFacultyPicker, setShowFacultyPicker] = useState(false);
  const [selectedFaculty] = useState("LASU Ojo");
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();

  const createPost = useCreatePost({
    mutation: {
      onSuccess: (_post, variables) => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPosted(variables.data.category ?? "Amebo Hot");
        setContent("");
        setPollEnabled(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setCategory("Amebo Hot");
        setIsAnonymous(true);
        setImageAsset(null);
        onClose();
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    },
  });

  const trimmedPollOptions = pollOptions.map((option) => option.trim());
  const pollIsValid = pollQuestion.trim().length > 0
    && trimmedPollOptions.length >= 2
    && trimmedPollOptions.length <= 4
    && trimmedPollOptions.every(Boolean)
    && new Set(trimmedPollOptions.map((option) => option.toLocaleLowerCase())).size === trimmedPollOptions.length;
  const canPost = pollEnabled ? pollIsValid : Boolean(content.trim());

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) setImageAsset(result.assets[0]);
  };

  const handlePost = async () => {
    if (!canPost) return;
    setIsUploadingImage(true);
    try {
      const image = imageAsset
        ? await uploadCampusImage(imageAsset, "post-image", (request) =>
            requestUploadUrl.mutateAsync({ data: request }),
          )
        : null;
      createPost.mutate({
        data: {
          content: content.trim(),
          category: category === "All" ? "Amebo Hot" : category,
          isAnonymous,
          ...(image ? { imageUrl: image.imageUrl, blurDataUrl: image.blurDataUrl } : {}),
          ...(pollEnabled ? { poll: { question: pollQuestion.trim(), options: trimmedPollOptions } } : {}),
        },
      });
    } catch (error) {
      Alert.alert("Image upload failed", error instanceof Error ? error.message : "Could not upload the image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalHeaderBtn}>
              <Text style={[styles.modalHeaderBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Drop Gist 📢</Text>
            <TouchableOpacity
              onPress={handlePost}
              disabled={!canPost || createPost.isPending || isUploadingImage}
              style={[styles.postButton, { backgroundColor: canPost && !createPost.isPending && !isUploadingImage ? colors.primary : colors.muted }]}
            >
              {createPost.isPending || isUploadingImage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.postButtonText, { color: canPost ? "#fff" : colors.mutedForeground }]}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.composeRow}>
              <View style={[styles.avatar, { backgroundColor: isAnonymous ? "#251739" : colors.surface }]}>
                {isAnonymous
                  ? <Feather name="user-x" size={20} color="#C4B5FD" />
                  : <Text style={[styles.avatarText, { color: colors.primary }]}>G</Text>}
              </View>
              <View style={{ flex: 1 }}>
                {isAnonymous && <Text style={{ color: "#C4B5FD", fontSize: 12, fontWeight: "600", marginBottom: 5 }}>Posting as Anonymous LASUite</Text>}
                <View style={[styles.facultyPicker, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.facultyPickerText, { color: colors.primary }]}>{selectedFaculty}</Text>
                </View>
              </View>
            </View>

            <TextInput
              style={[styles.contentInput, { color: colors.foreground }]}
              value={content}
              onChangeText={setContent}
              placeholder="Wetin happen for campus today? Drop the gist... 🗣️"
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoFocus
              maxLength={500}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Attach an image"
                onPress={() => void pickImage()}
                style={[styles.createPollToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Feather name="image" size={17} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Add image</Text>
              </TouchableOpacity>
              {imageAsset ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Remove attached image"
                  onPress={() => setImageAsset(null)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <ExpoImage source={{ uri: imageAsset.uri }} style={{ width: 42, height: 42, borderRadius: 8 }} contentFit="cover" />
                  <Feather name="x-circle" size={19} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityLabel="Create a poll"
              accessibilityState={{ checked: pollEnabled }}
              onPress={() => setPollEnabled((enabled) => !enabled)}
              style={[
                styles.createPollToggle,
                { borderColor: pollEnabled ? colors.primary : colors.border, backgroundColor: pollEnabled ? colors.primary + "16" : colors.surface },
              ]}
            >
              <Feather name="bar-chart-2" size={17} color={pollEnabled ? colors.primary : colors.mutedForeground} />
              <Text style={{ color: pollEnabled ? colors.primary : colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                {pollEnabled ? "Poll added · 24 hours" : "Create Poll"}
              </Text>
            </TouchableOpacity>
            {pollEnabled && (
              <View style={[styles.pollForm, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <TextInput
                  accessibilityLabel="Poll question"
                  style={[styles.pollQuestionInput, { color: colors.foreground, borderColor: colors.border }]}
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Ask your campus..."
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={240}
                />
                {pollOptions.map((option, index) => (
                  <View key={`poll-option-${index}`} style={styles.pollInputRow}>
                    <TextInput
                      accessibilityLabel={`Poll option ${index + 1}`}
                      style={[styles.pollOptionInput, { color: colors.foreground, borderColor: colors.border }]}
                      value={option}
                      onChangeText={(value) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
                      placeholder={`Option ${index + 1}`}
                      placeholderTextColor={colors.mutedForeground}
                      maxLength={100}
                    />
                    {pollOptions.length > 2 && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Remove option ${index + 1}`}
                        onPress={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        style={styles.removePollOption}
                      >
                        <Feather name="x" size={17} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {pollOptions.length < 4 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setPollOptions((current) => [...current, ""])}
                    style={styles.addPollOption}
                  >
                    <Feather name="plus" size={15} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Add Option</Text>
                  </TouchableOpacity>
                )}
                {!pollIsValid && (pollQuestion.trim() || pollOptions.some((option) => option.trim())) && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                    Enter a question and 2–4 distinct, non-empty choices.
                  </Text>
                )}
              </View>
            )}
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 8 }}>Post category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {CATEGORIES.map((item) => {
                const value = item.value ?? "All";
                return (
                  <TouchableOpacity
                    key={item.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === value }}
                    onPress={() => {
                      setCategory(value);
                      setIsAnonymous(value === "Amebo Hot" || value === "All");
                    }}
                    style={{ borderWidth: 1, borderColor: category === value ? colors.primary : colors.border, backgroundColor: category === value ? colors.primary + "20" : colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ color: category === value ? colors.primary : colors.mutedForeground, fontSize: 12 }}>{item.emoji} {item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {category === "All" && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>All Gist is a feed view. This post will be tagged Amebo Hot.</Text>}
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityLabel="Post anonymously"
              accessibilityState={{ checked: isAnonymous }}
              onPress={() => setIsAnonymous((value) => !value)}
              style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, marginTop: 12, borderWidth: 1, borderColor: isAnonymous ? "#8B5CF6" : colors.border, backgroundColor: isAnonymous ? "#8B5CF622" : colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}
            >
              <Feather name="user-x" size={16} color={isAnonymous ? "#C4B5FD" : colors.mutedForeground} />
              <Text style={{ color: isAnonymous ? "#C4B5FD" : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{isAnonymous ? "Anon on" : "Anon?"}</Text>
            </TouchableOpacity>
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{content.length}/500</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AmeboFeed() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FeedCategory | undefined>(undefined);
  const [savedOnly, setSavedOnly] = useState(false);
  const [, setHiddenRevision] = useState(0);

  const postParams = savedOnly ? { savedOnly: true } : { ...(activeCategory ? { category: activeCategory } : {}) };
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: [getListPostsQueryKey()[0], postParams, userId, "infinite"],
    enabled: !!userId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listPosts({
      ...postParams,
      limit: 10,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 20_000,
  });
  const { data: notificationData } = useListNotifications(
    { limit: 50 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 50 }),
        refetchInterval: 12_000,
      },
    },
  );
  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];
  const posts = Array.from(new Map(allPosts.map((post) => [post.id, post])).values())
    .filter((post) => !hiddenPostIds.has(post.id));
  const unreadNotifications = notificationData?.notifications?.filter((item) => !item.isRead).length ?? 0;

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Amebo</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>LASU Ojo campus gist 🏛️</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/notifications")}
            style={styles.notificationBtn}
          >
            <Feather name="bell" size={20} color={colors.foreground} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setComposeOpen(true)} style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
            <Feather name="edit-3" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 11 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: savedOnly }}
          onPress={() => { setSavedOnly((value) => !value); setActiveCategory(undefined); }}
          style={{ borderWidth: 1, borderColor: savedOnly ? colors.primary : colors.border, backgroundColor: savedOnly ? colors.primary + "20" : colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: savedOnly ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>Saved</Text>
        </TouchableOpacity>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: activeCategory === item.value }}
            onPress={() => { setActiveCategory(item.value); setSavedOnly(false); }}
            style={{ borderWidth: 1, borderColor: !savedOnly && activeCategory === item.value ? colors.primary : colors.border, backgroundColor: !savedOnly && activeCategory === item.value ? colors.primary + "20" : colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ color: !savedOnly && activeCategory === item.value ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{item.emoji} {item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        {savedOnly ? "Saved Posts" : activeCategory ? activeCategory === "Amebo Hot" ? "Amebo Hot Posts" : `${activeCategory} Gist` : "Campus Gist"}
      </Text>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError && !data ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn't load posts</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key={savedOnly ? "saved" : activeCategory ?? "all"}
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <PostCard post={item} onHide={() => setHiddenRevision((revision) => revision + 1)} />}
          ListHeaderComponent={!savedOnly && activeCategory === "Shuttle Updates" ? <ShuttleStatusBanner /> : null}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          ListFooterComponent={isFetchingNextPage ? (
            <View style={{ paddingVertical: 18 }}><ActivityIndicator color={colors.primary} /></View>
          ) : isFetchNextPageError ? (
            <TouchableOpacity onPress={() => void fetchNextPage()} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: colors.destructive ?? "#EF4444", fontWeight: "600" }}>Couldn't load more. Tap to retry.</Text>
            </TouchableOpacity>
          ) : hasNextPage ? (
            <TouchableOpacity onPress={() => void fetchNextPage()} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Load more posts</Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="radio" size={40} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{savedOnly ? "No saved posts yet" : activeCategory ? "No posts in this category yet. Be the first to share an update!" : "No gist yet"}</Text>
                {!activeCategory && !savedOnly && <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Be the first to drop something on the feed</Text>}
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 88 + bottomPad }]}
        onPress={() => { setComposeOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <ComposeModal
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPosted={(postedCategory) => {
          setSavedOnly(false);
          setActiveCategory(postedCategory);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  notificationBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", position: "relative" },
  notificationBadge: {
    position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#ef4444",
  },
  notificationBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  composeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  listContent: { paddingTop: 12, paddingHorizontal: 16, gap: 12 },
  shuttleCard: { borderRadius: 16, borderWidth: 1, padding: 15, marginBottom: 4 },
  shuttleHeadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  shuttleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  shuttleTitle: { fontSize: 15, fontWeight: "700" },
  shuttleCaption: { fontSize: 11, marginTop: 3 },
  shuttleEmpty: { fontSize: 12, marginTop: 14 },
  shuttleLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 20 },
  shuttleCurrent: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, marginTop: 14 },
  shuttleLiveDot: { width: 8, height: 8, borderRadius: 4 },
  shuttleCurrentText: { fontSize: 12, fontWeight: "700" },
  shuttleUpdated: { fontSize: 11, marginTop: 8 },
  shuttleVoteList: { gap: 7, marginTop: 13 },
  shuttleVoteButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shuttleVoteText: { fontSize: 12, fontWeight: "600" },
  shuttleFeedback: { fontSize: 11, marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  optionsButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginTop: -6, marginRight: -6 },
  detailLink: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  menuSheet: { borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  menuItem: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 18 },
  menuText: { fontSize: 15, fontWeight: "500", flex: 1 },
  menuDivider: { height: 1, marginVertical: 4, marginHorizontal: 16 },
  reportTitle: { fontSize: 17, fontWeight: "700", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  reportCancel: { minHeight: 46, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: "rgba(128,128,128,0.2)", marginTop: 4 },
  editModal: { flex: 1 },
  editInput: { fontSize: 16, lineHeight: 24, minHeight: 140, padding: 18, textAlignVertical: "top" },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  avatarText: { fontSize: 18, fontWeight: "700" },
  authorInfo: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 15, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  timeText: { fontSize: 11 },
  timeTextSmall: { fontSize: 11 },
  content: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  postImage: { width: "100%", height: 220, borderRadius: 12, marginTop: 12 },
  reshareCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 12 },
  reshareHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  reshareAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  reshareAvatarText: { fontSize: 14, fontWeight: "700" },
  reshareAuthorInfo: { flex: 1, minWidth: 0 },
  reshareMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  reshareAuthorName: { fontSize: 13, fontWeight: "700" },
  reshareLabel: { fontSize: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  reshareContent: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  reshareImage: { width: "100%", height: 180, borderRadius: 10, marginTop: 10 },
  reactions: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  reactionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: 13, fontWeight: "600" },
  reactionSpacer: { flex: 1 },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#FF3399", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "700" },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalHeaderBtn: { padding: 4 },
  modalHeaderBtnText: { fontSize: 15 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  postButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  postButtonText: { fontSize: 15, fontWeight: "700" },
  modalBody: { flex: 1, padding: 16 },
  composeRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 16 },
  facultyPicker: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start" },
  facultyPickerText: { fontSize: 12, fontWeight: "600" },
  contentInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
  charCount: { fontSize: 12, textAlign: "right", marginTop: 8 },
  pollContainer: { marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  pollHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pollLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  pollLabelText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  pollEndedBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  pollEndedText: { fontSize: 10, fontWeight: "700" },
  pollQuestion: { fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: 10 },
  pollExpiry: { fontSize: 11, marginTop: 4 },
  pollOptions: { gap: 8, marginTop: 13 },
  pollOption: { minHeight: 44, justifyContent: "center", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  pollOptionContent: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 11, paddingVertical: 10 },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pollRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pollRadioSelected: { width: 9, height: 9, borderRadius: 5 },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: "500" },
  pollPercentage: { fontSize: 12, fontWeight: "700" },
  voteButton: { minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 12 },
  voteButtonText: { fontSize: 13, fontWeight: "700" },
  pollError: { fontSize: 11, marginTop: 8 },
  pollVoteCount: { fontSize: 11, marginTop: 10 },
  createPollToggle: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  pollForm: { gap: 9, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  pollQuestionInput: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, fontSize: 14 },
  pollInputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pollOptionInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, fontSize: 13 },
  removePollOption: { width: 36, height: 38, alignItems: "center", justifyContent: "center" },
  addPollOption: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
});

export const POST_CATEGORIES = [
  { id: "all", label: "All Gist", category: undefined, emoji: "✨", color: "from-violet-500/20 to-violet-500/5 border-violet-500/30 hover:border-violet-500/60", pill: "" },
  { id: "shuttle", label: "Shuttle Updates", category: "Shuttle Updates", emoji: "🚌", color: "from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60", pill: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  { id: "portal", label: "Portal Down", category: "Portal Down", emoji: "💻", color: "from-red-500/20 to-red-500/5 border-red-500/30 hover:border-red-500/60", pill: "border-red-500/30 bg-red-500/10 text-red-300" },
  { id: "exam", label: "Exam Timetable", category: "Exam Timetable", emoji: "📅", color: "from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500/60", pill: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  { id: "amebo", label: "Amebo Hot", category: "Amebo Hot", emoji: "🌶️", color: "from-pink-500/20 to-pink-500/5 border-pink-500/30 hover:border-pink-500/60", pill: "border-pink-500/30 bg-pink-500/10 text-pink-300" },
] as const;

export type PostCategory = NonNullable<(typeof POST_CATEGORIES)[number]["category"]>;

export function getPostCategoryMeta(category: string) {
  return POST_CATEGORIES.find((item) => item.category === category);
}
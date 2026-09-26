import { and, desc, eq, sql } from "drizzle-orm";
import { db, conversationsTable, messagesTable, wazobiaPreferencesTable } from "@workspace/db";

export const WAZOBIA_BOT_ID = "system:wazobia";
export const WAZOBIA_BOT_NAME = "WAZOBIA AI";
export const WAZOBIA_WELCOME_MARKER = "[[WAZOBIA_WELCOME_V1]]";
export const WAZOBIA_LANGUAGES = ["english", "pidgin", "yoruba", "hausa", "igbo"] as const;
export type WazobiaLanguage = (typeof WAZOBIA_LANGUAGES)[number];

const WELCOME_COPY: Record<WazobiaLanguage, string> = {
  english:
    "Hi! I’m WAZOBIA, your CampusX campus assistant. I can help you find your way around Shuttle Radar, catch campus gist on Amebo Hot Feed, spot savings in Flash Deals, plan your CGPA with the CGPA Calculator, and understand Account Verification. Ask me anything about campus life or CampusX!",
  pidgin:
    "Hi! I be WAZOBIA, your CampusX campus assistant. I fit help you check Shuttle Radar, catch campus gist for Amebo Hot Feed, find better offers for Flash Deals, plan your CGPA with CGPA Calculator, and understand Account Verification. Ask me anything about campus life or CampusX!",
  yoruba:
    "Pẹ̀lẹ́ o! Èmi ni WAZOBIA, olùrànlọ́wọ́ rẹ ní CampusX. Mo lè ràn ọ́ lọ́wọ́ láti lo Shuttle Radar, ka ìròyìn ilé-ẹ̀kọ́ lórí Amebo Hot Feed, rí àǹfààní lórí Flash Deals, ṣètò CGPA rẹ pẹ̀lú CGPA Calculator, àti lóye Account Verification. Béèrè ohunkóhun nípa ìgbésí ayé ilé-ẹ̀kọ́ tàbí CampusX!",
  hausa:
    "Sannu! Ni ne WAZOBIA, mataimakinka na CampusX. Zan iya taimaka maka da Shuttle Radar, labaran jami'a a Amebo Hot Feed, rangwame a Flash Deals, tsara CGPA ta CGPA Calculator, da fahimtar Account Verification. Ka tambaye ni duk abin da ya shafi rayuwar jami'a ko CampusX!",
  igbo:
    "Ndewo! Abụ m WAZOBIA, onye enyemaka gị na CampusX. Enwere m ike inyere gị aka na Shuttle Radar, akụkọ ụlọ akwụkwọ na Amebo Hot Feed, ọnụ ahịa ọma na Flash Deals, ịhazi CGPA gị site na CGPA Calculator, na ịghọta Account Verification. Jụọ m ihe ọ bụla gbasara ndụ ụlọ akwụkwọ ma ọ bụ CampusX!",
};

export function localizeWelcome(language: WazobiaLanguage): string {
  return WELCOME_COPY[language];
}

export async function getWazobiaLanguage(userId: string): Promise<WazobiaLanguage> {
  const [preference] = await db
    .select({ language: wazobiaPreferencesTable.language })
    .from(wazobiaPreferencesTable)
    .where(eq(wazobiaPreferencesTable.clerkUserId, userId))
    .limit(1);
  return WAZOBIA_LANGUAGES.includes(preference?.language as WazobiaLanguage)
    ? (preference!.language as WazobiaLanguage)
    : "english";
}

/**
 * One advisory lock per Clerk account makes conversation + welcome creation
 * idempotent across onboarding and simultaneous GET/start requests.
 */
export async function ensureWazobiaConversation(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(
      // Two-key form keeps this lock namespace separate from other advisory locks.
      sql`select pg_advisory_xact_lock(741, hashtext(${userId}))`,
    );

    const [existing] = await tx
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, WAZOBIA_BOT_ID),
        ),
      )
      .limit(1);

    if (existing) {
      const [welcome] = await tx
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, existing.id),
            eq(messagesTable.senderId, WAZOBIA_BOT_ID),
            eq(messagesTable.content, WAZOBIA_WELCOME_MARKER),
          ),
        )
        .limit(1);
      if (!welcome) {
        await tx.insert(messagesTable).values({
          conversationId: existing.id,
          senderId: WAZOBIA_BOT_ID,
          content: WAZOBIA_WELCOME_MARKER,
          isRead: false,
        });
      }
      return existing.id;
    }

    const [conversation] = await tx
      .insert(conversationsTable)
      .values({ participant1Id: userId, participant2Id: WAZOBIA_BOT_ID })
      .returning();
    await tx.insert(messagesTable).values({
      conversationId: conversation.id,
      senderId: WAZOBIA_BOT_ID,
      content: WAZOBIA_WELCOME_MARKER,
      isRead: false,
    });
    return conversation.id;
  });
}

export async function getRecentWazobiaHistory(conversationId: number) {
  return db
    .select({
      senderId: messagesTable.senderId,
      content: messagesTable.content,
    })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(24);
}

export function isWazobiaConversation(
  participant1Id: string,
  participant2Id: string,
): boolean {
  return participant1Id === WAZOBIA_BOT_ID || participant2Id === WAZOBIA_BOT_ID;
}

export function renderWazobiaMessage(content: string, language: WazobiaLanguage): string {
  return content === WAZOBIA_WELCOME_MARKER ? localizeWelcome(language) : content;
}

import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, postsTable, usersTable, servicesTable } from "@workspace/db";
import {
  GetFeedStatsResponse,
  GetMarketplaceStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/feed", async (_req, res): Promise<void> => {
  const [{ totalPosts }] = await db
    .select({ totalPosts: sql<number>`count(*)::int` })
    .from(postsTable);

  const postsByFaculty = await db
    .select({
      faculty: usersTable.faculty,
      count: sql<number>`count(${postsTable.id})::int`,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .groupBy(usersTable.faculty);

  const [{ recentActivity }] = await db
    .select({ recentActivity: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(sql`${postsTable.createdAt} > now() - interval '24 hours'`);

  res.json(GetFeedStatsResponse.parse({
    totalPosts,
    postsByFaculty: postsByFaculty.map((r) => ({ faculty: r.faculty ?? "Unknown", count: r.count })),
    recentActivity,
  }));
});

router.get("/stats/marketplace", async (_req, res): Promise<void> => {
  const [{ totalServices }] = await db
    .select({ totalServices: sql<number>`count(*)::int` })
    .from(servicesTable)
    .where(eq(servicesTable.isActive, true));

  const servicesByCategory = await db
    .select({
      category: servicesTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(servicesTable)
    .where(eq(servicesTable.isActive, true))
    .groupBy(servicesTable.category);

  res.json(GetMarketplaceStatsResponse.parse({
    totalServices,
    servicesByCategory,
  }));
});

export default router;

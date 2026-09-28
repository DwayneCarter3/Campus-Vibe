import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";

const { db, postsTable, usersTable, servicesTable } = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const GetFeedStatsResponse = getSchema("GetFeedStatsResponse");
const GetMarketplaceStatsResponse = getSchema("GetMarketplaceStatsResponse");

const router = Router() as any;

router.get("/stats/feed", async (req: any, res: any): Promise<void> => {
  try {
    const [{ count: totalPosts }] = await db
      .select({ count: sql`count(*)::int` })
      .from(postsTable);

    const [{ count: totalUsers }] = await db
      .select({ count: sql`count(*)::int` })
      .from(usersTable);

    const stats = {
      totalPosts: totalPosts ?? 0,
      totalUsers: totalUsers ?? 0,
    };

    res.json(GetFeedStatsResponse.parse(stats));
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message || "Failed to fetch feed stats" });
  }
});

router.get("/stats/marketplace", async (req: any, res: any): Promise<void> => {
  try {
    const [{ count: totalServices }] = await db
      .select({ count: sql`count(*)::int` })
      .from(servicesTable);

    const stats = {
      totalServices: totalServices ?? 0,
    };

    res.json(GetMarketplaceStatsResponse.parse(stats));
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message || "Failed to fetch marketplace stats" });
  }
});

export default router;

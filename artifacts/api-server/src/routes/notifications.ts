getAuth} frm "@lerk/express";
mprt * a dModu*asapiZodModuleworkspaai-zod.js
cns
  db,
 notifictionsTable,
  usersTable,
} = bMoue as any;

const apZod = apiZodModul as ay;
consgetScha = (name: string) =>
  apiZd[nam] || {
    pars: (data: ay) => daa,
  saePase: (data: any) => ({ success: true, data }),
  };

cnstLitNotificationQuryParams = getSche("ListNotificatiosQuyParams)ListNificationsRsponse =getSchema("ListNotificationsesponse");

const r as any: any: anytry {
    clerkUgetAuth;
   if (!clerkUserId) {
      res.sttu(401).json({error: "Unauthorized" });
      return;
    }

    con quey = ListNotifcatiosQueryParams.safeParse(req.query)  querysuccess&& query.da?lit ?data.:5  notificatin      clerkU    Result  c    
        
          clerkU
         
         as any
        csturedCut =Result[0]?.count?? 0    es.seHead("Ce-Ctol"pvatno-to");
   .jn(LitNotifictioRpone.pase({ ,   unrCount,
    );
  } catc (ror: y) {
    rs.su(500)jon({ ror:ror?.message || "Faile toftch "}}-all: any: any{  clekU=gAuh()useclkU  1Uuhrized          userkU;
s.jsosuccessru}cch (rror: any50error?.message || Failed to mark nsasreapach:id/duirAhasync (qany, r: ayPromise<>ry{
clerkUgetA(req)  clerkU        con rwI = Array.isArayrq.as.id?q.paramid[0] : rq.pms.id;
    stifitionId = Numbr(wId
    await db
    upatotifiasTb    ({ isR: t}    we        and(        qnotifiatisTabl.i, otificatioId,        eq(notifictionsTab.clekUsrId   asany );
json{succss: tu }(error:any){
s.sus(jsro: ror?.mssge||"Failedtomak ntificato a ra"}import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const { db, notificationsTable, usersTable } = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const ListNotificationsQueryParams = getSchema("ListNotificationsQueryParams");
const ListNotificationsResponse = getSchema("ListNotificationsResponse");

const router = Router() as any;

router.get(
  "/notifications",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const query = ListNotificationsQueryParams.safeParse(req.query);
      const limit =
        query.success && query.data?.limit ? Number(query.data.limit) : 50;

      const notifications = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, clerkUserId))
        .orderBy(desc(notificationsTable.createdAt))
        .limit(limit);

      const unreadCountResult = await db
        .select({ count: sql`count(*)::int` })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.userId, clerkUserId),
            eq(notificationsTable.isRead, false),
          ) as any,
        );

      const unreadCount = unreadCountResult[0]?.count ?? 0;

      res.setHeader("Cache-Control", "private, no-store");
      res.json(
        ListNotificationsResponse.parse({
          notifications,
          unreadCount,
        }),
      );
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message || "Failed to fetch notifications" });
    }
  },
);

router.patch(
  "/notifications/read-all",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(eq(notificationsTable.userId, clerkUserId));

      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({
          error: error?.message || "Failed to mark notifications as read",
        });
    }
  },
);

router.patch(
  "/notifications/:id/read",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rawId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const notificationId = Number(rawId);

      await db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(
          and(
            eq(notificationsTable.id, notificationId),
            eq(notificationsTable.userId, clerkUserId),
          ) as any,
        );

      res.json({ success: true });
    } catch (error: any) {
      res
        .status(500)
        .json({
          error: error?.message || "Failed to mark notification as read",
        });
    }
  },
);

export default router;

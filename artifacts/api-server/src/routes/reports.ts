import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, postsTable, reportsTable, servicesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { hasAdminPrivileges } from "../lib/privilege";
import {
  ListAdminReportsResponse,
  ReviewAdminReportParams,
  ReviewAdminReportBody,
  ReviewAdminReportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function reportTargetTitle(postContent: string | null, serviceTitle: string | null): string {
  if (serviceTitle != null) return serviceTitle;
  return (postContent ?? "").slice(0, 160);
}

router.get("/admin/reports", requireAuth, async (req, res): Promise<void> => {
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only" });
    return;
  }

  const rows = await db
    .select({
      id: reportsTable.id,
      postId: reportsTable.postId,
      serviceId: reportsTable.serviceId,
      reason: reportsTable.reason,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
      postContent: postsTable.content,
      serviceTitle: servicesTable.title,
    })
    .from(reportsTable)
    .leftJoin(postsTable, eq(reportsTable.postId, postsTable.id))
    .leftJoin(servicesTable, eq(reportsTable.serviceId, servicesTable.id))
    .where(eq(reportsTable.status, "pending"))
    .orderBy(desc(reportsTable.createdAt));

  const reports = rows.map(({ postContent, serviceTitle, ...report }) => ({
    ...report,
    targetTitle: reportTargetTitle(postContent, serviceTitle),
  }));
  res.json(ListAdminReportsResponse.parse({ reports, total: reports.length }));
});

router.patch("/admin/reports/:reportId", requireAuth, async (req, res): Promise<void> => {
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only" });
    return;
  }

  const params = ReviewAdminReportParams.safeParse({ reportId: req.params.reportId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ReviewAdminReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [report] = await db
    .update(reportsTable)
    .set({ status: body.data.status })
    .where(eq(reportsTable.id, params.data.reportId))
    .returning({
      id: reportsTable.id,
      postId: reportsTable.postId,
      serviceId: reportsTable.serviceId,
      reason: reportsTable.reason,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
    });
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [target] = await db
    .select({ postContent: postsTable.content, serviceTitle: servicesTable.title })
    .from(reportsTable)
    .leftJoin(postsTable, eq(reportsTable.postId, postsTable.id))
    .leftJoin(servicesTable, eq(reportsTable.serviceId, servicesTable.id))
    .where(and(eq(reportsTable.id, report.id), eq(reportsTable.status, body.data.status)));

  res.json(ReviewAdminReportResponse.parse({
    ...report,
    targetTitle: reportTargetTitle(target?.postContent ?? null, target?.serviceTitle ?? null),
  }));
});

export default router;
import { and, desc, eq, gt } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { adCampaignsTable, db, paymentTransactionsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { hasAdminPrivileges } from "../lib/privilege";

const router: IRouter = Router();
const adPackages = ["event_performance_ad_30_day", "corporate_ad_30_day"] as const;

const createCampaignSchema = z.object({
  paymentReference: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(2000),
  destinationUrl: z.string().trim().min(1).max(2048).url(),
}).strict();

const campaignDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
}).strict();

function clerkId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

function isSafeDestination(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || !hostname.includes(".")
      || hostname.endsWith(".")
      || hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".test")
      || hostname.startsWith("[")
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only." });
    return false;
  }
  return true;
}

router.get("/ads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [viewer] = await db
    .select({ school: usersTable.school, campusLocation: usersTable.campusLocation })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkId(req)))
    .limit(1);
  if (!viewer) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  const ads = await db
    .select({
      id: adCampaignsTable.id,
      title: adCampaignsTable.title,
      body: adCampaignsTable.body,
      destinationUrl: adCampaignsTable.destinationUrl,
      packageType: adCampaignsTable.packageType,
      expiresAt: adCampaignsTable.expiresAt,
    })
    .from(adCampaignsTable)
    .where(and(
      eq(adCampaignsTable.status, "approved"),
      eq(adCampaignsTable.school, viewer.school),
      eq(adCampaignsTable.campusLocation, viewer.campusLocation),
      gt(adCampaignsTable.expiresAt, new Date()),
    ))
    .orderBy(desc(adCampaignsTable.createdAt))
    .limit(10);
  res.json({ ads });
});

router.get("/ads/mine", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const campaigns = await db
    .select({
      id: adCampaignsTable.id,
      paymentReference: adCampaignsTable.paymentReference,
      title: adCampaignsTable.title,
      status: adCampaignsTable.status,
      expiresAt: adCampaignsTable.expiresAt,
      rejectionReason: adCampaignsTable.rejectionReason,
      createdAt: adCampaignsTable.createdAt,
    })
    .from(adCampaignsTable)
    .where(eq(adCampaignsTable.ownerClerkUserId, clerkId(req)))
    .orderBy(desc(adCampaignsTable.createdAt))
    .limit(50);
  res.json({ campaigns });
});

router.post("/ads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a title (up to 100 characters), body (up to 2,000 characters), paid purchase reference, and HTTPS destination URL (up to 2,048 characters)." });
    return;
  }
  if (!isSafeDestination(parsed.data.destinationUrl)) {
    res.status(400).json({ error: "Destination must be a public HTTPS website URL." });
    return;
  }

  const ownerClerkUserId = clerkId(req);
  const [user] = await db
    .select({ school: usersTable.school, campusLocation: usersTable.campusLocation })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, ownerClerkUserId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  const [payment] = await db
    .select({
      reference: paymentTransactionsTable.reference,
      packageType: paymentTransactionsTable.packageType,
      durationDays: paymentTransactionsTable.durationDays,
    })
    .from(paymentTransactionsTable)
    .where(and(
      eq(paymentTransactionsTable.reference, parsed.data.paymentReference),
      eq(paymentTransactionsTable.clerkUserId, ownerClerkUserId),
      eq(paymentTransactionsTable.status, "paid"),
    ))
    .limit(1);
  if (!payment || !adPackages.includes(payment.packageType as (typeof adPackages)[number])) {
    res.status(403).json({ error: "A paid Event / Performance Ad or Corporate Ad purchase owned by you is required." });
    return;
  }

  const [campaign] = await db
    .insert(adCampaignsTable)
    .values({
      ownerClerkUserId,
      paymentReference: payment.reference,
      packageType: payment.packageType,
      title: parsed.data.title,
      body: parsed.data.body,
      destinationUrl: new URL(parsed.data.destinationUrl).href,
      school: user.school,
      campusLocation: user.campusLocation,
      status: "pending",
      // Pending moderation does not consume display time. This provisional date is
      // reset to the approval timestamp plus the transaction duration when approved.
      expiresAt: new Date(Date.now() + payment.durationDays * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing({ target: adCampaignsTable.paymentReference })
    .returning({
      id: adCampaignsTable.id,
      status: adCampaignsTable.status,
      expiresAt: adCampaignsTable.expiresAt,
    });
  if (!campaign) {
    res.status(409).json({ error: "This purchase has already been used for an ad campaign." });
    return;
  }
  res.status(201).json(campaign);
});

router.get("/admin/ads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const campaigns = await db
    .select({
      id: adCampaignsTable.id,
      ownerClerkUserId: adCampaignsTable.ownerClerkUserId,
      paymentReference: adCampaignsTable.paymentReference,
      packageType: adCampaignsTable.packageType,
      title: adCampaignsTable.title,
      body: adCampaignsTable.body,
      destinationUrl: adCampaignsTable.destinationUrl,
      school: adCampaignsTable.school,
      campusLocation: adCampaignsTable.campusLocation,
      status: adCampaignsTable.status,
      expiresAt: adCampaignsTable.expiresAt,
      createdAt: adCampaignsTable.createdAt,
    })
    .from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "pending"))
    .orderBy(adCampaignsTable.createdAt)
    .limit(100);
  res.json({ campaigns });
});

router.patch("/admin/ads/:campaignId/decision", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const campaignId = Number(req.params.campaignId);
  if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
    res.status(400).json({ error: "Invalid campaign id." });
    return;
  }
  const parsed = campaignDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose approved or rejected and provide an optional rejection reason up to 500 characters." });
    return;
  }
  const campaign = await db.transaction(async (tx) => {
    const [pendingCampaign] = await tx
      .select({
        id: adCampaignsTable.id,
        ownerClerkUserId: adCampaignsTable.ownerClerkUserId,
        paymentReference: adCampaignsTable.paymentReference,
        packageType: adCampaignsTable.packageType,
      })
      .from(adCampaignsTable)
      .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.status, "pending")))
      .for("update")
      .limit(1);
    if (!pendingCampaign) return null;

    const [payment] = await tx
      .select({
        clerkUserId: paymentTransactionsTable.clerkUserId,
        packageType: paymentTransactionsTable.packageType,
        durationDays: paymentTransactionsTable.durationDays,
      })
      .from(paymentTransactionsTable)
      .where(and(
        eq(paymentTransactionsTable.reference, pendingCampaign.paymentReference),
        eq(paymentTransactionsTable.status, "paid"),
      ))
      .limit(1);
    if (
      !payment
      || payment.clerkUserId !== pendingCampaign.ownerClerkUserId
      || payment.packageType !== pendingCampaign.packageType
      || !adPackages.includes(payment.packageType as (typeof adPackages)[number])
    ) return null;

    const decidedAt = new Date();
    const expiresAt = new Date(decidedAt.getTime() + payment.durationDays * 24 * 60 * 60 * 1000);
    const [decidedCampaign] = await tx
      .update(adCampaignsTable)
      .set({
        status: parsed.data.decision,
        decidedByClerkUserId: clerkId(req),
        decidedAt,
        ...(parsed.data.decision === "approved" ? { expiresAt } : {}),
        rejectionReason: parsed.data.decision === "rejected" ? parsed.data.rejectionReason ?? null : null,
      })
      .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.status, "pending")))
      .returning({
        id: adCampaignsTable.id,
        status: adCampaignsTable.status,
        decidedAt: adCampaignsTable.decidedAt,
      });
    return decidedCampaign ?? null;
  });
  if (!campaign) {
    res.status(404).json({ error: "Pending ad campaign not found." });
    return;
  }
  res.json(campaign);
});

export default router;
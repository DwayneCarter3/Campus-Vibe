import { Router, type IRouter } from "express";
import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";
import {
  db,
  earlyBirdClaimsTable,
  paymentTransactionsTable,
  usersTable,
  postsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { isPrivilegedRole, PENDING_VERIFICATION_STATUSES } from "../lib/verification";
import { getEffectiveLevel } from "../lib/academic-level";
import { createNotification } from "../lib/notifications";
import { CEO_EMAIL, hasAdminPrivileges, isVerifiedCEO } from "../lib/privilege";

const router: IRouter = Router();

const EARLY_BIRD_LIMIT = 100;

function paymentEntitlementIsActive(
  payment: {
    paidAt: Date | null;
    createdAt: Date;
    durationDays: number;
    entitlementExpiresAt: Date | null;
  },
  now: Date,
): boolean {
  const expiresAt =
    payment.entitlementExpiresAt ??
    new Date((payment.paidAt ?? payment.createdAt).getTime() + payment.durationDays * 86_400_000);
  return expiresAt > now;
}

function computeCampusTitle(role: string, postCount: number): string {
  if (role === "ceo") return "CEO";
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  if (postCount >= 100) return "Campus Daddy";
  if (postCount >= 61) return "Godfather";
  if (postCount >= 31) return "Big Daddy";
  if (postCount >= 11) return "Campus Rep";
  if (postCount >= 1) return "Rising Star";
  return "";
}

async function requireCEO(req: any, res: any): Promise<boolean> {
  if (!(await isVerifiedCEO(req))) {
    res.status(403).json({ error: "CEO only." });
    return false;
  }
  return true;
}

async function requireAdminOrCEO(req: any, res: any): Promise<boolean> {
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only." });
    return false;
  }
  return true;
}

router.post("/admin/claim", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  if (!(await isVerifiedCEO(req))) {
    res.status(403).json({ error: "Only the freshly verified designated CEO may claim the CEO role." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: true, role: "ceo", verificationStatus: "Premium_Approved" })
    .where(eq(usersTable.clerkUserId, userId))
    .returning({ id: usersTable.id });
  if (!updated) {
    res.status(404).json({ error: "User profile not found." });
    return;
  }

  res.json({ success: true, message: "You are now the CampusX admin!" });
});

router.get("/admin/users", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  // Repair older records as soon as an admin opens the user-management view.
  await db
    .update(usersTable)
    .set({ verificationStatus: "Premium_Approved" })
    .where(inArray(usersTable.role, ["admin", "ceo"]));

  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const whereClause = search
    ? or(
        ilike(usersTable.fullName, `%${search}%`),
        ilike(usersTable.matricNumber, `%${search}%`),
        ilike(usersTable.email, `%${search}%`)
      )
    : undefined;

  const users = whereClause
    ? await db.select().from(usersTable).where(whereClause).limit(limit).offset(offset)
    : await db.select().from(usersTable).limit(limit).offset(offset);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(usersTable);

  const enriched = await Promise.all(
    users.map(async (u) => {
      const [{ postCount }] = await db
        .select({ postCount: sql<number>`count(*)::int` })
        .from(postsTable)
        .where(eq(postsTable.authorId, u.clerkUserId));
      return {
        clerkUserId: u.clerkUserId,
        fullName: u.fullName,
        email: u.email,
        faculty: u.faculty,
        level: getEffectiveLevel(u.level, u.matricNumber),
        role: u.role,
        verificationStatus: u.verificationStatus,
        matricNumber: u.matricNumber,
        avatarUrl: u.avatarUrl,
        campusTitle: computeCampusTitle(u.role, postCount ?? 0),
        postCount: postCount ?? 0,
      };
    })
  );

  res.json({ users: enriched, total });
});

router.patch("/admin/users/:userId/role", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireCEO(req as any, res);
  if (!ok) return;

  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { role } = req.body;
  const validRoles = ["student", "moderator", "admin", "ceo"];

  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role. Must be one of: student, moderator, admin, ceo" });
    return;
  }

  const [caller] = await db
    .select({ clerkUserId: usersTable.clerkUserId })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, (req as any).userId));

  if (caller?.clerkUserId === targetUserId) {
    res.status(400).json({ error: "Cannot change your own role." });
    return;
  }

  const isAdmin = role === "admin" || role === "ceo";
  await db
    .update(usersTable)
    .set({
      role,
      isAdmin,
      ...(isAdmin ? { verificationStatus: "Premium_Approved" } : {}),
    })
    .where(eq(usersTable.clerkUserId, targetUserId));

  await createNotification({
    userId: targetUserId,
    actorId: (req as any).userId as string,
    actorName: "CampusX Admin",
    type: "account_update",
    content: `Your CampusX role was updated to ${role}.`,
    targetType: "user",
    targetId: targetUserId,
  }).catch((error) => {
    req.log.error({ err: error, targetUserId }, "Failed to create role-update notification");
  });

  res.json({ success: true, role });
});

router.get("/admin/pending-verifications", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  // Keep legacy privileged accounts out of the queue and persist their premium status.
  await db.update(usersTable).set({ verificationStatus: "Premium_Approved" })
    .where(and(
      inArray(usersTable.role, ["admin", "ceo"]),
      inArray(usersTable.verificationStatus, PENDING_VERIFICATION_STATUSES),
    ));
  const users = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.verificationStatus, PENDING_VERIFICATION_STATUSES));

  const mapped = users.map((u) => ({
    clerkUserId: u.clerkUserId,
    fullName: u.fullName,
    matricNumber: u.matricNumber,
    faculty: u.faculty,
    level: getEffectiveLevel(u.level, u.matricNumber),
    avatarUrl: u.avatarUrl,
    verificationStatus: u.verificationStatus,
    badgeType:
      u.verificationStatus === "Premium_Pending_Approval"
        ? "Premium Blue Tick (Paystack)"
        : u.verificationStatus === "pending_paid"
          ? "Paid User (Paystack)"
          : u.verificationStatus === "pending_promo"
            ? "Promo User (Free)"
            : "Student Verification",
  }));

  res.json({ users: mapped });
});

router.post("/admin/users/:userId/approve-badge", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const approval = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        role: usersTable.role,
        registrationRank: usersTable.registrationRank,
        verificationStatus: usersTable.verificationStatus,
        promoExpiresAt: usersTable.promoExpiresAt,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, targetUserId))
      .for("update")
      .limit(1);

    if (!target) return { ok: false as const, status: 404, error: "User not found" };

    const status = target.verificationStatus;
    const now = new Date();
    const pendingStatuses = [
      "pending_paid",
      "Premium_Pending_Approval",
      "Student_Pending",
      "pending_promo",
    ];
    if (!pendingStatuses.includes(status)) {
      return {
        ok: false as const,
        status: 409,
        error: "This user does not have a pending badge request.",
      };
    }

    let eligible = false;
    if (status === "pending_paid" || status === "Premium_Pending_Approval") {
      const packageType =
        status === "pending_paid" ? "student_verification" : "premium_blue_tick";
      const payments = await tx
        .select({
          paidAt: paymentTransactionsTable.paidAt,
          createdAt: paymentTransactionsTable.createdAt,
          durationDays: paymentTransactionsTable.durationDays,
          entitlementExpiresAt: paymentTransactionsTable.entitlementExpiresAt,
        })
        .from(paymentTransactionsTable)
        .where(
          and(
            eq(paymentTransactionsTable.clerkUserId, targetUserId),
            eq(paymentTransactionsTable.packageType, packageType),
            eq(paymentTransactionsTable.status, "paid"),
          ),
        );
      eligible = payments.some((payment) => paymentEntitlementIsActive(payment, now));

      if (status === "Premium_Pending_Approval" && !eligible) {
        const [claim] = await tx
          .select({
            claimRank: earlyBirdClaimsTable.claimRank,
            badgeClaimedAt: earlyBirdClaimsTable.badgeClaimedAt,
          })
          .from(earlyBirdClaimsTable)
          .where(eq(earlyBirdClaimsTable.clerkUserId, targetUserId))
          .limit(1);
        eligible =
          !!claim?.badgeClaimedAt &&
          claim.claimRank <= EARLY_BIRD_LIMIT &&
          target.registrationRank <= EARLY_BIRD_LIMIT &&
          !!target.promoExpiresAt &&
          target.promoExpiresAt >= now;
      }
    } else {
      const [claim] = await tx
        .select({
          claimRank: earlyBirdClaimsTable.claimRank,
          badgeClaimedAt: earlyBirdClaimsTable.badgeClaimedAt,
        })
        .from(earlyBirdClaimsTable)
        .where(eq(earlyBirdClaimsTable.clerkUserId, targetUserId))
        .limit(1);
      eligible =
        !!claim?.badgeClaimedAt &&
        claim.claimRank <= EARLY_BIRD_LIMIT &&
        target.registrationRank <= EARLY_BIRD_LIMIT &&
        !!target.promoExpiresAt &&
        target.promoExpiresAt >= now;
    }

    if (!eligible) {
      return {
        ok: false as const,
        status: 409,
        error: "The pending badge request is expired or has no eligible payment/early-bird claim.",
      };
    }

    const verificationStatus = isPrivilegedRole(target.role)
      ? "Premium_Approved"
      : status === "Premium_Pending_Approval"
        ? "Premium_Approved"
        : "Student_Verified";
    await tx
      .update(usersTable)
      .set({
        verificationStatus,
        premiumBadgeDiscountPercent: 0,
      })
      .where(eq(usersTable.clerkUserId, targetUserId));

    return { ok: true as const, verificationStatus };
  });

  if (!approval.ok) {
    if (approval.status === 404) {
      res.status(404).json({ error: approval.error });
      return;
    }
    res.status(409).json({ error: approval.error });
    return;
  }

  await createNotification({
    userId: targetUserId,
    actorId: (req as any).userId as string,
    actorName: "CampusX Admin",
    type: "admin_approval",
    content: "Your verification badge has been approved.",
    targetType: "user",
    targetId: targetUserId,
  }).catch((error) => {
    req.log.error({ err: error, targetUserId }, "Failed to create badge-approval notification");
  });

  res.json({ success: true });
});

router.post("/admin/users/:userId/reject-badge", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, targetUserId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db
    .update(usersTable)
    .set({
      verificationStatus: isPrivilegedRole(target.role)
        ? "Premium_Approved"
        : "none",
      promoExpiresAt: null,
      premiumBadgeDiscountPercent: 0,
    })
    .where(eq(usersTable.clerkUserId, targetUserId));

  await createNotification({
    userId: targetUserId,
    actorId: (req as any).userId as string,
    actorName: "CampusX Admin",
    type: "verification_rejected",
    content: "Your verification badge request was rejected.",
    targetType: "user",
    targetId: targetUserId,
  }).catch((error) => {
    req.log.error({ err: error, targetUserId }, "Failed to create badge-rejection notification");
  });

  res.json({ success: true });
});

router.patch("/admin/users/:userId/verification", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (typeof req.body?.verified !== "boolean") {
    res.status(400).json({ error: "verified must be a boolean" });
    return;
  }

  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, targetUserId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const verificationStatus = req.body.verified
    ? (isPrivilegedRole(target.role) ? "Premium_Approved" : "approved")
    : (isPrivilegedRole(target.role) ? "Premium_Approved" : "none");
  await db
    .update(usersTable)
    .set({ verificationStatus, promoExpiresAt: null, premiumBadgeDiscountPercent: 0 })
    .where(eq(usersTable.clerkUserId, targetUserId));

  await createNotification({
    userId: targetUserId,
    actorId: (req as any).userId as string,
    actorName: "CampusX Admin",
    type: "verification_updated",
    content: req.body.verified
      ? "Your verification status has been approved."
      : "Your verification status has been removed.",
    targetType: "user",
    targetId: targetUserId,
  }).catch((error) => {
    req.log.error({ err: error, targetUserId }, "Failed to create verification-update notification");
  });

  res.json({ success: true, verificationStatus });
});

router.post("/admin/auto-detect-ceo", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  if (!(await isVerifiedCEO(req))) {
    res.status(403).json({ error: "Freshly verified designated CEO email required." });
    return;
  }
  const [user] = await db.select({ role: usersTable.role })
    .from(usersTable).where(eq(usersTable.clerkUserId, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role !== "ceo") {
    await db
      .update(usersTable)
      .set({ role: "ceo", isAdmin: true, verificationStatus: "Premium_Approved" })
      .where(eq(usersTable.clerkUserId, userId));
    res.json({ upgraded: true });
    return;
  }

  res.json({ upgraded: false });
});

export { CEO_EMAIL, computeCampusTitle };
export default router;

import { Router, type IRouter } from "express";
import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";
import { db, usersTable, postsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CEO_EMAIL = "dwaynecartergabriel@gmail.com";
const PENDING_VERIFICATION_STATUSES = [
  "pending",
  "pending_promo",
  "pending_paid",
  "Student_Pending",
  "Premium_Pending_Approval",
] as const;

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
  const userId = req.userId as string;
  const [caller] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));
  if (caller?.role !== "ceo") {
    res.status(403).json({ error: "CEO only." });
    return false;
  }
  return true;
}

async function requireAdminOrCEO(req: any, res: any): Promise<boolean> {
  const userId = req.userId as string;
  const [caller] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));
  if (!caller || !["admin", "ceo"].includes(caller.role)) {
    res.status(403).json({ error: "Admin/CEO only." });
    return false;
  }
  return true;
}

router.post("/admin/claim", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .limit(1);

  if (existing) {
    res.status(403).json({ error: "An admin already exists." });
    return;
  }

  await db
    .update(usersTable)
    .set({ isAdmin: true, role: "ceo", verificationStatus: "Premium_Approved" })
    .where(eq(usersTable.clerkUserId, userId));

  res.json({ success: true, message: "You are now the CampusX admin!" });
});

router.get("/admin/users", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  // Repair older records as soon as the CEO opens the user-management view.
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
        level: u.level,
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

  res.json({ success: true, role });
});

router.get("/admin/pending-verifications", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  const users = await db
    .select()
    .from(usersTable)
    .where(
      inArray(usersTable.verificationStatus, PENDING_VERIFICATION_STATUSES)
    );

  const mapped = users.map((u) => ({
    clerkUserId: u.clerkUserId,
    fullName: u.fullName,
    matricNumber: u.matricNumber,
    faculty: u.faculty,
    level: u.level,
    avatarUrl: u.avatarUrl,
    verificationStatus: u.verificationStatus,
    badgeType:
      u.verificationStatus === "Premium_Pending_Approval"
        ? "Premium Blue Tick (Paystack)"
        : u.verificationStatus === "pending_paid"
          ? "Paid User (Paystack)"
          : "Promo User (Free)",
  }));

  res.json({ users: mapped });
});

router.post("/admin/users/:userId/approve-badge", requireAuth, async (req, res): Promise<void> => {
  const ok = await requireAdminOrCEO(req as any, res);
  if (!ok) return;

  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const [target] = await db
    .select({
      role: usersTable.role,
      verificationStatus: usersTable.verificationStatus,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, targetUserId))
    .limit(1);

  await db
    .update(usersTable)
    .set({
      verificationStatus:
        target?.role === "admin" || target?.role === "ceo"
          ? "Premium_Approved"
          : target?.verificationStatus === "Premium_Pending_Approval"
          ? "Premium_Approved"
          : "approved",
    })
    .where(eq(usersTable.clerkUserId, targetUserId));

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
      verificationStatus: target.role === "admin" || target.role === "ceo"
        ? "Premium_Approved"
        : "none",
    })
    .where(eq(usersTable.clerkUserId, targetUserId));

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
    ? (target.role === "admin" || target.role === "ceo" ? "Premium_Approved" : "approved")
    : (target.role === "admin" || target.role === "ceo" ? "Premium_Approved" : "none");
  await db
    .update(usersTable)
    .set({ verificationStatus })
    .where(eq(usersTable.clerkUserId, targetUserId));

  res.json({ success: true, verificationStatus });
});

router.post("/admin/auto-detect-ceo", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [user] = await db
    .select({ email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.email === CEO_EMAIL && user.role !== "ceo") {
    await db
      .update(usersTable)
      .set({ role: "ceo", isAdmin: true })
      .where(eq(usersTable.clerkUserId, userId));
    res.json({ upgraded: true });
    return;
  }

  res.json({ upgraded: false });
});

export { CEO_EMAIL, computeCampusTitle };
export default router;

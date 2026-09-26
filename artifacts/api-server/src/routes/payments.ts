import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  earlyBirdClaimsTable,
  paymentTransactionsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { isPrivilegedRole } from "../lib/verification";

const router: IRouter = Router();

const EARLY_BIRD_LIMIT = 100;
const PROMO_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PAYMENT_PACKAGES = {
  student_verification: { baseAmountKobo: 150_000, label: "Student Verification" },
  premium_blue_tick: { baseAmountKobo: 500_000, label: "Premium Blue Tick" },
  marketplace_promotion: { baseAmountKobo: 150_000, label: "Marketplace Promotion" },
} as const;

type PaymentPackage = keyof typeof PAYMENT_PACKAGES;

function isPaymentPackage(value: unknown): value is PaymentPackage {
  return typeof value === "string" && value in PAYMENT_PACKAGES;
}

/**
 * Paystack's customer fee pass-through is enabled in the merchant dashboard.
 * We add the current Nigeria fee estimate to the amount sent to Paystack so the
 * listed product price remains intact while the customer covers processing.
 */
function calculateCustomerAmount(baseAmountKobo: number): number {
  const percentageFee = Math.ceil(baseAmountKobo * 0.015);
  const fixedFee = baseAmountKobo < 250_000 ? 0 : 10_000;
  const paystackFee = Math.min(percentageFee + fixedFee, 200_000);
  return baseAmountKobo + paystackFee;
}

function isEarlyBirdEligible(user: typeof usersTable.$inferSelect): boolean {
  return (
    user.registrationRank <= EARLY_BIRD_LIMIT &&
    user.premiumBadgeDiscountPercent === 100 &&
    !!user.promoExpiresAt &&
    user.promoExpiresAt >= new Date()
  );
}

async function claimEarlyBirdBenefit(
  clerkUserId: string,
  benefit: "badge" | "promotion",
): Promise<{ claimRank: number; alreadyClaimed: boolean } | null> {
  return db.transaction(async (tx) => {
    // Serialize the small claim window. The counter is database-owned, so
    // concurrent requests cannot both consume the same early-bird slot.
    await tx.execute(sql`select pg_advisory_xact_lock(8675309)`);

    const [existing] = await tx
      .select()
      .from(earlyBirdClaimsTable)
      .where(eq(earlyBirdClaimsTable.clerkUserId, clerkUserId))
      .limit(1);

    if (existing) {
      const alreadyClaimed =
        benefit === "badge"
          ? !!existing.badgeClaimedAt
          : !!existing.promotionClaimedAt;
      const [updated] = await tx
        .update(earlyBirdClaimsTable)
        .set(
          benefit === "badge"
            ? { badgeClaimedAt: alreadyClaimed ? existing.badgeClaimedAt : new Date() }
            : { promotionClaimedAt: alreadyClaimed ? existing.promotionClaimedAt : new Date() },
        )
        .where(eq(earlyBirdClaimsTable.id, existing.id))
        .returning();
      return {
        claimRank: updated?.claimRank ?? existing.claimRank,
        alreadyClaimed,
      };
    }

    const [inserted] = await tx
      .insert(earlyBirdClaimsTable)
      .values({
        clerkUserId,
        badgeClaimedAt: benefit === "badge" ? new Date() : null,
        promotionClaimedAt: benefit === "promotion" ? new Date() : null,
      })
      .returning();

    if (!inserted || inserted.claimRank > EARLY_BIRD_LIMIT) {
      if (inserted) {
        await tx
          .delete(earlyBirdClaimsTable)
          .where(eq(earlyBirdClaimsTable.id, inserted.id));
      }
      return null;
    }

    return { claimRank: inserted.claimRank, alreadyClaimed: false };
  });
}

async function getUserEmail(user: typeof usersTable.$inferSelect): Promise<string> {
  if (user.email.trim()) return user.email.trim().toLowerCase();
  return `${user.clerkUserId}@campusx.invalid`;
}

async function applySuccessfulPayment(
  payment: typeof paymentTransactionsTable.$inferSelect,
  paystackStatus: string,
) {
  const paidAt = payment.paidAt ?? new Date();
  await db
    .update(paymentTransactionsTable)
    .set({
      status: "paid",
      paystackStatus,
      paidAt,
      webhookReceivedAt: new Date(),
    })
    .where(eq(paymentTransactionsTable.reference, payment.reference));

  if (payment.packageType === "student_verification") {
    await db
      .update(usersTable)
      .set({ verificationStatus: sql`case when ${usersTable.role} in ('ceo', 'admin') or ${usersTable.verificationStatus} = 'Premium_Approved' then 'Premium_Approved' else 'Student_Verified' end` })
      .where(eq(usersTable.clerkUserId, payment.clerkUserId));
  } else if (payment.packageType === "premium_blue_tick") {
    await db
      .update(usersTable)
      .set({ verificationStatus: sql`case when ${usersTable.role} in ('ceo', 'admin') or ${usersTable.verificationStatus} = 'Premium_Approved' then 'Premium_Approved' else 'Premium_Pending_Approval' end` })
      .where(eq(usersTable.clerkUserId, payment.clerkUserId));
  } else if (payment.packageType === "marketplace_promotion") {
    await db
      .update(usersTable)
      .set({
        hustlePromoExpiresAt: new Date(Date.now() + PROMO_DURATION_MS),
      })
      .where(eq(usersTable.clerkUserId, payment.clerkUserId));
  }
}

async function verifyWithPaystack(reference: string) {
  const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYSTACK_LIVE_SECRET_KEY is not configured");
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  const body = (await response.json()) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; amount?: number; currency?: string; reference?: string };
  };

  if (!response.ok || !body.status || !body.data) {
    throw new Error(body.message || "Paystack verification failed");
  }
  return body.data;
}

router.post("/payments/initialize", requireAuth, async (req, res): Promise<void> => {
  const packageType = req.body?.packageType;
  if (!isPaymentPackage(packageType)) {
    res.status(400).json({ error: "Invalid payment package." });
    return;
  }

  const userId = (req as any).userId as string;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const isEarlyBird = isEarlyBirdEligible(user);
  const benefit = packageType === "marketplace_promotion" ? "promotion" : "badge";
  if (isEarlyBird) {
    const claim = await claimEarlyBirdBenefit(userId, benefit);
    if (claim) {
      const update =
        benefit === "badge"
          ? { verificationStatus: isPrivilegedRole(user.role) ? "Premium_Approved" : "approved" }
          : { hustlePromoExpiresAt: new Date(Date.now() + PROMO_DURATION_MS) };
      await db.update(usersTable).set(update).where(eq(usersTable.clerkUserId, userId));
      res.json({
        success: true,
        requiresPayment: false,
        claimRank: claim.claimRank,
        message: claim.alreadyClaimed
          ? "Your early-bird benefit is already active."
          : "Your early-bird benefit has been activated.",
      });
      return;
    }
  }

  const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY;
  if (!secretKey || !process.env.PAYSTACK_LIVE_PUBLIC_KEY) {
    res.status(503).json({ error: "Paystack payments are not configured." });
    return;
  }

  const packageInfo = PAYMENT_PACKAGES[packageType];
  const chargedAmountKobo = calculateCustomerAmount(packageInfo.baseAmountKobo);
  const reference = `CX-${packageType}-${randomUUID()}`;
  const email = await getUserEmail(user);

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: chargedAmountKobo,
      currency: "NGN",
      reference,
      metadata: {
        userId,
        packageType,
        baseAmountKobo: packageInfo.baseAmountKobo,
        feePassThrough: true,
      },
    }),
  });
  const body = (await paystackResponse.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };
  if (!paystackResponse.ok || !body.status || !body.data?.authorization_url) {
    res.status(502).json({ error: body.message || "Could not initialize Paystack payment." });
    return;
  }

  await db.insert(paymentTransactionsTable).values({
    reference,
    clerkUserId: userId,
    packageType,
    baseAmountKobo: packageInfo.baseAmountKobo,
    chargedAmountKobo,
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code ?? null,
  });

  res.json({
    success: true,
    requiresPayment: true,
    reference,
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code ?? null,
    baseAmountKobo: packageInfo.baseAmountKobo,
    amountKobo: chargedAmountKobo,
    label: packageInfo.label,
  });
});

router.get("/payments/:reference", requireAuth, async (req, res): Promise<void> => {
  const reference = Array.isArray(req.params.reference)
    ? req.params.reference[0]
    : req.params.reference;
  const userId = (req as any).userId as string;
  const [payment] = await db
    .select()
    .from(paymentTransactionsTable)
    .where(
      and(
        eq(paymentTransactionsTable.reference, reference),
        eq(paymentTransactionsTable.clerkUserId, userId),
      ),
    )
    .limit(1);
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  if (payment.status !== "paid") {
    try {
      const verified = await verifyWithPaystack(reference);
      if (verified.status === "success") {
        await applySuccessfulPayment(payment, verified.status);
        res.json({ reference, status: "paid", packageType: payment.packageType });
        return;
      }
    } catch {
      // The webhook remains the source of truth if Paystack is temporarily unavailable.
    }
  }

  res.json({
    reference: payment.reference,
    status: payment.status,
    packageType: payment.packageType,
  });
});

router.post("/payments/webhook/paystack", async (req, res): Promise<void> => {
  const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY;
  const signature = req.header("x-paystack-signature");
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!secretKey || !signature || !rawBody) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  if (req.body?.event !== "charge.success") {
    res.json({ received: true });
    return;
  }

  const data = req.body?.data;
  const reference = typeof data?.reference === "string" ? data.reference : "";
  if (!reference) {
    res.status(400).json({ error: "Missing payment reference" });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.reference, reference))
    .limit(1);
  if (!payment) {
    res.status(404).json({ error: "Payment reference not found" });
    return;
  }

  if (payment.status !== "paid") {
    await applySuccessfulPayment(payment, String(data?.status ?? "success"));
  }

  res.json({ received: true });
});

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const payments = await db
    .select({
      reference: paymentTransactionsTable.reference,
      packageType: paymentTransactionsTable.packageType,
      status: paymentTransactionsTable.status,
      amountKobo: paymentTransactionsTable.baseAmountKobo,
      createdAt: paymentTransactionsTable.createdAt,
    })
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.clerkUserId, userId))
    .orderBy(desc(paymentTransactionsTable.createdAt))
    .limit(20);
  res.json({ payments });
});

export default router;
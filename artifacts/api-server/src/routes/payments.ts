import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  db,
  earlyBirdClaimsTable,
  paymentTransactionsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const EARLY_BIRD_LIMIT = 100;
const PAYMENT_PACKAGES = {
  student_verification: {
    baseAmountKobo: 150_000,
    durationDays: 30,
    label: "Green Tick (30 days)",
    entitlement: "badge",
  },
  premium_blue_tick: {
    baseAmountKobo: 500_000,
    durationDays: 30,
    label: "Premium Blue Tick (30 days)",
    entitlement: "badge",
  },
  marketplace_promotion_3_day: {
    baseAmountKobo: 50_000,
    durationDays: 3,
    label: "Marketplace Boost (3 days)",
    entitlement: "marketplace",
  },
  marketplace_promotion_7_day: {
    baseAmountKobo: 100_000,
    durationDays: 7,
    label: "Marketplace Boost (7 days)",
    entitlement: "marketplace",
  },
  marketplace_promotion_30_day: {
    baseAmountKobo: 300_000,
    durationDays: 30,
    label: "Marketplace Boost (30 days)",
    entitlement: "marketplace",
  },
  event_performance_ad_30_day: {
    baseAmountKobo: 800_000,
    durationDays: 30,
    label: "Event / Performance Ad (30 days)",
    entitlement: "ad",
  },
  corporate_ad_30_day: {
    baseAmountKobo: 1_000_000,
    durationDays: 30,
    label: "Corporate Ad (30 days)",
    entitlement: "ad",
  },
} as const;

type PaymentPackage = keyof typeof PAYMENT_PACKAGES;
type PaystackTransaction = {
  status?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  customer?: { email?: string };
};

function isPaymentPackage(value: unknown): value is PaymentPackage {
  return typeof value === "string" && Object.hasOwn(PAYMENT_PACKAGES, value);
}

/**
 * Customer fees are grossed up locally; the merchant dashboard's pass-fees
 * option must remain OFF or customers will be charged twice. The local fee is
 * 1.5% + NGN100 for transactions of NGN2,500 or more, with the NGN100 waived
 * below NGN2,500 and the total fee capped at NGN2,000.
 */
function calculateCustomerAmount(baseAmountKobo: number): number {
  let grossAmountKobo = baseAmountKobo;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const fixedFee = grossAmountKobo < 250_000 ? 0 : 10_000;
    const percentageFee = Math.floor((grossAmountKobo * 15 + 999) / 1_000);
    const feeKobo = Math.min(percentageFee + fixedFee, 200_000);
    const nextGrossAmountKobo = baseAmountKobo + feeKobo;
    if (nextGrossAmountKobo === grossAmountKobo) return grossAmountKobo;
    grossAmountKobo = nextGrossAmountKobo;
  }
  throw new Error("Could not calculate the Paystack customer fee.");
}

function isEarlyBirdEligible(user: typeof usersTable.$inferSelect): boolean {
  return (
    user.registrationRank <= EARLY_BIRD_LIMIT &&
    user.premiumBadgeDiscountPercent === 100 &&
    !!user.promoExpiresAt &&
    user.promoExpiresAt >= new Date()
  );
}

function expiresAfterDays(from: Date, durationDays: number): Date {
  return new Date(from.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

/**
 * Lazy-expire paid verification entitlements. Call before constructing
 * /users/me's response so stale paid statuses fall back to free approved.
 * Early-bird claims have no payment row and remain governed by promo expiry.
 */
export async function expirePaidBadgeEntitlement(clerkUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .for("update")
      .limit(1);
    if (!user || user.role === "ceo" || user.role === "admin") return;

    const packageType =
      user.verificationStatus === "Student_Verified" ||
      user.verificationStatus === "pending_paid"
        ? "student_verification"
        : user.verificationStatus === "Premium_Approved" ||
            user.verificationStatus === "Premium_Pending_Approval"
          ? "premium_blue_tick"
          : null;
    if (!packageType) return;

    const paidBadgePayments = await tx
      .select({
        paidAt: paymentTransactionsTable.paidAt,
        createdAt: paymentTransactionsTable.createdAt,
        durationDays: paymentTransactionsTable.durationDays,
        entitlementExpiresAt: paymentTransactionsTable.entitlementExpiresAt,
      })
      .from(paymentTransactionsTable)
      .where(
        and(
          eq(paymentTransactionsTable.clerkUserId, clerkUserId),
          eq(paymentTransactionsTable.packageType, packageType),
          eq(paymentTransactionsTable.status, "paid"),
        ),
      );
    if (!paidBadgePayments.length) return;

    const now = new Date();
    const hasActiveRenewal = paidBadgePayments.some((payment) => {
      const expiresAt =
        payment.entitlementExpiresAt ??
        expiresAfterDays(payment.paidAt ?? payment.createdAt, payment.durationDays);
      return expiresAt > now;
    });
    if (hasActiveRenewal) return;

    await tx
      .update(usersTable)
      .set({ verificationStatus: "approved" })
      .where(
        and(
          eq(usersTable.clerkUserId, clerkUserId),
          eq(usersTable.verificationStatus, user.verificationStatus),
          sql`${usersTable.role} not in ('ceo', 'admin')`,
        ),
      );
  });
}

async function claimEarlyBirdBenefit(
  clerkUserId: string,
  benefit: "badge" | "promotion",
  durationDays: number,
  badgeTier?: "student" | "premium",
): Promise<{ claimRank: number; alreadyClaimed: boolean } | null> {
  return db.transaction(async (tx) => {
    // Serialize the bounded claim window and assign a rank without a sequence.
    await tx.execute(sql`select pg_advisory_xact_lock(8675309)`);
    const [existing] = await tx
      .select()
      .from(earlyBirdClaimsTable)
      .where(eq(earlyBirdClaimsTable.clerkUserId, clerkUserId))
      .limit(1);

    if (existing) {
      if (existing.claimRank > EARLY_BIRD_LIMIT) return null;
      const alreadyClaimed =
        benefit === "badge" ? !!existing.badgeClaimedAt : !!existing.promotionClaimedAt;
      if (!alreadyClaimed) {
        await tx
          .update(earlyBirdClaimsTable)
          .set(
            benefit === "badge"
              ? { badgeClaimedAt: new Date() }
              : { promotionClaimedAt: new Date() },
          )
          .where(eq(earlyBirdClaimsTable.id, existing.id));
        await grantEarlyBirdBenefit(tx, clerkUserId, benefit, durationDays, badgeTier);
      }
      return { claimRank: existing.claimRank, alreadyClaimed };
    }

    const [{ maxRank }] = await tx
      .select({ maxRank: sql<number>`coalesce(max(${earlyBirdClaimsTable.claimRank}), 0)` })
      .from(earlyBirdClaimsTable);
    const claimRank = Number(maxRank) + 1;
    if (claimRank > EARLY_BIRD_LIMIT) return null;

    await tx.insert(earlyBirdClaimsTable).values({
      clerkUserId,
      claimRank,
      badgeClaimedAt: benefit === "badge" ? new Date() : null,
      promotionClaimedAt: benefit === "promotion" ? new Date() : null,
    });
    await grantEarlyBirdBenefit(tx, clerkUserId, benefit, durationDays, badgeTier);
    return { claimRank, alreadyClaimed: false };
  });
}

async function grantEarlyBirdBenefit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clerkUserId: string,
  benefit: "badge" | "promotion",
  durationDays: number,
  badgeTier?: "student" | "premium",
): Promise<void> {
  const [user] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (!user) throw new Error("Profile not found while granting early-bird benefit");
  if (benefit === "badge") {
    await tx
      .update(usersTable)
      .set({
        verificationStatus: sql`case when ${usersTable.role} in ('ceo', 'admin')
          or ${usersTable.verificationStatus} = 'Premium_Approved'
          then 'Premium_Approved' else ${badgeTier === "student" ? "Student_Pending" : "Premium_Pending_Approval"} end`,
      })
      .where(eq(usersTable.clerkUserId, clerkUserId));
  } else {
    const now = new Date();
    const currentExpiry =
      user.hustlePromoExpiresAt && user.hustlePromoExpiresAt > now
        ? user.hustlePromoExpiresAt
        : now;
    await tx
      .update(usersTable)
      .set({ hustlePromoExpiresAt: expiresAfterDays(currentExpiry, durationDays) })
      .where(eq(usersTable.clerkUserId, clerkUserId));
  }
}

async function getUserEmail(user: typeof usersTable.$inferSelect): Promise<string> {
  if (user.email.trim()) return user.email.trim().toLowerCase();
  return `${user.clerkUserId}@campusx.invalid`;
}

function validatePaystackTransaction(
  payment: typeof paymentTransactionsTable.$inferSelect,
  user: typeof usersTable.$inferSelect | undefined,
  data: PaystackTransaction,
): boolean {
  if (!user) return false;
  const expectedEmail = user.email.trim()
    ? user.email.trim().toLowerCase()
    : `${user.clerkUserId}@campusx.invalid`;
  return (
    data.status === "success" &&
    data.reference === payment.reference &&
    data.amount === payment.chargedAmountKobo &&
    data.currency === payment.currency &&
    typeof data.customer?.email === "string" &&
    data.customer.email.trim().toLowerCase() === expectedEmail
  );
}

async function applySuccessfulPayment(
  reference: string,
  paystackData: PaystackTransaction,
  webhookReceived: boolean,
): Promise<Date | null> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.reference, reference))
      .for("update")
      .limit(1);
    if (!payment) return null;
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, payment.clerkUserId))
      .limit(1);
    if (!user || !validatePaystackTransaction(payment, user, paystackData)) return null;
    if (payment.status === "paid") {
      return payment.entitlementExpiresAt ?? expiresAfterDays(
        payment.paidAt ?? new Date(),
        payment.durationDays,
      );
    }
    const product = PAYMENT_PACKAGES[payment.packageType as PaymentPackage];
    if (!product) return null;

    const paidAt = new Date();
    let entitlementExpiresAt: Date;
    if (product.entitlement === "marketplace") {
      const currentExpiry =
        user.hustlePromoExpiresAt && user.hustlePromoExpiresAt > paidAt
          ? user.hustlePromoExpiresAt
          : paidAt;
      entitlementExpiresAt = expiresAfterDays(currentExpiry, payment.durationDays);
      await tx
        .update(usersTable)
        .set({ hustlePromoExpiresAt: entitlementExpiresAt })
        .where(eq(usersTable.clerkUserId, payment.clerkUserId));
    } else {
      const [{ latestExpiry }] = await tx
        .select({
          latestExpiry: sql<Date | null>`max(${paymentTransactionsTable.entitlementExpiresAt})`,
        })
        .from(paymentTransactionsTable)
        .where(
          and(
            eq(paymentTransactionsTable.clerkUserId, payment.clerkUserId),
            eq(paymentTransactionsTable.packageType, payment.packageType),
            eq(paymentTransactionsTable.status, "paid"),
            gt(paymentTransactionsTable.entitlementExpiresAt, paidAt),
          ),
        );
      const renewalFrom =
        latestExpiry && latestExpiry > paidAt ? latestExpiry : paidAt;
      entitlementExpiresAt = expiresAfterDays(renewalFrom, payment.durationDays);
    }

    await tx
      .update(paymentTransactionsTable)
      .set({
        status: "paid",
        paystackStatus: paystackData.status ?? "success",
        paidAt,
        entitlementExpiresAt,
        webhookReceivedAt: webhookReceived ? paidAt : payment.webhookReceivedAt,
      })
      .where(eq(paymentTransactionsTable.reference, reference));

    if (product.entitlement === "badge") {
      const requestedStatus =
        payment.packageType === "student_verification"
          ? "pending_paid"
          : "Premium_Pending_Approval";
      await tx
        .update(usersTable)
        .set({
          verificationStatus: sql`case when ${usersTable.role} in ('ceo', 'admin')
            or ${usersTable.verificationStatus} = 'Premium_Approved'
            then 'Premium_Approved' else ${requestedStatus} end`,
        })
        .where(eq(usersTable.clerkUserId, payment.clerkUserId));
    }
    // Ad entitlements are represented by their paid transaction and duration.
    return entitlementExpiresAt;
  });
}

async function verifyWithPaystack(reference: string): Promise<PaystackTransaction> {
  const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY;
  if (!secretKey) throw new Error("PAYSTACK_LIVE_SECRET_KEY is not configured");

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
    data?: PaystackTransaction;
  };
  if (!response.ok || !body.status || !body.data) {
    throw new Error(body.message || "Paystack verification failed");
  }
  return body.data;
}

router.get("/payments/products", (_req, res): void => {
  res.json({
    currency: "NGN",
    feeDisclosure:
      "Customer totals include a local estimate of Paystack's fee. To avoid double charges, Paystack Dashboard 'Charge my customers for transaction fees' must be OFF; do not enable dashboard pass-fees alongside this local gross-up.",
    products: Object.entries(PAYMENT_PACKAGES).map(([packageType, product]) => ({
      packageType,
      label: product.label,
      durationDays: product.durationDays,
      baseAmountKobo: product.baseAmountKobo,
      amountKobo: calculateCustomerAmount(product.baseAmountKobo),
    })),
  });
});

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

  const product = PAYMENT_PACKAGES[packageType];
  const earlyBirdBenefit =
    product.entitlement === "badge"
      ? "badge"
      : product.entitlement === "marketplace"
        ? "promotion"
        : null;
  if (earlyBirdBenefit && isEarlyBirdEligible(user)) {
    const claim = await claimEarlyBirdBenefit(
      userId,
      earlyBirdBenefit,
      product.durationDays,
      packageType === "student_verification"
        ? "student"
        : packageType === "premium_blue_tick"
          ? "premium"
          : undefined,
    );
    if (claim) {
      res.json({
        success: true,
        requiresPayment: false,
        claimRank: claim.claimRank,
        message: claim.alreadyClaimed
          ? earlyBirdBenefit === "badge"
            ? "Your early-bird verification claim has already been submitted for admin review."
            : "Your early-bird marketplace boost claim has already been used."
          : earlyBirdBenefit === "badge"
            ? `Your ${packageType === "student_verification" ? "Student Verified" : "Premium Blue Tick"} claim is pending admin review.`
            : "Your early-bird marketplace boost has been activated.",
      });
      return;
    }
  }

  const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY;
  if (!secretKey || !process.env.PAYSTACK_LIVE_PUBLIC_KEY) {
    res.status(503).json({ error: "Paystack payments are not configured." });
    return;
  }

  const chargedAmountKobo = calculateCustomerAmount(product.baseAmountKobo);
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
        durationDays: product.durationDays,
        baseAmountKobo: product.baseAmountKobo,
        feeMethod: "local_gross_up",
        dashboardPassFees: "off",
      },
    }),
  });
  const body = (await paystackResponse.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string };
  };
  if (!paystackResponse.ok || !body.status || !body.data?.authorization_url) {
    res.status(502).json({ error: body.message || "Could not initialize Paystack payment." });
    return;
  }

  await db.insert(paymentTransactionsTable).values({
    reference,
    clerkUserId: userId,
    packageType,
    durationDays: product.durationDays,
    baseAmountKobo: product.baseAmountKobo,
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
    baseAmountKobo: product.baseAmountKobo,
    amountKobo: chargedAmountKobo,
    durationDays: product.durationDays,
    packageType,
    label: product.label,
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
        const entitlementExpiresAt = await applySuccessfulPayment(reference, verified, false);
        if (entitlementExpiresAt) {
          res.json({
            reference,
            status: "paid",
            packageType: payment.packageType,
            durationDays: payment.durationDays,
            baseAmountKobo: payment.baseAmountKobo,
            amountKobo: payment.chargedAmountKobo,
            entitlementExpiresAt: entitlementExpiresAt.toISOString(),
          });
          return;
        }
      }
    } catch {
      // The webhook remains the source of truth if Paystack is temporarily unavailable.
    }
  }

  res.json({
    reference: payment.reference,
    status: payment.status,
    packageType: payment.packageType,
    durationDays: payment.durationDays,
    baseAmountKobo: payment.baseAmountKobo,
    amountKobo: payment.chargedAmountKobo,
    entitlementExpiresAt: payment.entitlementExpiresAt?.toISOString() ?? null,
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

  const data = req.body?.data as PaystackTransaction | undefined;
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

  const entitlementExpiresAt = await applySuccessfulPayment(reference, data ?? {}, true);
  if (!entitlementExpiresAt) {
    res.status(400).json({ error: "Paystack payment details do not match the initialized payment." });
    return;
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
      amountKobo: paymentTransactionsTable.chargedAmountKobo,
      baseAmountKobo: paymentTransactionsTable.baseAmountKobo,
      createdAt: paymentTransactionsTable.createdAt,
      durationDays: paymentTransactionsTable.durationDays,
      entitlementExpiresAt: paymentTransactionsTable.entitlementExpiresAt,
    })
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.clerkUserId, userId))
    .orderBy(desc(paymentTransactionsTable.createdAt))
    .limit(20);
  res.json({ payments });
});

export default router;
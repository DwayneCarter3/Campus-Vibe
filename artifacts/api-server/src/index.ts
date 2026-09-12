import app from "./app";
import { logger } from "./lib/logger";
import { and, lt, isNotNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// ── Background: expire early-bird promos every 6 hours ──────────────────────
// Also runs once immediately on startup so no promos linger across restarts.
async function sweepExpiredPromos() {
  try {
    const result = await db
      .update(usersTable)
      .set({
        verificationStatus: "none",
        premiumBadgeDiscountPercent: 0,
        promoExpiresAt: null,
        hustlePromoExpiresAt: null,
      })
      .where(
        and(
          isNotNull(usersTable.promoExpiresAt),
          lt(usersTable.promoExpiresAt, new Date())
        )
      )
      .returning({ id: usersTable.id });
    if (result.length > 0) {
      logger.info({ expiredCount: result.length }, "Early-bird promos expired");
    }
  } catch (err) {
    logger.warn({ err }, "Promo expiry sweep failed (non-fatal)");
  }
}

// Run once at startup, then every 6 hours
sweepExpiredPromos();
setInterval(sweepExpiredPromos, 6 * 60 * 60 * 1000);

---
name: Drizzle serial push mismatch
description: Why routine schema pushes may fail against the existing registration rank sequence and how to proceed safely
---

The existing registration rank is an integer column with a sequence-backed default. Drizzle's push comparison can incorrectly request `ALTER COLUMN ... SET DATA TYPE serial`, which PostgreSQL rejects because `serial` is not a real column type. Expressing that field as an integer with a sequence default instead caused Drizzle to try dropping the live sequence; that approach is also unsafe. Do not use force-push or drop the sequence to work around this.

**Why:** The rank sequence determines early-bird eligibility, so resetting, replacing, or losing it would change entitlements. Both schema representations were tried and the automatic pushes failed. The additive schema changes succeeded in development before the unrelated rank diff failed, and the rank column retained its original default.

**How to apply:** For future DB schema updates, inspect the proposed SQL and physical development schema before concluding a push failed entirely. Preserve the rank sequence and its default. If this mismatch persists, use a reviewed, additive development-only schema update rather than a destructive force-push, and separately resolve the Drizzle introspection mismatch. Production schema updates belong to the normal Publish flow, not a startup or deployment script.
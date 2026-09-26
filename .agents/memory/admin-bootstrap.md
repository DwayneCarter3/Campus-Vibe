---
name: Admin bootstrap authorization
description: Why the initial CEO claim cannot be granted to an arbitrary first registrant.
---

The initial CEO/admin claim must be limited to the designated identity after checking the current verified Clerk primary email. A database role or isAdmin flag alone must not authorize a stale CEO identity; manually assigned admins still require a valid signed-in Clerk identity.

**Why:** The older first-come-first-served claim let any registered user become CEO before the intended owner. A stale stored email also allowed CEO authority after the Clerk email changed.

**How to apply:** Apply the shared privileged guard for admin-only routes, evidence downloads, and moderation. Fail closed for CEO operations if Clerk identity verification is unavailable.

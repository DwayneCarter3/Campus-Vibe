---
name: Early-bird launch eligibility
description: Durable rules for CampusX registration uniqueness, first-100 launch benefits, and expiry behavior.
---

The first 100 successful user records are identified by a database-assigned registration rank, not by a request-time count. Their launch benefits are represented explicitly: 100% premium badge discount, badge expiry, and Hustle promotion expiry, all anchored to the account creation timestamp.

**Why:** A request-time count is race-prone under concurrent signups, and a single generic expiry flag cannot distinguish which temporary benefits should be removed.

**How to apply:** Normalize verified Clerk emails to lowercase before registration and enforce a database-level unique index on non-empty lowercase emails plus a unique matriculation constraint. On expiry, clear the badge status, discount percentage, and Hustle promo expiry. Keep lazy expiry on profile reads/updates alongside the periodic server sweep so users cannot retain expired access between sweeps.
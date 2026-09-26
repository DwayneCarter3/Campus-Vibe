---
name: CEO authorization
description: Verified Clerk primary identity is the source of truth for CEO privileges.
---

CEO privilege requires a current verified primary Clerk email that matches the designated CEO address. A stored email or role may be stale after a Clerk identity change; profile reads can remain available during a Clerk outage, but privileged operations must fail closed.

**Why:** Existing role-only guards and a stored-email promotion path could retain or grant CEO access after the sign-in identity changed.

**How to apply:** Check the current Clerk primary-email verification status on CEO-gated actions, and do not authorize sensitive downloads or moderation from database flags alone.
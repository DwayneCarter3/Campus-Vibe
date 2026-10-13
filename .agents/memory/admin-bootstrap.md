---
name: Admin bootstrap authorization
description: Why the initial CEO claim cannot be granted to an arbitrary first registrant.
---

The initial CEO/admin claim must be limited to the designated identity after checking current verified Supabase identity and the protected founder binding. Role flags alone are not identity proof; manually assigned admins still require a valid signed-in identity.

**Why:** The older first-come-first-served claim let any registered user become CEO before the intended owner. Editable or stale stored emails are not proof of ownership.

**How to apply:** Apply the shared privileged guard for admin-only routes, evidence downloads, and moderation. Fail closed if verified identity is unavailable. See ceo-authorization.md for permanent founder binding.

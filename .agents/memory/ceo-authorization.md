---
name: CEO authorization
description: Permanent founder privileges require a verified Supabase identity and protected database binding.
---

CEO privilege requires a current verified Supabase identity backed by the protected founder binding. Founder aliases are reserved identifiers, not proofs of identity: an editable matric number must never grant privileges.

**Why:** The user requires permanent founder access across republishes, while previous stored-email/role-only checks could grant or retain unauthorized access. The full Supabase migration replaces the former Clerk authority.

**How to apply:** Fail closed when identity verification fails. Once the verified founder is bound, preserve their authority rather than granting it to another account that types or reuses an alias. Never overwrite Supabase's reserved JWT transport role with a CampusX application role.
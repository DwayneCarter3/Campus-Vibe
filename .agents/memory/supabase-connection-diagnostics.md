---
name: Supabase connection diagnostics
description: Distinguishing project availability and pooler routing errors from password or schema failures.
---

Do not treat Supabase pooler “Tenant or user not found” as proof of a bad password. Copy the complete host and username from the project's Connect dialog; never infer a pooler cluster hostname from its region.

**Why:** Different shared pooler clusters can serve the same region. Correctly formatted credentials can still target a host that does not route to the project.

**How to apply:** Check project-reference consistency and public DNS before requesting repeated credential changes. If the confirmed active project's API hostname returns NXDOMAIN on independent DNS, report an external availability blocker. Do not recreate its database, run schema pushes, or fall back to another database to work around connectivity.

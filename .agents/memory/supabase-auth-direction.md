---
name: Supabase authentication direction
description: User-approved provider migration and existing-account preservation requirements.
---

The user chose to move both authentication and application data to Supabase, rather than retain Clerk authentication with Supabase only for profiles.

**Why:** The user explicitly requested Supabase-backed account/session persistence and selected a full provider migration after the impact on existing web and mobile accounts was explained.

**How to apply:** Preserve existing accounts' profile/content associations. Verify the destination connection and migration before removing Clerk or switching the live application. Do not assume Clerk passwords can be transferred; provide a verified account recovery strategy where necessary.

The user requires database-enforced founder privileges that survive republishes, with separate login and signup behavior and duplicate signup rejection.

**Why:** The user reports founder privileges reverting in the published app and explicitly requires Supabase to be the persistent source of truth.

**How to apply:** Reconcile roles from trusted database identity during authentication, rather than relying on stale client/session roles. Reserve founder identifiers for a verified identity; freely editable signup fields must never grant privileged access.

---
name: Supabase authentication direction
description: User-approved provider migration and existing-account preservation requirements.
---

The user chose to move both authentication and application data to Supabase, rather than retain Clerk authentication with Supabase only for profiles.

**Why:** The user explicitly requested Supabase-backed account/session persistence and selected a full provider migration after the impact on existing web and mobile accounts was explained.

**How to apply:** Preserve existing accounts' profile/content associations. Verify the destination connection and migration before removing Clerk or switching the live application. Do not assume Clerk passwords can be transferred; provide a verified account recovery strategy where necessary.

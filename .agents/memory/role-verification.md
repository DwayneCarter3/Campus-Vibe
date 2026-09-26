---
name: Role verification invariant
description: Keep staff access separate from public verification entitlements.
---

CEO and admin accounts can retain internal `Premium_Approved` status for existing admin workflows, but this status must not generate a public tick. Public verification needs its own explicitly approved tier and unexpired entitlement. Staff role names and role-derived titles are not public identity labels.

**Why:** The user explicitly reversed the previous public role-badge policy. A CEO account with no paid transaction demonstrated that role-based status alone would create an unauthorized Blue Tick.

**How to apply:** Preserve internal access checks when changing roles or expiry paths; gate all public ticks by a separate approved tier and expiry, including on one's own profile. Keep the designated Dispatch Official marker distinct from staff-role badges.
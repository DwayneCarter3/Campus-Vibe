---
name: Role verification invariant
description: Keep staff access separate from public verification entitlements.
---

CEO and admin accounts can retain internal `Premium_Approved` status for existing admin workflows, but this status must not generate a public tick. Public verification needs its own tier and active entitlement. The single exception is the designated founder: a fresh verified primary Clerk identity grants a lifetime tick, Blue by default, with free choice of Green, Blue, or Gold. A `ceo` role flag or stored email alone must never activate it. Staff role names and role-derived titles are not public identity labels.

**Why:** The user reversed the general public role-badge policy but later specifically granted the founder a free lifetime choice. A CEO role flag can outlive a change of Clerk identity; it is not proof that an account is still the designated founder.

**How to apply:** Preserve internal access checks when changing roles or expiry paths; gate ordinary public ticks by a separately approved tier and expiry. Check current verified Clerk identity before granting or changing the founder's lifetime tier; remove that lifetime entitlement if identity is lost. Keep the designated Dispatch Official marker distinct from staff-role badges.
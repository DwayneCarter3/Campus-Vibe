---
name: Admin bootstrap pattern
description: CampusX admin role is first-claim via POST /admin/claim; only one admin exists globally.
---

- `usersTable.isAdmin` (boolean, default false) — the admin flag
- `POST /admin/claim` — sets current user as admin only if no admin row exists (`isAdmin = true`); returns 403 if one already does
- Pin-to-feed (`PATCH /posts/:id/pin-feed`) requires `isAdmin = true`; pin-to-profile only requires post authorship
- Only one post pinned to feed at a time; pinning unpins any previous feed-pinned post
- Only one post pinned to profile per user at a time
- Frontend shows "Become Admin" button when `profile.isAdmin === false`; shows "Campus Admin" badge when true

**Why:** Bootstrap approach avoids needing a separate admin seeding script. First user to hit the endpoint becomes admin.

**How to apply:** When adding admin-gated features, always fetch `isAdmin` from `usersTable` inside the route handler (don't trust client claims).

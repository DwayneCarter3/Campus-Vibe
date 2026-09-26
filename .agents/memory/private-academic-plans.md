---
name: Private academic plans
description: Privacy boundary for CGPA plans and future sensitive student academic tools.
---

Academic planning data must be retrieved and saved only for the currently authenticated account. Never accept an arbitrary student identifier in academic-plan requests or include these records in public profiles, search, feeds, or staff tools. Keep browser query caches scoped to the current account and short-lived after the planner unmounts.

**Why:** A CGPA is a private academic record; ordinary students and app administrators must not gain access to someone else's plan through an existing profile or staff route.

**How to apply:** Use server-derived session identity for future academic records, isolate their storage from public profile data, and review new endpoints and account-switch behavior for cross-user disclosure.
---
name: System DM actors
description: Why automated DM participants must not masquerade as student accounts.
---

Use a reserved system participant identity for automated DM senders, separate from student account records. Keep sender authorization on the server and expose a distinct bot presentation in clients.

**Why:** Student records and profiles assume a real Clerk identity and student registration data. A fabricated user would enter student search, profile, verification, and account flows with misleading metadata and could weaken message authorization.

**How to apply:** When extending automated conversations, treat system participants explicitly in conversation enrichment, sender validation, notifications, and client labels. Do not create a fake Clerk user to make the existing student-to-student DM path work.
---
name: Authentication regression isolation
description: Why authentication checks do not create live Supabase identities.
---

Authentication regression tests should use an isolated PostgreSQL runtime with the real identity migration and a simulated provider boundary. The live provider/database probe is read-only and belongs in a separate pre-publish connectivity check, not in the fixture setup. Never run former create/cleanup operations against a shared Supabase project.

**Why:** A disposable-looking account can still trigger shared founder/role constraints, and cleanup risks deleting application content. Isolated checks cannot prove a live network connection: the database host can resolve only to IPv6 where the runtime does not support IPv6 sockets.

**How to apply:** Keep role/identity assertions on isolated databases; verify the configured live service separately before publishing. If the host is IPv6-only, use a user-provided IPv4-compatible database connection rather than changing account data or disabling DB checks.

---
name: Authentication failure diagnostics
description: Preserve useful auth failure evidence without exposing private exception contents.
---

Authentication diagnostics must retain the failing stage and allowlisted provider/network/database codes without logging whole exceptions, messages, SQL, parameters, or credentials.

**Why:** Generic `Error` logging made session verification, profile reconciliation, and token refresh failures indistinguishable. Logging raw database or provider exceptions instead risks exposing submitted identities and private query values.

**How to apply:** Keep original causes internally and log only safe structured metadata with request correlation. Treat provider quotas as rate limits, not successful email delivery or generic server failures. Do not invent a provider quota reset time when it is unknown.

---
name: PostgreSQL schema export
description: Drizzle export loses quoted CHECK expressions containing semicolons.
---

Use native PostgreSQL schema exports when copying an existing database with quoted CHECK expressions. Do not assume Drizzle's export faithfully preserves these constraints.

**Why:** Exported WebP data-URL checks were truncated at a semicolon inside a quoted regex. Several generated-SQL approaches failed before a native PostgreSQL dump preserved the actual schema.

**How to apply:** Review constraints and preserve source sequence state as well as rows during external migrations. Existing registration counters can exceed the maximum surviving row after deletions; resetting them to that maximum changes historical eligibility.

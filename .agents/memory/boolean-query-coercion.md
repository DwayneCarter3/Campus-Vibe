---
name: Boolean query coercion
description: Avoid false-as-true parsing in generated request validators.
---

Do not pass URL query strings for boolean filters through `zod.coerce.boolean()`. Validate the literal strings `true` and `false`, then derive the boolean separately; omit the parameter from the generated schema parse when the generated validator coerces it.

**Why:** `zod.coerce.boolean()` follows JavaScript truthiness, so `Boolean("false")` is true. A default `savedOnly=false` request silently became a saved-only request and caused public feeds to return unauthorized.

**How to apply:** For generated API query schemas containing boolean coercion, handle incoming strings explicitly at route boundaries and cover absent, true, false, and invalid cases in smoke checks.
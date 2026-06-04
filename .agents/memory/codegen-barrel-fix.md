---
name: Codegen barrel fix
description: After every Orval codegen run both barrel files must be manually repaired before typecheck:libs will pass.
---

After running `pnpm --filter @workspace/api-spec run codegen`, Orval overwrites both barrels with stale references. Fix them manually:

1. `lib/api-zod/src/index.ts` → keep exactly one line: `export * from "./generated/api";`
2. `lib/api-client-react/src/index.ts` → keep all four exports:
   ```
   export * from "./generated/api";
   export * from "./generated/api.schemas";
   export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
   export type { AuthTokenGetter } from "./custom-fetch";
   ```
3. Run `pnpm run typecheck:libs` to rebuild composite lib declarations.

**Why:** Orval's barrel generation adds a stale `./generated/api.schemas` line to `api-zod/src/index.ts` which doesn't exist, causing TS2307. The `api-client-react` barrel also gets overwritten, losing the `custom-fetch` re-exports.

**How to apply:** Every time the codegen command is run, immediately apply both fixes before anything else.

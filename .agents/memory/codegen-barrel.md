---
name: Codegen barrel fix
description: What to fix in both barrel files after every Orval codegen run
---

After every `pnpm --filter @workspace/api-spec run codegen` run, Orval overwrites barrel files with stale references. Always fix both:

1. `lib/api-zod/src/index.ts` → must be ONLY: `export * from "./generated/api";`
   (remove any `export * from "./generated/api.schemas"` — that file doesn't exist)

2. `lib/api-client-react/src/index.ts` → must export all three:
   ```
   export * from "./generated/api";
   export * from "./generated/api.schemas";
   export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
   export type { AuthTokenGetter } from "./custom-fetch";
   ```

Then run `pnpm run typecheck:libs` to rebuild composite libs.

**Why:** Orval regenerates the barrel with both file references, but api-zod only generates one file (`api.ts`, not `api.schemas.ts`). api-client-react generates both files so its barrel is already correct post-codegen.

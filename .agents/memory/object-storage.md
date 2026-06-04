---
name: Object Storage setup
description: How object storage is wired in this project and key gotchas
---

Object storage bucket ID: replit-objstore-18b69ecc-41d3-4e82-aa8f-1de2afed7b6b (already provisioned).

Server files copied into `artifacts/api-server/src/lib/` (objectStorage.ts, objectAcl.ts) and `artifacts/api-server/src/routes/storage.ts`. Router wired in `routes/index.ts`.

**Serving URL pattern:** store `/api/storage${objectPath}` in the DB (objectPath looks like `/objects/uploads/uuid`). Use as `<img src>` or `<video src>` directly.

**Cast fix required:** `objectStorage.ts` line with `response.json()` must be cast: `(await response.json()) as { signed_url: string }` — otherwise TS2339 error on `signed_url`.

**Why:** TypeScript strict mode treats `response.json()` as `unknown`; the template doesn't include the cast.

**How to apply:** When copying the objectStorage.ts template, always add the cast on the signed_url destructure line.

Do NOT use `@workspace/object-storage-web` as a composite workspace lib — it adds tsconfig complexity for no gain. Instead, implement the presigned URL upload flow directly in the component using plain `fetch` calls to `/api/storage/uploads/request-url`.

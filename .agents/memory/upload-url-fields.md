---
name: UploadUrlResponse field name
description: The generated RequestUploadUrlResponse type uses uploadURL not signedUrl.
---

The generated Zod/TS type for the presigned upload response is `RequestUploadUrlResponse` with fields:
- `uploadURL` (string URL) — use this for the `fetch` PUT call
- `objectPath` (string) — store as `/api/storage${objectPath}` for DB

**Why:** The OpenAPI spec field is camelCased as `uploadURL`; code that guesses `signedUrl` or `signed_url` will get a TS2339 type error.

**How to apply:** When writing upload logic, always reference `uploadData.uploadURL` for the PUT and `uploadData.objectPath` for the stored path.

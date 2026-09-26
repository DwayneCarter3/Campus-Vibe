---
name: Safe media cleanup
description: Ownership proof and reference checks for post-media deletion.
---

When removing stored media with a post, require proof that the post author requested the upload, and confirm that no remaining post or avatar references that object. Do not infer upload ownership from a post's URL alone. Untracked older uploads must be left intact rather than risking another user's file.

**Why:** App-served object URLs can be copied into another user's post. Deleting a supposedly unreferenced object based only on that post's attachment could erase the actual uploader's file. Older uploads did not record uploader identity, so their safe ownership cannot be reconstructed automatically.

**How to apply:** Keep upload issuance authenticated and track the issuing account. Before deleting an object after post removal, compare its upload record to the deleted post's author and check all remaining references. Explain the legacy cleanup limitation if a user asks about old files.
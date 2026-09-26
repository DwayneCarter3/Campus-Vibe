---
name: Image upload rollout
description: Compatibility boundary when applying strict WebP rules to signed media uploads.
---

New purpose-tagged post and marketplace image uploads should be WebP under the size limit and verified against stored bytes before attaching. Keep owner-verified post uploads with older, purpose-less receipts compatible during the client rollout; do not treat purpose-less marketplace images as newly verified media.

**Why:** Previously released clients request signed upload URLs without an image purpose. Rejecting all purpose-less receipts would make their otherwise successful post uploads fail on publication. Older stored photos also cannot become smaller just by tightening a new-upload rule.

**How to apply:** Coordinate any future removal of legacy compatibility with a client-version cutover. If optimizing historical photos, create safe derivatives without deleting original objects or guessing uploader ownership.
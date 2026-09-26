---
name: Pending verification and promo expiry
description: Keep moderation requests and manual overrides stable when launch promotions expire.
---

An expired launch promotion should remove promotional benefits without discarding a pending verification review. An admin's explicit verification decision should not be reversed later by a leftover promotion expiry timer.

**Why:** A profile can show “Pending” while the admin queue is empty if an expiry read resets its status. Likewise, a manually approved badge can disappear when a stale promo timer runs.

**How to apply:** Preserve pending review states during expiry, and detach manual moderation outcomes from promo expiry while leaving unrelated marketplace promotion benefits intact.
---
name: Early-bird launch eligibility
description: Durable rules for CampusX registration uniqueness, first-100 launch benefits, and expiry behavior.
---

The first 100 successful user records are identified by a database-assigned registration rank for registration-based marketplace perks. The free Green Tick promotion is a separate first-100-*claims* offer: count distinct reserved badge claims under a serialized transaction, regardless of registration rank. Claims need admin approval, and exactly 30 days of free verification begin at approval, not registration or claim. The badge and marketplace benefit retain independent expiry.

**Why:** A request-time count is race-prone under concurrent signups; registration rank incorrectly closes a promotion defined by claims. A single generic expiry flag cannot distinguish when separately activated benefits should end.

**How to apply:** Keep signup rank eligibility for marketplace perks only. Normalize and enforce unique verified Clerk primary emails globally; enforce matric uniqueness per canonical institution, including older records. Promo expiry must not erase a free tick still within its approval-time 30 days, a pending review, an active paid tier, or an independent marketplace boost.
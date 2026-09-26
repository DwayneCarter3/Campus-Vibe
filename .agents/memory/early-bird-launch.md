---
name: Early-bird launch eligibility
description: Durable rules for CampusX registration uniqueness, first-100 launch benefits, and expiry behavior.
---

The first 100 successful user records are identified by a database-assigned registration rank, not by a request-time count. Separate claim availability from eligibility: free badge claims need admin approval, and the badge and marketplace benefit each retain their own expiry.

**Why:** A request-time count is race-prone under concurrent signups, and a single generic expiry flag cannot distinguish which temporary benefits should be removed.

**How to apply:** Normalize and enforce unique verified Clerk primary emails globally; enforce matric uniqueness per canonical institution, including existing records whose IDs predate the catalogue. Promo expiry must not erase the free Student Verified status, a pending review, an active paid tier, or an independent marketplace boost.
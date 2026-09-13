---
name: Role verification invariant
description: Rules for keeping privileged CampusX accounts verified across admin actions and profile reads.
---

CEO and admin accounts must remain `Premium_Approved`, which drives both the Student Verified and Premium Blue Tick states. Admin list/profile reads repair older records, and role changes promote privileged accounts immediately.

**Why:** Privileged accounts need uninterrupted access and visible trust badges, including accounts created before the role system was added.

**How to apply:** Any future verification mutation or expiry path must preserve this invariant for `ceo` and `admin`; ordinary users may be approved or revoked independently.
---
name: Verification badge tiers
description: Public verification tiers and the rule against inferring a vendor-specific badge.
---

Basic student approval shows no adjacent checkmark; show exactly one paid-verification tier mark beside names: Green Tick for Student_Verified or Premium Blue Tick for Premium_Approved. Do not add a secondary green pill or checkmark. Gold is a visual option, not an automatically assigned business-vendor entitlement. Feed post headers are an explicit exception to the former no-role-label rule: show level and role as separate, plainly labeled metadata badges, without styling them as verification. Other public surfaces should not gain role labels automatically.

**Why:** The user removed the standalone green check icon from usernames and wants one paid/premium tier mark when applicable. Later they specifically asked for Level and Role Badges beside post authors. These metadata labels must remain visually and semantically distinct from paid verification.

**How to apply:** Use the specific verification status, not a general isVerified boolean, to choose public marks. Feed cards may show separate level/role labels for non-anonymous posts; never expose these labels for anonymous authors. Keep moderation controls inside the private dashboard. Define and check a dedicated entitlement before assigning any vendor-specific gold badge.
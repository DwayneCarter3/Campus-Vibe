---
name: Anonymous post privacy
description: Why anonymous post identity must be masked across public representations, including the owner's view and reshares.
---

Anonymous post identity is masked in every public API response, even when requested by its creator. Nested originals in reshares and profile post lists must be masked too. Ownership is conveyed with a requester-specific boolean, not by exposing the stored author ID. Moderation and delete authorization use the original DB author ID server-side.

**Why:** The earlier implementation showed the real author to their own session and leaked an anonymous original's identity through reshares. A single unmasked representation is enough to defeat anonymous posting. A named self-reshare can also link the author to an otherwise masked original.

**How to apply:** When adding any public post endpoint, projection, notification, or client action, check both the outer post and embedded originals. Do not let authors reshare their own anonymous originals as identified posts. Keep the real identifier in server-side data only, and never substitute it back into public responses for convenience. Public GET routes that offer viewer-specific ownership must read optional Clerk identity directly; the auth-only middleware does not populate the identity on public routes.
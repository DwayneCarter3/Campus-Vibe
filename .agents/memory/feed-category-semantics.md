---
name: Feed category semantics
description: Why All Gist does not persist as a post category and how legacy posts are handled.
---

All Gist is a filter/view rather than a post category. Posts must carry one of the four specific category tags. An unspecified choice, including choosing All in a composer, publishes as Amebo Hot; existing posts are also backfilled to that value.

**Why:** The user requested All alongside post-creation categories but also wanted category-specific tabs and an Amebo Hot default. Persisting All as a category would strand posts outside the four topical tabs.

**How to apply:** Keep All as an unfiltered feed option; map All in a posting UI to the default category rather than storing it. Preserve the default for legacy/mobile clients that omit category.
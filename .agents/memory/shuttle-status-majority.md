---
name: Shuttle status majority
description: Interpretation of the 30-minute crowd report window and ambiguous outcomes.
---

Only display a shuttle status as the crowd majority when it has strictly more than half of the active unique student reports from the previous 30 minutes. If votes split without a majority, display "No clear majority yet" and retain the total student count and most recent report time. A later vote replaces an earlier vote from the same student.

**Why:** The requested status is a *majority*, not simply the leading option. Showing a plurality as certain, or hiding disagreement in a tie, would mislead students deciding whether to travel.

**How to apply:** Preserve this distinction in server aggregation and in every web/mobile status banner; refresh often enough for the 30-minute rolling window to expire old votes.
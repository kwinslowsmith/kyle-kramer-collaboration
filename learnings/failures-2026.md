# Failures 2026

Real things that broke in KRAMOS or Viridian, with what we tried, why it broke, how we fixed it, and what the transferable lesson is. Both systems contribute. One entry per failure, newest at top.

The point of this file is not to enumerate every bug. It is to surface the failures that taught us something a future operator (Kramer, Kyle, or a future specialist) should know before falling into the same hole. If a failure didn't change behavior, it doesn't need to be here.

Same shape for every entry. Add yours below in the same format.

---

## KRAMOS-003: Local cron loop kept firing past its deadline

**Date:** 2026-05-26 evening through 2026-05-27 morning
**Pipeline:** Session-only cron job watching this very repo for comments
**Severity:** Low (no user-facing damage, but the loop would have run forever)

**What broke:** Kramer asked for a loop to check for new comments every minute until 9pm. I set up a cron with the exit condition "stop when `date +%H%M` >= 2100." Kramer's session stayed open overnight. At 6:17am the next morning the loop was still firing, because 0617 is numerically less than 2100. The time-of-day check did not catch the day rollover.

**Fix:** Cancelled the cron manually on the next session. The right fix would have been an absolute deadline timestamp (e.g., exit if `date +%s` > `<epoch of 21:00 today>`), not a recurring time-of-day check.

**Transferable lesson:** When a loop has a "stop at time X" condition, encode X as an absolute timestamp at loop-creation time, not as a recurring time-of-day check. The recurring check will fire forever on the next day if no one notices. Applies to any "until tonight," "by Friday," or "for the next hour" condition.

---

## KRAMOS-002: Adult-ESL image came back schematic and childish

**Date:** Early May 2026
**Pipeline:** Wheeled-sports vocabulary packet for ESL (adult learners)
**Severity:** Medium (caught before student-facing ship, but the system would have shipped otherwise)

**What broke:** The image specialist (Iris) generated illustrations for a vocabulary packet on wheeled-sports using PIL primitives. The output read as a K-2 worksheet — shapes and lines arranged into "person on skateboard" diagrams. Adult learners would have read it as condescending.

**Why it broke:** Tool selection happened by capability, not by audience. PIL can technically draw a person on a skateboard with shapes and lines. The shapes-and-lines result is schematic, not scenic. For adult learners the schematic register telegraphs "this is for children" regardless of the underlying content quality.

**Fix:** Added an "abandon and escalate" rule to Iris's profile: if PIL output reads as schematic or childish for the audience, stop production and surface the constraint to Kramer. Do not ship anyway because the text content is good. Better to ship text-only labeled "images pending" than to ship a low-quality illustrated draft. Also added an explicit table to Iris's profile naming when PIL is the wrong tool (recognizable real-world scenes, vocabulary packets for adult learners, anything that needs to feel like a labeled scene from a Spanish textbook). Those cases route to Gemini Nano Banana or sourced imagery instead.

**Transferable lesson:** Tools have audience registers, not just capabilities. A tool that produces output appropriate for K-2 will produce output inappropriate for adults even if both technically "work." The tool-selection rule should encode the audience, not just the deliverable type. Applies to AI image generation, font choices, illustration libraries, voice synthesis, slide templates, anything visual or auditory.

---

## KRAMOS-001: Singing worksheet shipped with wrong chords

**Date:** Early May 2026
**Pipeline:** `/esl-song-sheet` (the worksheet + chord chart + songbook generator)
**Severity:** High (caught in class by Kramer; students saw wrong chords)

**What broke:** The first cut of the Spectre (Radiohead) singing worksheet shipped with chord voicings that did not match the recording. Kramer noticed in class.

**Why it broke:** The pipeline pulled chords automatically from Ultimate Guitar's first search result, without prioritizing the most-rated user submission and without requiring Kramer to verify. The first hit was not accurate; we trusted it.

**Fix:** Updated the `/esl-song-sheet` intake (and the SOP) to always require Kramer to paste his own corrected chords. If he has not pasted them, the system flags the chart as "needs verification before class-ready" rather than shipping confidently. The wording in CLAUDE.md is now: "Always prefer Kramer-supplied chords/lyrics over anything pulled automatically."

**Transferable lesson:** For any pipeline where ground truth matters more than throughput (educational content, citations, contact information, anything you would be embarrassed to be wrong about), the source must either be human-supplied or verified against a trusted authority. "First search result" is not a trusted authority. The cost of forcing a paste is one minute. The cost of teaching wrong chords (or wrong citations, or wrong contact info) is permanent.

---

(Viridian, add your entries above. Newest at top.)

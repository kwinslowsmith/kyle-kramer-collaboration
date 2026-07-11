/**
 * SRS scheduler — SM-2 with binary grading, for the word-recall Quiz.
 *
 * Milestone 1 of the Quiz Plus productionization (see korean-photo-slideshow/
 * STATUS.md, 2026-07-10b audit). Until now Quiz picked ROUND_MAX words uniformly
 * at random every round — a word missed five times and a word known cold had
 * identical draw odds, and the `reviews` grade store was written but never read
 * back into selection. This module is what reads it back.
 *
 * Pure functions, no Firestore, no DOM — quiz.js owns the store, app.js owns the
 * write, this file owns only the math. That keeps the scheduling logic trivial to
 * reason about (and to change: swap SM-2 for Leitner/FSRS here without touching
 * the quiz UI).
 *
 * State shape (per word, stored on the review doc alongside seen/correct):
 *   { interval, ease, reps, due }
 *     interval — days until the next review after the last one
 *     ease     — SM-2 easiness factor (>= MIN_EASE); how fast the interval grows
 *     reps     — consecutive correct answers (resets to 0 on a miss)
 *     due      — epoch ms the card next comes up; <= now means "due"
 *
 * Binary grading (locked in the audit): correct -> q4, wrong -> q1. A miss tanks
 * the ease and drops the card back to a 1-day interval (relearn tomorrow); a hit
 * keeps the ease and grows the interval 1 -> 6 -> round(interval * ease).
 */

export const DAY_MS = 86400000;
export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Advance one card's schedule given the latest answer. `prev` is the card's
// current state (or null/undefined for a card being graded for the first time).
export function schedule(prev, correct, now) {
  let { interval = 0, ease = DEFAULT_EASE, reps = 0 } = prev || {};
  const q = correct ? 4 : 1;                       // binary grade -> SM-2 quality
  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (!correct) {
    reps = 0;
    interval = 1;                                  // relearn: due again tomorrow
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
  }
  return { interval, ease: round2(ease), reps, due: now + interval * DAY_MS };
}

// Bootstrap SRS state for a legacy review doc that has seen/correct counts but no
// scheduling fields (every doc written before Milestone 1). Never-quizzed words
// (seen === 0) stay NEW — they flow through the new-card budget, not here. A
// seeded card is due right now, so its very next answer schedules it properly;
// the seed only sets a sensible starting ease/interval so that first real grade
// doesn't over- or under-shoot.
export function seedState(seen, correct, now) {
  if (!seen) return null;
  const acc = correct / seen;
  const ease = round2(clamp(MIN_EASE + acc * 1.0, MIN_EASE, DEFAULT_EASE));
  const interval = acc >= 0.8 ? 3 : acc >= 0.5 ? 2 : 1;
  return { interval, ease, reps: correct, due: now };
}

// A card with SRS state is "due" when its due time has passed (or is unset).
export function isDue(state, now) {
  return !state || state.due == null || state.due <= now;
}

// How overdue a card is, in ms (negative = not due yet). Used to order the due
// queue most-overdue-first so the words rotting longest come back soonest.
export function overdueBy(state, now) {
  return now - (state?.due ?? now);
}

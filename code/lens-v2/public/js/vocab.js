/**
 * Shared vocabulary logic — the small rules that both the on-screen ledger and
 * the markdown takeout have to agree on.
 *
 * These live here rather than in data.js so export-md.js can reuse them without
 * importing the Firestore SDK (and so the two modules don't form an import
 * cycle). If mastery ever changes shape, it changes here once and the file the
 * learner downloads still matches the chips they see in the app.
 *
 * No imports, no top-level side effects — safe to load anywhere, including node.
 */

// Same normalization app.js uses for the review doc id, so words join reliably.
export function wordKey(s) {
  return String(s).toLowerCase().replace(/\//g, "-");
}

// Meaning is shown in the learner's home language; if that equals the language
// being listed, fall back so we still show a gloss.
export function meaningLangFor(tl) {
  const home = (typeof localStorage !== "undefined" && localStorage.getItem("lensHome")) || "en";
  if (home !== tl) return home;
  return tl === "en" ? "es" : "en";
}

// Mastery is derived from quiz grades, never stored.
export function masteryOf(review) {
  if (!review || !review.seen) return "new";
  const acc = review.correct / review.seen;
  if (review.seen >= 3 && acc >= 0.8) return "known";
  return "learning";
}

export const MASTERY_LABEL = { new: "New", learning: "Learning", known: "Known" };
export const MASTERY_RANK = { learning: 0, new: 1, known: 2 };   // weakest first

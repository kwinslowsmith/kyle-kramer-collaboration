/**
 * Romanization preference — per-user, remembered.
 *
 * Korean (romanized Hangul) and Japanese (romaji) carry a Latin `reading`
 * alongside the native script. Some learners want that crutch, others want it
 * off so they read the real script. This holds a per-language on/off flag in
 * localStorage (defaults ON, matching the app's original behavior) and every
 * render site gates its `reading` output through showRoman(lang).
 *
 * Only ko/ja have a toggle. Other scripts with a reading (e.g. zh pinyin) are
 * always shown — no toggle was requested for them, and hasRomanToggle() keeps
 * the UI honest about which languages the switch applies to.
 */
const KEY = { ko: "lensRomanKo", ja: "lensRomanJa" };

// Does this language have a user-facing romanization toggle?
export function hasRomanToggle(lang) { return lang === "ko" || lang === "ja"; }

// Should the Latin reading be shown for this language right now?
export function showRoman(lang) {
  if (!hasRomanToggle(lang)) return true;      // untoggled scripts always show
  return localStorage.getItem(KEY[lang]) !== "off";   // default ON
}

export function setRoman(lang, on) {
  if (!hasRomanToggle(lang)) return;
  localStorage.setItem(KEY[lang], on ? "on" : "off");
  document.dispatchEvent(new CustomEvent("lens:romanchange", { detail: { lang, on } }));
}

export function toggleRoman(lang) {
  const next = !showRoman(lang);
  setRoman(lang, next);
  return next;
}

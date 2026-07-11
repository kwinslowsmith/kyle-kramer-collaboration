/**
 * tts.js — robust text-to-speech voice selection.
 *
 * The bug this fixes: setting only `utterance.lang` is NOT enough. iOS Safari
 * and Android Chrome routinely ignore `lang` and speak with the phone's DEFAULT
 * system voice — so a learner whose phone language is Japanese hears English
 * words pronounced with a Japanese voice (Japanese phonetics on English text).
 *
 * The fix: explicitly pick a SpeechSynthesisVoice whose own `.lang` matches the
 * TARGET language (the language of the text), and assign it to `u.voice`. That
 * forces the engine onto the right voice regardless of the device language.
 *
 * Three real-world failure modes this module also has to survive, all of which
 * show up as "the speaker button does nothing":
 *   1. getVoices() populates ASYNC — on mobile the very first tap often sees an
 *      empty list, so the first utterance fires cold and is silent. We wait
 *      (briefly) for voices before speaking.
 *   2. cancel() immediately before speak() drops the utterance on Chromium, and
 *      Chrome's engine can wedge after idle — a resume() nudge unsticks it.
 *   3. The device may have NO voice for the target language (Basque always;
 *      CJK on a stripped device). We report that to the caller via a status so
 *      the UI can surface it instead of failing silently.
 */

let _voices = [];

// Per-language prosody, keyed by base language code. Default is a touch slower
// than 1.0 for learner clarity; Korean/Japanese get a small pitch lift so the
// default device voice doesn't read uncomfortably low.
const DEFAULT_PROSODY = { rate: 0.95, pitch: 1.0 };
const PROSODY = {
  ko: { rate: 0.92, pitch: 1.12 },
  ja: { rate: 0.94, pitch: 1.05 },
};

function loadVoices() {
  try { _voices = window.speechSynthesis.getVoices() || []; }
  catch { _voices = []; }
  return _voices;
}

const _hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;

if (_hasTTS) {
  loadVoices();
  // Voices arrive asynchronously on most browsers; refresh the cache when they do.
  try { window.speechSynthesis.addEventListener("voiceschanged", loadVoices); }
  catch { /* older engines: getVoices() is already populated synchronously */ }
}

/**
 * Resolve once the voice list is populated, or after `timeout` ms — whichever
 * comes first. On iOS/Android the list is empty for the first ~100-500ms after
 * load, so speaking before it fills produces a silent utterance.
 */
function voicesReady(timeout = 1000) {
  return new Promise((resolve) => {
    if (loadVoices().length) return resolve(_voices);
    let done = false;
    const finish = () => { if (done) return; done = true; cleanup(); resolve(loadVoices()); };
    const onChange = () => { if (loadVoices().length) finish(); };
    function cleanup() {
      try { window.speechSynthesis.removeEventListener("voiceschanged", onChange); } catch {}
      clearTimeout(timer);
    }
    try { window.speechSynthesis.addEventListener("voiceschanged", onChange); } catch {}
    const timer = setTimeout(finish, timeout);   // fall through even if voices never arrive
  });
}

/**
 * Best installed voice for a BCP-47 tag like "en-US".
 * Priority: exact tag → same base language (preferring an on-device voice) →
 * null (no voice for this language on this device).
 */
function voiceQuality(v) {
  const name = (v.name || "").toLowerCase();
  let s = 0;
  if (name.includes("google")) s += 40;                                   // Android natural voices
  if (name.includes("siri")) s += 38;                                     // iOS 16+ Siri voices
  if (name.includes("enhanced") || name.includes("premium") || name.includes("neural")) s += 30;
  if (name.includes("compact")) s -= 40;                                  // iOS compact = robotic
  if (name.includes("eloquence")) s -= 30;                                // legacy synth engine
  if (name.includes("novelty") || name.includes("whisper")) s -= 60;      // joke/effect voices
  if (v.localService) s += 5;                                             // on-device = reliable
  return s;
}

export function pickVoice(bcp47) {
  if (!_voices.length) loadVoices();
  if (!_voices.length) return null;

  const want = (bcp47 || "").toLowerCase();
  const base = want.split("-")[0];
  const norm = (v) => (v.lang || "").toLowerCase().replace("_", "-");
  // Yuria's 2026-07-02 feedback: English sounded accented/unnatural and Korean
  // read very low. Root cause is usually the device returning its robotic
  // "compact"/legacy voice first — so rank candidates by naturalness and take
  // the best, rather than the first. See voiceQuality().
  const best = (list) => list.slice().sort((a, b) => voiceQuality(b) - voiceQuality(a))[0];

  // 1. Exact region match (en-US === en-US), best-quality first.
  const exact = _voices.filter((v) => norm(v) === want);
  if (exact.length) return best(exact);

  // 2. Same base language (any English voice for "en-*"), best-quality first.
  const sameBase = _voices.filter((v) => norm(v).split("-")[0] === base);
  if (sameBase.length) return best(sameBase);

  // 3. No matching voice installed on this device.
  return null;
}

/** True if this device can actually pronounce the given BCP-47 language. */
export function canSpeak(bcp47) {
  return _hasTTS && !!pickVoice(bcp47);
}

/**
 * Flash a small transient hint next to a speaker button when the device has no
 * voice for that language, so a silent tap doesn't read as a broken button.
 */
export function noVoiceHint(el, msg = "No voice for this language on your device") {
  try {
    if (!el) return;
    const tip = document.createElement("span");
    tip.className = "tts-hint";
    tip.textContent = msg;
    tip.setAttribute("role", "status");
    (el.parentNode || document.body).appendChild(tip);
    setTimeout(() => tip.remove(), 2600);
  } catch { /* non-DOM context — ignore */ }
}

/**
 * Speak `text` in the language identified by BCP-47 tag `bcp47` (e.g. "en-US").
 * Always sets both `lang` and, when available, an explicit `voice` so the
 * device's default system voice can't hijack pronunciation.
 *
 * Returns a Promise<"ok" | "no-voice" | "unsupported" | "empty" | "error"> so
 * callers can surface a "no voice for this language" hint instead of a button
 * that silently does nothing. Firing it and ignoring the result is fine too.
 */
export async function speak(text, bcp47) {
  if (!text) return "empty";
  if (!_hasTTS) return "unsupported";
  try {
    // Wait for the voice list on the first tap (mobile populates it async).
    await voicesReady();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47;
    const v = pickVoice(bcp47);
    if (v) u.voice = v;            // force the target-language voice

    // Learner-tuned prosody. Slightly slower than default for clarity, and a
    // gentle pitch lift for languages whose device voice tends to read low —
    // Korean especially (Yuria's 2026-07-02 note that the Korean voice was
    // "very low in pitch"). A subtle nudge; never cartoonish.
    const pros = PROSODY[(bcp47 || "").toLowerCase().split("-")[0]] || DEFAULT_PROSODY;
    u.rate = pros.rate;
    u.pitch = pros.pitch;

    const synth = window.speechSynthesis;
    synth.cancel();
    // Let cancel() settle before speak() — same-tick speak drops on Chromium.
    await new Promise((r) => setTimeout(r, 0));
    synth.speak(u);
    // Chrome can wedge in a paused state after idle; nudge it awake.
    try { if (synth.paused) synth.resume(); } catch {}

    // No installed voice for this language: we still tried (u.lang best-effort),
    // but tell the caller so it can show a hint rather than look broken.
    return v ? "ok" : "no-voice";
  } catch {
    return "error";
  }
}

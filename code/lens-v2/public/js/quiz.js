/**
 * Quiz mode — active recall over the learner's OWN captured words.
 *
 * Kramer's requested next-step #4 ("daily recall testing, active recall not
 * passive") and the keystone the SRS scheduler (#3) + leaderboard (#7) hang off.
 *
 * Format (locked 2026-06-29): multiple choice, mixed direction.
 *   - "produce"   : prompt = home meaning (+ photo), pick the target-language word
 *   - "recognize" : prompt = target word, pick the home-language meaning
 *     (photo hidden until the answer, or it would give the meaning away)
 * Each answer is recorded per word to Firestore (users/{uid}/reviews/{lang__word})
 * via a callback app.js installs — that per-word grade store is what SRS reads.
 *
 * Language pair comes from the SAME lensHome/lensTarget the study pickers own;
 * we re-read it on every build and rebuild on the `lens:langchange` broadcast.
 */
import { LANG, speak, speakFromButton } from "./study.js";
import { showRoman } from "./roman.js";
import { wordKey } from "./vocab.js";
import { schedule, seedState, isDue, overdueBy } from "./srs.js";

const ROUND_MAX = 12;        // questions per round (capped to the available pool)
const MAX_OPTIONS = 4;
const DEFAULT_NEW_PER_DAY = 5;   // Anki-style cap on brand-new words per day

let photos = [];
let reviewHandler = null;    // (lang, word, correct, meta) => Promise, set by app.js
let reviewState = new Map(); // `${lang}__${wordKey}` -> {seen, correct, interval, ease, reps, due}
let visible = false;

let round = [];              // the questions for this round
let roundHome = "en";        // the round's language pair (round is a plain array)
let roundTarget = "ko";
let qi = 0;                  // current question index
let answered = false;        // current question locked?
let score = 0;

const $ = (s) => document.querySelector(s);

// app.js owns the Firestore write; quiz.js just reports the grade.
export function setReviewHandler(fn) { reviewHandler = fn; }

// app.js loads the user's `reviews` collection once at login and hands it here as
// a Map keyed `${lang}__${wordKey}` so the scheduler can read grades back into
// selection. Legacy docs (no SRS fields) get seeded lazily at build time.
export function setQuizReviews(map) {
  reviewState = map instanceof Map ? map : new Map();
  if (visible) start();
}

const rk = (lang, word) => `${lang}__${wordKey(word)}`;

// ── New-card budget (Anki-style) ─────────────────────────────────────────────
// "New" = a word never quizzed (no review doc). We introduce at most N per day so
// new material can't pile up; reviews of already-seen words are never capped.
function getNewPerDay() {
  const v = parseInt(localStorage.getItem("lensNewPerDay"), 10);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_NEW_PER_DAY;
}
export function setNewPerDay(n) {
  const v = Math.max(0, Math.min(50, Math.floor(Number(n) || 0)));
  localStorage.setItem("lensNewPerDay", String(v));
  if (visible) start();
  return v;
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function introducedToday() {
  try {
    const raw = JSON.parse(localStorage.getItem("lensNewIntro") || "{}");
    return raw.date === todayKey() ? (raw.count || 0) : 0;
  } catch { return 0; }
}
function bumpIntroducedToday() {
  localStorage.setItem("lensNewIntro",
    JSON.stringify({ date: todayKey(), count: introducedToday() + 1 }));
}
function newBudgetLeft() { return Math.max(0, getNewPerDay() - introducedToday()); }

export function initQuiz() {
  document.addEventListener("lens:langchange", () => { if (visible) start(); });
  document.addEventListener("lens:romanchange", () => { if (visible) start(); });
  const input = $("#qs-new-per-day");
  if (input) {
    input.value = String(getNewPerDay());
    input.addEventListener("change", () => { input.value = String(setNewPerDay(input.value)); });
  }
}

export function setQuizPhotos(list) {
  photos = list || [];
  if (visible) start();      // live updates while looking at the quiz
}

// Called by app.js when the Quiz tab is shown / hidden.
export function showQuiz(on) {
  visible = on;
  if (on) start();
}

function langs() {
  return {
    home: localStorage.getItem("lensHome") || "en",
    target: localStorage.getItem("lensTarget") || "ko",
  };
}

// Flatten every concept across photos into a recall pool for the current target,
// de-duped by target word (a word that recurs across photos is one quiz item).
// Keeps the source photo so a correct answer can show the image as reinforcement.
function buildPool() {
  const { home, target } = langs();
  const seen = new Set();
  const pool = [];
  for (const p of photos) {
    for (const c of p.concepts || []) {
      const t = c.langs?.[target];
      const h = c.langs?.[home];
      if (!t?.word || !h?.word) continue;       // need both sides to make a question
      const key = t.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        target: t.word, targetReading: t.reading || "", example: t.example || "",
        home: h.word, imageUrl: p.imageUrl || "",
        pos: (c.pos || "").toLowerCase().trim(),
      });
    }
  }
  return { pool, home, target };
}

// Coarse part-of-speech bucket for distractor matching. The vision model emits
// free-text pos ("noun", "verb", "adjective", "adj.", "phrase"…); collapse it so
// "adj" and "adjective" match. Empty/unknown -> "" (matches nothing specific).
function posBucket(pos) {
  if (!pos) return "";
  if (pos.startsWith("noun")) return "noun";
  if (pos.startsWith("verb")) return "verb";
  if (pos.startsWith("adj")) return "adj";
  if (pos.startsWith("adv")) return "adv";
  return pos;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build one MCQ. direction "produce" => answer is the target word; "recognize"
// => answer is the home meaning.
//
// Distractors are CONFUSABLE by construction: same part of speech as the correct
// answer, drawn first. Random distractors (the old behavior) let a noun's decoys
// be a verb + two adjectives — trivially discriminable, which inflates accuracy,
// which makes the SRS space words faster than real retention justifies. We prefer
// same-pos candidates, then backfill from the rest of the pool only if a small
// deck can't field three same-pos decoys (so the quiz never runs short).
function makeQuestion(item, pool, direction) {
  const answerKey = direction === "produce" ? "target" : "home";
  const correct = item[answerKey];
  const used = new Set([correct.toLowerCase()]);
  const bucket = posBucket(item.pos);
  const sameStack = [], otherStack = [];
  for (const o of shuffle(pool.slice())) {
    const v = o[answerKey];
    if (!v || used.has(v.toLowerCase())) continue;
    (bucket && posBucket(o.pos) === bucket ? sameStack : otherStack).push(v);
  }
  const candidates = [];
  for (const v of [...sameStack, ...otherStack]) {   // same-pos first, then fill
    if (used.has(v.toLowerCase())) continue;
    used.add(v.toLowerCase());
    candidates.push(v);
    if (candidates.length >= MAX_OPTIONS - 1) break;
  }
  const options = shuffle([correct, ...candidates]);
  return { item, direction, correct, options };
}

// Select this round's items from the pool: due reviews first (most overdue
// first), then up to the remaining daily budget of brand-new words. `ahead`
// forces a practice round from not-yet-due cards when nothing is actually due
// (so the app is never a dead end for a single learner between review windows).
function selectItems(pool, target, ahead) {
  const now = Date.now();
  const dueList = [], newList = [], aheadList = [];
  for (const it of pool) {
    const st = reviewState.get(rk(target, it.target));
    if (!st || !st.seen) { newList.push(it); continue; }        // never quizzed = new
    const state = (st.due == null && st.interval == null)       // legacy doc: seed once
      ? seedState(st.seen, st.correct, now) : st;
    if (isDue(state, now)) dueList.push({ it, over: overdueBy(state, now) });
    else aheadList.push({ it, due: state.due });
  }
  dueList.sort((a, b) => b.over - a.over);                      // most overdue first
  aheadList.sort((a, b) => a.due - b.due);                      // soonest-due first
  const items = dueList.map((x) => x.it);
  const budget = newBudgetLeft();
  const news = shuffle(newList).slice(0, budget).map((it) => ({ ...it, isNew: true }));
  let chosen = [...items, ...news];
  if (!chosen.length && ahead) chosen = aheadList.map((x) => x.it);   // study-ahead
  return {
    chosen: shuffle(chosen).slice(0, ROUND_MAX),
    dueCount: dueList.length, newAvail: newList.length,
    newBudget: budget, aheadCount: aheadList.length,
  };
}

function buildRound(ahead) {
  const { pool, home, target } = buildPool();
  const sel = selectItems(pool, target, ahead);
  return {
    home, target, poolSize: pool.length,
    dueCount: sel.dueCount, newAvail: sel.newAvail,
    newBudget: sel.newBudget, aheadCount: sel.aheadCount,
    questions: sel.chosen.map((it) => ({
      ...makeQuestion(it, pool, Math.random() < 0.5 ? "produce" : "recognize"),
      isNew: !!it.isNew,
    })),
  };
}

// Refresh the "N of M new words today" line under Quiz settings.
function updateSettingsStatus() {
  const el = $("#qs-new-status");
  if (!el) return;
  const per = getNewPerDay();
  const used = introducedToday();
  el.textContent = per === 0
    ? "New words are turned off — reviews only."
    : `${used} of ${per} new words introduced today.`;
}

function start(ahead) {
  const built = buildRound(ahead);
  const stage = $("#quiz");
  updateSettingsStatus();
  if (!stage) return;

  if (built.poolSize < 2) {
    stage.innerHTML = `<p class="empty">Not enough words to quiz yet. Capture a few more photos — once you have a handful of words in <strong>${esc(LANG[built.target].name)}</strong>, the quiz fills in.</p>`;
    return;
  }
  // Nothing due and no new-word budget left: caught up for today. Offer an
  // optional study-ahead round instead of a dead end.
  if (!built.questions.length) {
    const canAhead = built.aheadCount > 0;
    const budgetNote = built.newAvail > 0 && built.newBudget === 0
      ? ` You've hit today's new-word limit (${built.newAvail} more waiting) — raise it in Quiz settings if you want more.`
      : "";
    stage.innerHTML = `
      <div class="quiz-results">
        <p class="quiz-score-big">✓</p>
        <p class="quiz-results-note">Nothing due right now — you're caught up.${esc(budgetNote)}</p>
        ${canAhead ? `<button class="quiz-ahead">Study ahead anyway</button>` : ""}
      </div>`;
    stage.querySelector(".quiz-ahead")?.addEventListener("click", () => start(true));
    return;
  }
  round = built.questions;
  roundHome = built.home; roundTarget = built.target;
  qi = 0; score = 0; answered = false;
  renderQuestion();
}

function renderQuestion() {
  const stage = $("#quiz");
  if (!stage) return;
  const q = round[qi];
  answered = false;

  // produce: prompt with the meaning (+ photo); recognize: prompt with the word,
  // photo withheld until the reveal (it would give the meaning away).
  const promptText = q.direction === "produce" ? q.item.home : q.item.target;
  const promptLang = q.direction === "produce" ? roundHome : roundTarget;
  const showPhotoNow = q.direction === "produce" && q.item.imageUrl;
  const askLabel = q.direction === "produce"
    ? `Which is this in ${esc(LANG[roundTarget].name)}?`
    : `What does this mean?`;

  const photo = showPhotoNow
    ? `<div class="quiz-photo-wrap"><img class="quiz-photo" src="${esc(q.item.imageUrl)}" alt="" /></div>` : "";

  const opts = q.options.map((o) =>
    `<button class="quiz-opt" data-val="${esc(o)}">${esc(o)}</button>`).join("");

  stage.innerHTML = `
    <div class="quiz-head">
      <span class="quiz-progress">${qi + 1} / ${round.length}</span>
      <span class="quiz-score">Score ${score}</span>
    </div>
    ${photo}
    <p class="quiz-ask">${askLabel}</p>
    <p class="quiz-prompt">
      <span class="quiz-prompt-text">${esc(promptText)}</span>
      <button class="tts quiz-prompt-tts" data-text="${esc(promptText)}" data-lang="${promptLang}" aria-label="Speak">🔊</button>
    </p>
    <div class="quiz-options">${opts}</div>
    <div class="quiz-feedback" hidden></div>
    <button class="quiz-next" hidden>Next →</button>`;

  // Speaking the target prompt aloud is a hint we don't want to auto-fire; the
  // learner taps it. (Only meaningful when the prompt is in a spoken script.)
  stage.querySelectorAll(".tts").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); speakFromButton(b); }));

  stage.querySelectorAll(".quiz-opt").forEach((b) =>
    b.addEventListener("click", () => choose(b, q)));
}

async function choose(btn, q) {
  if (answered) return;
  answered = true;
  const picked = btn.dataset.val;
  const correct = picked === q.correct;
  if (correct) score++;

  const stage = $("#quiz");
  stage.querySelectorAll(".quiz-opt").forEach((b) => {
    b.disabled = true;
    if (b.dataset.val === q.correct) b.classList.add("right");
    else if (b === btn) b.classList.add("wrong");
  });

  // Advance the SRS schedule for this word, update the in-memory store so a live
  // rebuild sees fresh state, and persist it. Always keyed by the target word +
  // target lang, regardless of which direction this question ran, so the store is
  // stable. A new word answered for the first time counts against today's budget.
  const key = rk(roundTarget, q.item.target);
  const prior = reviewState.get(key);
  const priorState = (prior && prior.due == null && prior.interval == null)
    ? seedState(prior.seen, prior.correct, Date.now()) : prior;   // seed legacy once
  const srs = schedule(priorState, correct, Date.now());
  reviewState.set(key, {
    seen: (prior?.seen || 0) + 1,
    correct: (prior?.correct || 0) + (correct ? 1 : 0),
    ...srs,
  });
  if (q.isNew) { bumpIntroducedToday(); updateSettingsStatus(); }

  if (reviewHandler) {
    reviewHandler(roundTarget, q.item.target, correct, {
      reading: q.item.targetReading, meaning: q.item.home, srs,
    }).catch((e) => console.warn("review write failed", e));
  }

  // Reinforce: the word both ways, its reading + example, the photo, and TTS.
  const fb = stage.querySelector(".quiz-feedback");
  const reading = (q.item.targetReading && showRoman(roundTarget)) ? ` · ${esc(q.item.targetReading)}` : "";
  const example = q.item.example ? `<p class="quiz-example">${esc(q.item.example)}</p>` : "";
  const photoBack = q.item.imageUrl
    ? `<img class="quiz-photo-small" src="${esc(q.item.imageUrl)}" alt="" />` : "";
  fb.innerHTML = `
    <p class="quiz-verdict ${correct ? "ok" : "no"}">${correct ? "✓ Correct" : "✗ Not quite"}</p>
    <div class="quiz-answer">
      ${photoBack}
      <div class="quiz-answer-text">
        <span class="quiz-answer-word">${esc(q.item.target)}<span class="quiz-answer-reading">${reading}</span></span>
        <span class="quiz-answer-meaning">${esc(q.item.home)}</span>
        ${example}
      </div>
      <button class="tts" data-text="${esc(q.item.target)}" data-lang="${roundTarget}" aria-label="Speak">🔊</button>
    </div>`;
  fb.hidden = false;
  fb.querySelector(".tts").addEventListener("click", (e) => { e.stopPropagation(); speakFromButton(e.currentTarget); });
  speak(q.item.target, roundTarget);   // hear the right answer immediately

  const next = stage.querySelector(".quiz-next");
  next.hidden = false;
  next.textContent = qi + 1 < round.length ? "Next →" : "See results →";
  next.addEventListener("click", () => {
    if (qi + 1 < round.length) { qi++; renderQuestion(); }
    else renderResults();
  }, { once: true });
}

function renderResults() {
  const stage = $("#quiz");
  const total = round.length;
  const pct = Math.round((score / total) * 100);
  const note =
    pct >= 90 ? "Dialed in." :
    pct >= 70 ? "Solid — a few to firm up." :
    pct >= 40 ? "Good reps. These stick with repetition." :
                "Early days with these words. Run it again.";
  stage.innerHTML = `
    <div class="quiz-results">
      <p class="quiz-score-big">${score} / ${total}</p>
      <p class="quiz-score-pct">${pct}%</p>
      <p class="quiz-results-note">${esc(note)}</p>
      <button class="quiz-again">Quiz again</button>
    </div>`;
  stage.querySelector(".quiz-again").addEventListener("click", () => start());
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Click Target mode — tap the object the target word names.
 *
 * Ported from v1's click-target quiz (the single most effective vocab drill in
 * Lens): you HEAR/READ the word in the language you're learning, then find the
 * real thing in your OWN photo — meaning binds to the image, not to a translation.
 *
 * The boxes come from the Cloud Function's grounding pass (a `bbox` array PARALLEL
 * to `concepts`, percentages 0-100, v1's exact {x1,y1,x2,y2} shape). A concept with
 * no confident box produces no challenge — precision over recall, so a tap-target
 * is never wrong.
 *
 * Language pair is the SAME lensHome/lensTarget the study pickers own; we re-read
 * it on every build and rebuild on the `lens:langchange` broadcast.
 */
import { speak, speakFromButton } from "./study.js";
import { showRoman } from "./roman.js";

const HIT_PAD = 3;   // percent of forgiveness around a box so a near-tap still counts

let photos = [];
let visible = false;

let challenges = [];   // {photo, word, hotspot}
let ci = 0;
let score = 0;
let home = "en";
let target = "ko";
let answered = false;

const $ = (s) => document.querySelector(s);

export function initClickTarget() {
  document.addEventListener("lens:langchange", () => { if (visible) start(); });
  document.addEventListener("lens:romanchange", () => { if (visible) start(); });
}

export function setClickTargetPhotos(list) {
  photos = list || [];
  if (visible) start();      // live updates while looking at the mode
}

// Called by app.js when the Click tab is shown / hidden.
export function showClickTarget(on) {
  visible = on;
  if (on) start();
}

function langs() {
  return {
    home: localStorage.getItem("lensHome") || "en",
    target: localStorage.getItem("lensTarget") || "ko",
  };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// One challenge per concept that has a box: {photo, word, hotspot}. hotspot is
// the [{x1,y1,x2,y2}] list of boxes. The parallel bbox array stores each concept's
// boxes wrapped as {boxes:[...]} (Firestore forbids nested arrays), or null. Photos
// with no bbox (legacy captures) contribute nothing and just stay flashcards.
function buildChallenges() {
  const list = [];
  photos.forEach((photo, pIdx) => {
    const boxes = photo.bbox || [];
    boxes.forEach((b, wIdx) => {
      const hotspot = b && b.boxes;
      if (Array.isArray(hotspot) && hotspot.length) list.push({ photo: pIdx, word: wIdx, hotspot });
    });
  });
  return list;
}

function concept(ch) {
  return (photos[ch.photo]?.concepts || [])[ch.word] || null;
}

function start() {
  const stage = $("#clicktarget");
  if (!stage) return;
  const lp = langs();
  home = lp.home; target = lp.target;

  challenges = shuffle(buildChallenges());
  ci = 0; score = 0; answered = false;

  if (!challenges.length) {
    stage.innerHTML = `<p class="empty">No tap-targets yet. Click Target lights up once you've captured photos with clear, pointable objects — take a few and they'll appear here.</p>`;
    return;
  }
  renderChallenge();
}

function renderChallenge() {
  const stage = $("#clicktarget");
  if (!stage) return;
  const ch = challenges[ci];
  const c = concept(ch);
  if (!c) { advance(); return; }   // concept vanished (deleted photo) — skip
  answered = false;

  const t = c.langs?.[target] || {};
  const reading = (t.reading && showRoman(target)) ? ` · ${esc(t.reading)}` : "";
  const imageUrl = photos[ch.photo]?.imageUrl || "";

  stage.innerHTML = `
    <div class="ct-head">
      <span class="ct-progress">${ci + 1} / ${challenges.length}</span>
      <span class="ct-score">Score ${score}</span>
    </div>
    <p class="ct-find">
      <span class="ct-find-label">Tap the</span>
      <span class="ct-word">${esc(t.word || "")}<span class="ct-reading">${reading}</span></span>
      <button class="tts ct-tts" data-text="${esc(t.word || "")}" data-lang="${target}" aria-label="Speak">🔊</button>
    </p>
    <div class="ct-wrap" id="ct-wrap">
      <img class="ct-photo" id="ct-photo" src="${esc(imageUrl)}" alt="" />
    </div>
    <div class="ct-feedback" hidden></div>
    <button class="ct-next" hidden>Next →</button>`;

  stage.querySelector(".ct-tts").addEventListener("click", (e) => { e.stopPropagation(); speakFromButton(e.currentTarget); });
  stage.querySelector("#ct-wrap").addEventListener("click", (e) => onTap(e, ch, c));
}

function onTap(e, ch, c) {
  if (answered) return;
  answered = true;
  const wrap = $("#ct-wrap");
  const img = $("#ct-photo");
  const rect = img.getBoundingClientRect();
  const xPct = (e.clientX - rect.left) / rect.width * 100;
  const yPct = (e.clientY - rect.top) / rect.height * 100;
  // Padded axis-aligned hit-test so a near-miss on a small object still counts.
  const hit = ch.hotspot.some((hs) =>
    xPct >= hs.x1 - HIT_PAD && xPct <= hs.x2 + HIT_PAD &&
    yPct >= hs.y1 - HIT_PAD && yPct <= hs.y2 + HIT_PAD);
  wrap.style.cursor = "default";

  // The dot where they tapped (green hit / red miss)…
  const dot = document.createElement("div");
  dot.className = "click-dot " + (hit ? "hit" : "miss");
  dot.style.left = xPct + "%"; dot.style.top = yPct + "%";
  wrap.appendChild(dot);

  // …and the correct box(es) fading in so a miss still teaches WHERE it was.
  ch.hotspot.forEach((hs) => {
    const box = document.createElement("div");
    box.className = "hotspot-box";
    box.style.left = hs.x1 + "%"; box.style.top = hs.y1 + "%";
    box.style.width = (hs.x2 - hs.x1) + "%"; box.style.height = (hs.y2 - hs.y1) + "%";
    wrap.appendChild(box);
    requestAnimationFrame(() => box.classList.add("show"));
  });

  if (hit) score++;
  const t = c.langs?.[target] || {};
  const h = c.langs?.[home] || {};
  const fb = $(".ct-feedback");
  fb.innerHTML = `
    <p class="ct-verdict ${hit ? "ok" : "no"}">${hit ? "✓ Yes" : "✗ Not there"}</p>
    <p class="ct-answer">
      <span class="ct-answer-word">${esc(t.word || "")}</span>
      <span class="ct-answer-meaning">${esc(h.word || "")}</span>
      <button class="tts" data-text="${esc(t.word || "")}" data-lang="${target}" aria-label="Speak">🔊</button>
    </p>`;
  fb.hidden = false;
  fb.querySelector(".tts").addEventListener("click", (ev) => { ev.stopPropagation(); speakFromButton(ev.currentTarget); });
  if (t.word) speak(t.word, target);   // hear the word immediately as reinforcement

  const next = $(".ct-next");
  next.hidden = false;
  next.textContent = ci + 1 < challenges.length ? "Next →" : "See results →";
  next.addEventListener("click", advance, { once: true });
}

function advance() {
  if (ci + 1 < challenges.length) { ci++; renderChallenge(); }
  else renderResults();
}

function renderResults() {
  const stage = $("#clicktarget");
  if (!stage) return;
  const total = challenges.length;
  const pct = Math.round((score / total) * 100);
  const note =
    pct >= 90 ? "Sharp eye." :
    pct >= 70 ? "Solid — a few to firm up." :
    pct >= 40 ? "Good reps. These bind with repetition." :
                "Early days with these. Run it again.";
  stage.innerHTML = `
    <div class="ct-results">
      <p class="ct-score-big">${score} / ${total}</p>
      <p class="ct-score-pct">${pct}%</p>
      <p class="ct-results-note">${esc(note)}</p>
      <button class="ct-again">Play again</button>
    </div>`;
  stage.querySelector(".ct-again").addEventListener("click", start);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

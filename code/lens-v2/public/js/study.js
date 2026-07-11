/**
 * Study mode — transplanted from v1's Random flip-card deck.
 *
 * v1 parity carried over: seven-language any-to-any (pick "I speak" + "I'm
 * learning"), flip cards (target word front, home meaning + example back),
 * Web Speech TTS. (Click Target / Word Hunt / Gallery ride on bbox data, which
 * is a v2.x add — today's endpoint is "review it in a study mode", and Random
 * is that mode.)
 */

import { speak as ttsSpeak, noVoiceHint } from "./tts.js";
import { showRoman, hasRomanToggle, toggleRoman, setRoman } from "./roman.js";

// Shared with quiz.js so the two modes never drift on language names / TTS codes.
export const LANG = {
  en: { name: "English",  tts: "en-US" },
  ko: { name: "한국어",    tts: "ko-KR" },
  ja: { name: "日本語",    tts: "ja-JP" },
  es: { name: "Español",  tts: "es-ES" },
  fr: { name: "Français", tts: "fr-FR" },
  zh: { name: "中文",      tts: "zh-CN" },
  eu: { name: "Euskara",  tts: "eu-ES" },
};
export const ORDER = ["en", "ko", "ja", "es", "fr", "zh", "eu"];

let photos = [];
let idx = 0;
let home = localStorage.getItem("lensHome") || "en";
let target = localStorage.getItem("lensTarget") || "ko";
let deleteHandler = null;   // set by app.js: (photoId, imagePath) => Promise

const $ = (s) => document.querySelector(s);

// app.js owns the actual Firestore/Storage delete; study.js just calls back.
export function setDeleteHandler(fn) { deleteHandler = fn; }

export function initStudy() {
  buildPickers();
  wireRomanToggle();
  $("#prev").addEventListener("click", () => move(-1));
  $("#next").addEventListener("click", () => move(1));
  document.addEventListener("keydown", (e) => {
    if ($("#main-view").hidden) return;
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });
  render();
}

function buildPickers() {
  const fill = (sel, val) => {
    sel.innerHTML = "";
    for (const code of ORDER) {
      const o = document.createElement("option");
      o.value = code; o.textContent = LANG[code].name;
      if (code === val) o.selected = true;
      sel.appendChild(o);
    }
  };
  fill($("#home-lang"), home);
  fill($("#target-lang"), target);
  $("#home-lang").addEventListener("change", (e) => { home = guard(e.target.value, target); persist(); buildPickers(); render(); broadcastLangChange(); });
  $("#target-lang").addEventListener("change", (e) => { target = guard2(e.target.value, home); persist(); buildPickers(); syncRomanToggle(); render(); broadcastLangChange(); });
}

// The romanization on/off switch. Only Korean (romanized Hangul) and Japanese
// (rōmaji) carry a Latin reading worth hiding, so the control shows only when the
// language being learned is one of those. The flag is per-language and remembered
// (see roman.js), so flipping to the other script restores its own last setting.
function wireRomanToggle() {
  const box = $("#roman-toggle");
  if (!box) return;
  box.addEventListener("change", (e) => {
    setRoman(target, e.target.checked);   // fires lens:romanchange for other modes
    render();                             // repaint the cards immediately
  });
  syncRomanToggle();
}

function syncRomanToggle() {
  const wrap = $("#roman-toggle-wrap");
  const box = $("#roman-toggle");
  const label = $("#roman-toggle-label");
  if (!wrap || !box) return;
  const show = hasRomanToggle(target);
  wrap.hidden = !show;
  if (!show) return;
  box.checked = showRoman(target);
  if (label) label.textContent = `${LANG[target].name} romanization`;
}
// Let quiz.js (or any other mode) re-read lensHome/lensTarget and rebuild.
function broadcastLangChange() {
  document.dispatchEvent(new CustomEvent("lens:langchange", { detail: { home, target } }));
}
function guard(newHome, t) { return newHome === t ? home : newHome; }   // home can't equal target
function guard2(newTarget, h) { return newTarget === h ? target : newTarget; }
function persist() { localStorage.setItem("lensHome", home); localStorage.setItem("lensTarget", target); }

export function setStudyPhotos(list) {
  photos = list || [];
  if (idx >= photos.length) idx = 0;
  render();
}

function move(d) {
  if (!photos.length) return;
  idx = (idx + d + photos.length) % photos.length;
  render();
}

// Returns the tts.js status promise ("ok" | "no-voice" | ...) so callers can
// surface a hint when the device has no voice for the language.
export function speak(text, code) {
  return ttsSpeak(text, LANG[code]?.tts || "en-US");
}

// Speak from a 🔊 button and, if the device can't pronounce that language,
// flash a hint next to the button instead of failing silently.
export async function speakFromButton(btn) {
  const status = await speak(btn.dataset.text, btn.dataset.lang);
  if (status === "no-voice") noVoiceHint(btn);
}

function render() {
  const stage = $("#deck");
  if (!stage) return;
  if (!photos.length) {
    stage.innerHTML = `<p class="empty">No vocabulary yet. Take a photo to get started — words appear here once they're processed.</p>`;
    $("#deck-meta").textContent = "";
    return;
  }
  const p = photos[idx];
  $("#deck-meta").textContent = `${idx + 1} / ${photos.length}`;

  const cards = (p.concepts || []).map((c) => {
    const t = c.langs?.[target] || {};
    const h = c.langs?.[home] || {};
    const tReading = (t.reading && showRoman(target)) ? ` · ${t.reading}` : "";
    // Card back gets its own speaker buttons (Yuria's 2026-07-02 request): the
    // translation reads in the learner's home language, the example in the
    // language being learned. Each renders only when there's text to speak.
    const meaningTts = h.word
      ? `<button class="tts" data-text="${esc(h.word)}" data-lang="${home}" aria-label="Speak translation">🔊</button>`
      : "";
    const exampleTts = t.example
      ? `<button class="tts" data-text="${esc(t.example)}" data-lang="${target}" aria-label="Speak example">🔊</button>`
      : "";
    return `
      <div class="card" tabindex="0">
        <div class="card-inner">
          <div class="card-front">
            <span class="word">${esc(t.word || "")}</span>
            <span class="reading">${esc(tReading)}</span>
            <button class="tts" data-text="${esc(t.word || "")}" data-lang="${target}" aria-label="Speak">🔊</button>
          </div>
          <div class="card-back">
            <span class="meaning">${esc(h.word || "")}</span>
            ${meaningTts}
            <span class="example">${esc(t.example || "")}</span>
            ${exampleTts}
          </div>
        </div>
      </div>`;
  }).join("");

  const photo = p.imageUrl
    ? `<div class="study-photo-wrap"><img class="study-photo" src="${esc(p.imageUrl)}" alt="" />${sceneCaption(p)}</div>`
    : "";
  const del = `<button class="photo-delete" data-id="${esc(p.id)}" data-path="${esc(p.imagePath || "")}" title="Delete this photo" aria-label="Delete this photo">🗑 Delete photo</button>`;
  stage.innerHTML = `${photo}<div class="cards">${cards}</div>${grammarBlock(p)}${del}`;

  const delBtn = stage.querySelector(".photo-delete");
  if (delBtn) {
    let armed = false;
    delBtn.addEventListener("click", async () => {
      if (!deleteHandler) return;
      if (!armed) { armed = true; delBtn.textContent = "Tap again to delete"; delBtn.classList.add("armed");
        setTimeout(() => { armed = false; delBtn.textContent = "🗑 Delete photo"; delBtn.classList.remove("armed"); }, 3000); return; }
      delBtn.disabled = true; delBtn.textContent = "Deleting…";
      try { await deleteHandler(delBtn.dataset.id, delBtn.dataset.path); } // onSnapshot re-renders
      catch (e) { console.error(e); delBtn.disabled = false; delBtn.textContent = "🗑 Delete photo"; }
    });
  }

  stage.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".tts")) return;
      card.classList.toggle("flipped");
    });
  });
  stage.querySelectorAll(".tts").forEach((b) => {
    b.addEventListener("click", (e) => { e.stopPropagation(); speakFromButton(b); });
  });

  wireSceneCaption(stage);
}

// The one-sentence caption over the photo, shown in the language being learned
// (target) with a TTS button. Tapping the sentence flips it to the learner's
// mother tongue (home) and back. Falls back to the legacy English-only `scene`
// for photos processed before scene_langs existed.
function sceneCaption(p) {
  const sl = p.scene_langs || {};
  const tText = (sl[target] && sl[target].text) || (target === "en" ? p.scene : "") || "";
  const hText = (sl[home] && sl[home].text)     || (home   === "en" ? p.scene : "") || "";
  if (!tText && !hText) return "";
  const startTarget = !!tText;                 // prefer showing the target language
  const text = startTarget ? tText : hText;
  const lang = startTarget ? target : home;
  const flippable = !!(tText && hText && tText !== hText);
  return `
    <div class="scene-caption${flippable ? " flippable" : ""}"
         data-target-text="${esc(tText)}" data-target-lang="${target}"
         data-home-text="${esc(hText)}" data-home-lang="${home}"
         data-showing="${startTarget ? "target" : "home"}">
      <span class="scene-text" ${flippable ? 'role="button" tabindex="0" title="Tap to translate"' : ""}>${esc(text)}</span>
      <button class="tts scene-tts" data-text="${esc(text)}" data-lang="${lang}" aria-label="Speak the sentence">🔊</button>
    </div>`;
}

function wireSceneCaption(stage) {
  const cap = stage.querySelector(".scene-caption.flippable");
  if (!cap) return;
  const txt = cap.querySelector(".scene-text");
  const tts = cap.querySelector(".scene-tts");
  const flip = () => {
    const toHome = cap.dataset.showing === "target";
    const text = toHome ? cap.dataset.homeText : cap.dataset.targetText;
    const lang = toHome ? cap.dataset.homeLang : cap.dataset.targetLang;
    if (!text) return;                         // nothing to flip to
    cap.dataset.showing = toHome ? "home" : "target";
    txt.textContent = text;
    tts.dataset.text = text;
    tts.dataset.lang = lang;
    cap.classList.toggle("translated", toHome);
  };
  txt.addEventListener("click", flip);
  txt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
  });
}

// Grammar from this photo, filtered to the language being learned (target). Each
// row shows the point + CEFR, the native sentence with its structure emphasized,
// a TTS button, and — for photos processed after 2026-07-01 — beginner scaffolds
// so an undecodeable native sentence actually teaches: a literal gloss of the
// highlighted chunk, a plain "what it does" clause, and the full meaning behind a
// reveal (kept collapsed so the native sentence stays reading practice first).
// Every scaffold renders only if its field exists, so legacy photos degrade to
// exactly the old card. Hidden entirely if the photo has no grammar for the target.
function grammarBlock(p) {
  const rows = (p.grammar || []).filter((g) => g.lang === target);
  if (!rows.length) return "";
  const items = rows.map((g) => {
    const sentence = highlightStructure(g.sentence || "", g.highlight || "");
    // Bottom-up: what the bolded piece literally is.
    const chunk = (g.highlight && g.chunk_gloss)
      ? `<p class="gram-gloss"><span class="gram-gloss-chunk">${esc(g.highlight)}</span> — ${esc(g.chunk_gloss)}</p>`
      : "";
    // The teaching line: what that structure does, in plain words (dominant text).
    const does = g.does ? `<p class="gram-does">${esc(g.does)}</p>` : "";
    // Whole-sentence meaning, collapsed so reading comes first. <details> = no JS.
    const trans = g.translation
      ? `<details class="gram-trans"><summary>Meaning</summary><p>${esc(g.translation)}</p></details>`
      : "";
    return `
      <div class="gram-item">
        <div class="gram-head">
          <span class="gram-point">${esc(g.point || "")}</span>
          <span class="gram-cefr">${esc(g.cefr || "")}</span>
        </div>
        <div class="gram-row">
          <span class="gram-sentence">${sentence}</span>
          <button class="tts" data-text="${esc(g.sentence || "")}" data-lang="${target}" aria-label="Speak">🔊</button>
        </div>
        ${chunk}
        ${does}
        ${trans}
      </div>`;
  }).join("");
  return `<div class="grammar"><h3 class="grammar-title">Grammar from this photo — ${esc(LANG[target].name)}</h3>${items}</div>`;
}

// Bold the exact highlight substring inside the sentence. Escapes both, then
// wraps the first occurrence; falls back to the plain sentence if no match.
function highlightStructure(sentence, highlight) {
  const s = esc(sentence);
  if (!highlight) return s;
  const h = esc(highlight);
  const at = s.indexOf(h);
  if (at < 0) return s;
  return s.slice(0, at) + `<mark class="gram-mark">${h}</mark>` + s.slice(at + h.length);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

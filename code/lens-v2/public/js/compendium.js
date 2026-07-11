/**
 * Language Compendium — the admin-only viewer.
 *
 * The compendium is a shared, de-duped, ANONYMOUS pool of every user's generated
 * vocabulary + grammar (never their photos), banked by the Cloud Function into
 * two top-level collections: `compendium_words` and `compendium_grammar`.
 *
 * This module renders a browsable dictionary of that pool for the admin (Kramer).
 * Non-admins never see the toggle and — because the Firestore rules gate reads to
 * `isAdmin()` — couldn't load it even if they did. Data is lazy-loaded on first
 * open and cached for the session; a Refresh button re-pulls.
 */
import {
  collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ADMIN_EMAILS } from "./config.js";
import { speak as ttsSpeak, noVoiceHint } from "./tts.js";
import { showRoman } from "./roman.js";

const $ = (s) => document.querySelector(s);

const LANG = {
  en: { name: "English",  tts: "en-US" },
  ko: { name: "한국어",    tts: "ko-KR" },
  ja: { name: "日本語",    tts: "ja-JP" },
  es: { name: "Español",  tts: "es-ES" },
  fr: { name: "Français", tts: "fr-FR" },
  zh: { name: "中文",      tts: "zh-CN" },
  eu: { name: "Euskara",  tts: "eu-ES" },
};
const ORDER = ["en", "ko", "ja", "es", "fr", "zh", "eu"];
const EXAMPLE_CAP = 8;   // how many example sentences to show per entry.

let db = null;
let loaded = false;       // have we pulled the data this session?
let words = [];           // [{lang, word, reading, pos, seen, examples[]}]
let grammar = [];         // [{lang, id, point, cefr, seen, examples[{sentence,highlight}]}]

// View state
let mode = "words";       // "words" | "grammar"
let langFilter = "all";
let search = "";
let sort = "seen";        // "seen" | "alpha"

export function isAdmin(user) {
  return !!(user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
}

// Called from app.js once an auth state is known. Shows/hides the toggle and,
// for non-admins, makes sure the panel is closed.
export function setupCompendium(database, user) {
  db = database;
  const toggle = $("#compendium-toggle");
  const admin = isAdmin(user);
  if (toggle) toggle.hidden = !admin;
  if (!admin) closePanel();
}

export function initCompendium() {
  const toggle = $("#compendium-toggle");
  if (toggle) toggle.addEventListener("click", openPanel);
  const back = $("#comp-back");
  if (back) back.addEventListener("click", closePanel);
  const refresh = $("#comp-refresh");
  if (refresh) refresh.addEventListener("click", () => load(true));

  // Controls
  $("#comp-mode-words")?.addEventListener("click", () => { mode = "words"; syncModeTabs(); render(); });
  $("#comp-mode-grammar")?.addEventListener("click", () => { mode = "grammar"; syncModeTabs(); render(); });
  $("#comp-lang")?.addEventListener("change", (e) => { langFilter = e.target.value; render(); });
  $("#comp-sort")?.addEventListener("change", (e) => { sort = e.target.value; render(); });
  $("#comp-search")?.addEventListener("input", (e) => { search = e.target.value.trim().toLowerCase(); render(); });

  buildLangFilter();
}

function buildLangFilter() {
  const sel = $("#comp-lang");
  if (!sel) return;
  sel.innerHTML = `<option value="all">All languages</option>` +
    ORDER.map((c) => `<option value="${c}">${LANG[c].name}</option>`).join("");
}

function syncModeTabs() {
  $("#comp-mode-words")?.classList.toggle("active", mode === "words");
  $("#comp-mode-grammar")?.classList.toggle("active", mode === "grammar");
}

function openPanel() {
  $("#study-panel")?.setAttribute("hidden", "");
  $("#compendium-view")?.removeAttribute("hidden");
  syncModeTabs();
  if (!loaded) load(false);
  else render();
}

function closePanel() {
  $("#compendium-view")?.setAttribute("hidden", "");
  $("#study-panel")?.removeAttribute("hidden");
}

async function load(force) {
  if (!db) return;
  if (loaded && !force) return;
  setStatus("Loading the compendium…");
  try {
    const [ws, gs] = await Promise.all([
      getDocs(collection(db, "compendium_words")),
      getDocs(collection(db, "compendium_grammar")),
    ]);
    words = [];
    ws.forEach((d) => {
      const x = d.data();
      words.push({
        lang: x.lang, word: x.word || "", reading: x.reading || "",
        pos: x.pos || "", seen: x.seen || 0,
        examples: Array.isArray(x.examples) ? x.examples : [],
      });
    });
    grammar = [];
    gs.forEach((d) => {
      const x = d.data();
      grammar.push({
        lang: x.lang, id: x.id || "", point: x.point || "", cefr: x.cefr || "",
        seen: x.seen || 0,
        examples: Array.isArray(x.examples) ? x.examples : [],
      });
    });
    loaded = true;
    render();
  } catch (e) {
    console.error("compendium load:", e);
    setStatus(`Couldn't load the compendium (${e.code || e.message}).`);
  }
}

function setStatus(msg) {
  const list = $("#comp-list");
  if (list) list.innerHTML = `<p class="comp-empty">${esc(msg)}</p>`;
}

function filtered() {
  const rows = mode === "words" ? words : grammar;
  let out = rows.filter((r) => langFilter === "all" || r.lang === langFilter);
  if (search) {
    out = out.filter((r) => {
      const hay = mode === "words"
        ? `${r.word} ${r.reading} ${r.pos} ${r.examples.join(" ")}`
        : `${r.id} ${r.point} ${r.cefr} ${r.examples.map((e) => e.sentence).join(" ")}`;
      return hay.toLowerCase().includes(search);
    });
  }
  out.sort((a, b) => {
    if (sort === "alpha") {
      const ka = mode === "words" ? a.word : a.point;
      const kb = mode === "words" ? b.word : b.point;
      return String(ka).localeCompare(String(kb));
    }
    return (b.seen || 0) - (a.seen || 0);   // most-seen first
  });
  return out;
}

function render() {
  const list = $("#comp-list");
  if (!list) return;
  const rows = filtered();

  // Summary line: totals + how much the current filter is showing.
  const totalW = words.length, totalG = grammar.length;
  $("#comp-summary").textContent =
    `${totalW} words · ${totalG} grammar points pooled` +
    (rows.length !== (mode === "words" ? totalW : totalG) ? ` · showing ${rows.length}` : "");

  if (!rows.length) {
    list.innerHTML = `<p class="comp-empty">${loaded
      ? "Nothing matches yet. As friends take photos, their words and grammar collect here."
      : "Loading…"}</p>`;
    return;
  }

  list.innerHTML = rows.map((r) => mode === "words" ? wordRow(r) : grammarRow(r)).join("");

  list.querySelectorAll(".tts").forEach((b) => {
    b.addEventListener("click", async () => {
      if (await speak(b.dataset.text, b.dataset.lang) === "no-voice") noVoiceHint(b);
    });
  });
}

function wordRow(r) {
  const reading = (r.reading && showRoman(r.lang)) ? ` · <span class="comp-reading">${esc(r.reading)}</span>` : "";
  const ex = r.examples.slice(0, EXAMPLE_CAP).map((e) => `<li>${esc(e)}</li>`).join("");
  const more = r.examples.length > EXAMPLE_CAP ? `<li class="comp-more">+${r.examples.length - EXAMPLE_CAP} more</li>` : "";
  return `
    <div class="comp-card">
      <div class="comp-head">
        <span class="comp-lang-chip">${esc(LANG[r.lang]?.name || r.lang)}</span>
        <span class="comp-word">${esc(r.word)}</span>${reading}
        <button class="tts" data-text="${esc(r.word)}" data-lang="${esc(r.lang)}" aria-label="Speak">🔊</button>
        ${r.pos ? `<span class="comp-pos">${esc(r.pos)}</span>` : ""}
        <span class="comp-seen" title="times this word appeared">×${r.seen}</span>
      </div>
      ${ex ? `<ul class="comp-examples">${ex}${more}</ul>` : ""}
    </div>`;
}

function grammarRow(r) {
  const ex = r.examples.slice(0, EXAMPLE_CAP).map((e) => {
    const s = esc(e.sentence || "");
    const h = (e.highlight || "").trim();
    const marked = h && s.includes(esc(h)) ? s.replace(esc(h), `<mark>${esc(h)}</mark>`) : s;
    return `<li>${marked} <button class="tts" data-text="${esc(e.sentence || "")}" data-lang="${esc(r.lang)}" aria-label="Speak">🔊</button></li>`;
  }).join("");
  const more = r.examples.length > EXAMPLE_CAP ? `<li class="comp-more">+${r.examples.length - EXAMPLE_CAP} more</li>` : "";
  return `
    <div class="comp-card">
      <div class="comp-head">
        <span class="comp-lang-chip">${esc(LANG[r.lang]?.name || r.lang)}</span>
        <span class="comp-word">${esc(r.point)}</span>
        <span class="comp-pos">${esc(r.cefr)}</span>
        <span class="comp-id">${esc(r.id)}</span>
        <span class="comp-seen" title="times this point appeared">×${r.seen}</span>
      </div>
      ${ex ? `<ul class="comp-examples">${ex}${more}</ul>` : ""}
    </div>`;
}

function speak(text, code) {
  return ttsSpeak(text, LANG[code]?.tts || "en-US");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

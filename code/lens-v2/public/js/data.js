/**
 * Data panel — your own progress, at a glance.
 *
 * Three headline numbers (photos collected, words collected, quiz accuracy) plus
 * two over-time growth charts (photos/day and words/day, cumulative). Unlike the
 * Compendium, this is per-user and visible to everyone: it reads only the signed-in
 * user's own `photos` (live, fed from app.js) and `reviews` (the quiz grade store,
 * pulled on open). No chart library — bars are plain divs to keep the static site
 * build-free.
 */
import {
  collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LANG, ORDER, speakFromButton } from "./study.js";
import { showRoman } from "./roman.js";
import { wordKey, meaningLangFor, masteryOf, MASTERY_LABEL, MASTERY_RANK } from "./vocab.js";

const $ = (s) => document.querySelector(s);

let db = null;
let user = null;
let photos = [];          // live "done" photos for the current user (from app.js)
let reviews = [];         // [{seen, correct}] pulled from users/{uid}/reviews on open
let reviewMap = new Map();// `${lang}__${wordkey}` -> {seen, correct, lastResult} for the ledger join
let reviewsLoaded = false;
let open = false;

// Vocabulary-ledger view state
let dtab = "progress";              // "progress" | "vocab"
let ledgerLang = null;             // defaults to the study target on first open
let ledgerMastery = "all";         // "all" | "learning" | "new" | "known"
let ledgerSort = "weak";           // "weak" | "alpha" | "quizzed" | "new"
let ledgerSearch = "";

// app.js feeds the same "done" photo list it gives Study/Quiz, so the counts and
// charts stay in lockstep with what the user actually sees.
export function setDataPhotos(list) {
  photos = list || [];
  if (open) (dtab === "vocab" ? renderLedger() : render());
}

// Called from app.js on every auth change. Resets review cache when the user flips.
export function setupData(database, currentUser) {
  db = database;
  if (currentUser?.uid !== user?.uid) { reviews = []; reviewsLoaded = false; }
  user = currentUser || null;
  const toggle = $("#data-toggle");
  if (toggle) toggle.hidden = !user;
  if (!user) closePanel();
}

export function initData() {
  $("#data-toggle")?.addEventListener("click", openPanel);
  $("#data-back")?.addEventListener("click", closePanel);
  $("#data-refresh")?.addEventListener("click", () => loadReviews(true));

  // Progress / Vocabulary tabs
  document.querySelectorAll(".data-tab").forEach((t) =>
    t.addEventListener("click", () => setTab(t.dataset.dtab)));

  // Ledger controls
  buildLedgerLangFilter();
  $("#ledger-lang")?.addEventListener("change", (e) => { ledgerLang = e.target.value; renderLedger(); });
  $("#ledger-mastery")?.addEventListener("change", (e) => { ledgerMastery = e.target.value; renderLedger(); });
  $("#ledger-sort")?.addEventListener("change", (e) => { ledgerSort = e.target.value; renderLedger(); });
  $("#ledger-search")?.addEventListener("input", (e) => { ledgerSearch = e.target.value.trim().toLowerCase(); renderLedger(); });

  // Reflect the romanization toggle live if the vocab list is on screen.
  document.addEventListener("lens:romanchange", () => { if (open && dtab === "vocab") renderLedger(); });

  // Markdown takeout
  $("#ledger-export")?.addEventListener("click", openExportDialog);
  $("#export-cancel")?.addEventListener("click", () => $("#export-dialog")?.close());
  $("#export-go")?.addEventListener("click", runExport);
}

function buildLedgerLangFilter() {
  const sel = $("#ledger-lang");
  if (!sel) return;
  sel.innerHTML = ORDER.map((c) => `<option value="${c}">${esc(LANG[c].name)}</option>`).join("");
}

function setTab(which) {
  dtab = which;
  document.querySelectorAll(".data-tab").forEach((t) => t.classList.toggle("active", t.dataset.dtab === which));
  $("#data-progress")?.toggleAttribute("hidden", which !== "progress");
  $("#data-vocab")?.toggleAttribute("hidden", which !== "vocab");
  if (which === "vocab") {
    if (!reviewsLoaded) loadReviews(false);   // accuracy column needs the reviews
    renderLedger();
  } else {
    render();
  }
}

function openPanel() {
  // Make sure no sibling panel is left showing.
  $("#compendium-view")?.setAttribute("hidden", "");
  $("#study-panel")?.setAttribute("hidden", "");
  $("#data-view")?.removeAttribute("hidden");
  open = true;
  // Default the ledger to whatever the learner is currently studying.
  if (!ledgerLang) {
    ledgerLang = localStorage.getItem("lensTarget") || "ko";
    const sel = $("#ledger-lang");
    if (sel) sel.value = ledgerLang;
  }
  render();                         // paint photo-derived numbers immediately
  if (!reviewsLoaded) loadReviews(false);
}

function closePanel() {
  open = false;
  $("#data-view")?.setAttribute("hidden", "");
  $("#study-panel")?.removeAttribute("hidden");
}

async function loadReviews(force) {
  if (!db || !user) return;
  if (reviewsLoaded && !force) return;
  try {
    const snap = await getDocs(collection(db, "users", user.uid, "reviews"));
    reviews = [];
    reviewMap = new Map();
    snap.forEach((d) => {
      const x = d.data();
      const seen = x.seen || 0, correct = x.correct || 0;
      reviews.push({ seen, correct });
      // Key by (lang, word) so the ledger can join each vocab word to its grades.
      if (x.lang && x.word) reviewMap.set(`${x.lang}__${wordKey(x.word)}`, { seen, correct, lastResult: x.lastResult });
    });
    reviewsLoaded = true;
    if (open) (dtab === "vocab" ? renderLedger() : render());
  } catch (e) {
    console.warn("data: reviews load failed", e);
  }
}

// ── Derived stats ────────────────────────────────────────────────────────────
function wordCount(p) {
  // One vocabulary concept = one "word" collected (it's multilingual under the hood).
  return Array.isArray(p.concepts) ? p.concepts.length : 0;
}

function totals() {
  const photoTotal = photos.length;
  const wordTotal = photos.reduce((n, p) => n + wordCount(p), 0);
  let seen = 0, correct = 0;
  for (const r of reviews) { seen += r.seen; correct += r.correct; }
  const accuracy = seen ? Math.round((correct / seen) * 100) : null;
  return { photoTotal, wordTotal, seen, correct, accuracy, wordsQuizzed: reviews.length };
}

// Group photos by calendar day (local) -> { day: "YYYY-MM-DD", photos, words }.
// Returns chronological days that actually have activity.
function byDay() {
  const map = new Map();
  for (const p of photos) {
    const secs = p.createdAt?.seconds;
    if (!secs) continue;
    const d = new Date(secs * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = map.get(key) || { day: key, photos: 0, words: 0 };
    row.photos += 1;
    row.words += wordCount(p);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const wrap = $("#data-body");
  if (!wrap) return;
  const t = totals();

  const acc = t.accuracy == null
    ? `<span class="data-stat-empty">no quizzes yet</span>`
    : `${t.accuracy}<span class="data-unit">%</span>`;

  const stats = `
    <div class="data-stats">
      <div class="data-stat">
        <div class="data-num">${t.photoTotal}</div>
        <div class="data-label">photos collected</div>
      </div>
      <div class="data-stat">
        <div class="data-num">${t.wordTotal}</div>
        <div class="data-label">words collected</div>
      </div>
      <div class="data-stat">
        <div class="data-num">${acc}</div>
        <div class="data-label">quiz accuracy${t.accuracy == null ? "" : ` · ${t.correct}/${t.seen}`}</div>
      </div>
    </div>`;

  const days = byDay();
  const charts = days.length
    ? `${chart("Photos per day", days, "photos")}${chart("Words per day", days, "words")}`
    : `<p class="data-empty">No photos yet. Take a photo and your progress shows up here.</p>`;

  const quizNote = t.wordsQuizzed
    ? `<p class="data-note">${t.wordsQuizzed} word${t.wordsQuizzed === 1 ? "" : "s"} quizzed so far${t.accuracy == null ? "" : `, ${t.correct} correct out of ${t.seen} tries`}.</p>`
    : `<p class="data-note">Try Quiz mode to start tracking your recall accuracy.</p>`;

  wrap.innerHTML = stats + charts + quizNote;
}

// A small bar chart: one bar per active day, height scaled to the busiest day.
// Recent days on the right; only the first/last day get an axis label so it stays
// readable on a phone.
function chart(title, days, field) {
  const max = Math.max(1, ...days.map((d) => d[field]));
  const bars = days.map((d, i) => {
    const h = Math.round((d[field] / max) * 100);
    const edge = i === 0 || i === days.length - 1;
    return `
      <div class="data-bar-col" title="${esc(d.day)} · ${d[field]} ${field}">
        <div class="data-bar" style="height:${h}%"></div>
        <div class="data-bar-axis">${edge ? esc(shortDay(d.day)) : ""}</div>
      </div>`;
  }).join("");
  const total = days.reduce((n, d) => n + d[field], 0);
  return `
    <div class="data-chart">
      <div class="data-chart-head"><span>${esc(title)}</span><span class="data-chart-total">${total} total</span></div>
      <div class="data-bars">${bars}</div>
    </div>`;
}

function shortDay(iso) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// ── Vocabulary Ledger ────────────────────────────────────────────────────────
// A sortable, filterable list of every word the learner has harvested in the
// chosen language, joined to their quiz grades so each word carries a mastery
// state. Built entirely from data already in memory (photos + reviewMap) — no
// Firestore query, no index, no backend. Answers the "see all my vocabulary in a
// sortable list" ask, and doubles as a study list (sort Weakest first).

// Mastery, the meaning-language fallback, and the review-key normalization live
// in vocab.js so the markdown takeout applies the identical rules.

// One row per distinct word in the target language, deduped across photos.
function buildLedgerRows() {
  const tl = ledgerLang;
  const ml = meaningLangFor(tl);
  const byWord = new Map();
  for (const p of photos) {
    const secs = p.createdAt?.seconds || 0;
    for (const c of p.concepts || []) {
      const entry = c.langs?.[tl];
      const word = (entry?.word || "").trim();
      if (!word) continue;
      const key = wordKey(word);
      let row = byWord.get(key);
      if (!row) {
        const review = reviewMap.get(`${tl}__${key}`);
        const seen = review?.seen || 0, correct = review?.correct || 0;
        row = {
          word, key,
          reading: entry.reading || "",
          meaning: (c.langs?.[ml]?.word || "").trim(),
          pos: c.pos || "",
          secs, photoHits: 0,
          seen, correct,
          accuracy: seen ? correct / seen : null,
          mastery: masteryOf(review),
        };
        byWord.set(key, row);
      }
      row.photoHits += 1;
      if (secs > row.secs) row.secs = secs;              // latest sighting = "harvested"
      if (!row.meaning && c.langs?.[ml]?.word) row.meaning = c.langs[ml].word.trim();
    }
  }
  return [...byWord.values()];
}

function ledgerFiltered() {
  let rows = buildLedgerRows();
  if (ledgerMastery !== "all") rows = rows.filter((r) => r.mastery === ledgerMastery);
  if (ledgerSearch) {
    rows = rows.filter((r) =>
      `${r.word} ${r.reading} ${r.meaning}`.toLowerCase().includes(ledgerSearch));
  }
  rows.sort((a, b) => {
    if (ledgerSort === "alpha") return String(a.word).localeCompare(String(b.word));
    if (ledgerSort === "quizzed") return b.seen - a.seen;
    if (ledgerSort === "new") return b.secs - a.secs;
    // "weak": learning first, then new, then known; tiebreak by accuracy then reps.
    const rank = MASTERY_RANK[a.mastery] - MASTERY_RANK[b.mastery];
    if (rank) return rank;
    return (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.seen - a.seen;
  });
  return rows;
}

function renderLedger() {
  const list = $("#ledger-list");
  if (!list) return;
  if (!ledgerLang) ledgerLang = localStorage.getItem("lensTarget") || "ko";

  const all = buildLedgerRows();
  const rows = ledgerFiltered();
  const counts = all.reduce((m, r) => { m[r.mastery]++; return m; }, { learning: 0, new: 0, known: 0 });

  const summ = $("#ledger-summary");
  if (summ) {
    summ.textContent = all.length
      ? `${all.length} word${all.length === 1 ? "" : "s"} in ${LANG[ledgerLang]?.name || ledgerLang} · ` +
        `${counts.learning} learning · ${counts.new} new · ${counts.known} known` +
        (rows.length !== all.length ? ` · showing ${rows.length}` : "")
      : "";
  }

  if (!all.length) {
    list.innerHTML = `<p class="comp-empty">No words in ${esc(LANG[ledgerLang]?.name || ledgerLang)} yet. Take a photo, or switch the language above.</p>`;
    return;
  }
  if (!rows.length) {
    list.innerHTML = `<p class="comp-empty">No words match this filter.</p>`;
    return;
  }

  list.innerHTML = rows.map((r) => ledgerRow(r)).join("");
  list.querySelectorAll(".tts").forEach((b) =>
    b.addEventListener("click", () => speakFromButton(b)));
}

function ledgerRow(r) {
  const reading = (r.reading && showRoman(ledgerLang)) ? `<span class="ledger-reading">${esc(r.reading)}</span>` : "";
  const stat = r.seen
    ? `quizzed ×${r.seen} · ${Math.round(r.accuracy * 100)}%`
    : "not quizzed yet";
  const date = r.secs
    ? `<span class="ledger-date">${esc(shortDay(new Date(r.secs * 1000).toISOString().slice(0, 10)))}</span>`
    : "";
  return `
    <div class="ledger-row">
      <div class="ledger-main">
        <span class="ledger-word">${esc(r.word)}</span>${reading}
        <button class="tts" data-text="${esc(r.word)}" data-lang="${esc(ledgerLang)}" aria-label="Speak">🔊</button>
        <span class="ledger-mastery m-${r.mastery}">${MASTERY_LABEL[r.mastery]}</span>
      </div>
      <div class="ledger-meta">
        <span class="ledger-meaning">${esc(r.meaning || "—")}</span>
        <span class="ledger-stat">${esc(stat)}</span>
        ${date}
      </div>
    </div>`;
}

// ── Markdown takeout ─────────────────────────────────────────────────────────
// Everything you've learned, as a plain text file you own. The builder lives in
// export-md.js and is imported on demand — it's dead weight until you tap the
// button, so the app's first paint never pays for it.

// Is a mastery filter or search actually narrowing the list right now?
function filterActive() {
  return ledgerMastery !== "all" || !!ledgerSearch;
}

function openExportDialog() {
  const dlg = $("#export-dialog");
  if (!dlg) return;

  if (!photos.length) {
    alert("No photos yet. Take a photo and your vocabulary shows up here.");
    return;
  }

  // Name the language the radio is actually offering.
  const cur = $("#export-lang-current");
  if (cur) cur.textContent = `Current (${LANG[ledgerLang]?.name || ledgerLang})`;
  const currentRadio = dlg.querySelector('input[name="export-lang"][value="current"]');
  if (currentRadio) currentRadio.checked = true;

  // "Only the words I'm filtering to" is meaningless with no filter on.
  const filterBox = $("#export-filter");
  const filterWrap = $("#export-filter-wrap");
  const active = filterActive();
  if (filterBox) { filterBox.disabled = !active; if (!active) filterBox.checked = false; }
  filterWrap?.classList.toggle("disabled", !active);

  $("#export-status").textContent = "";
  dlg.showModal();
}

async function runExport() {
  const dlg = $("#export-dialog");
  const status = $("#export-status");
  const btn = $("#export-go");
  const all = dlg.querySelector('input[name="export-lang"]:checked')?.value === "all";
  const includeGrammar = !!$("#export-grammar")?.checked;
  const useFilter = !!($("#export-filter")?.checked && filterActive());

  btn.disabled = true;
  status.textContent = "Building…";
  try {
    // Mastery chips need the grades. Warm path: already loaded, this is a no-op.
    await loadReviews(false);

    const { buildMarkdown, downloadMarkdown, exportFilename } = await import("./export-md.js");
    const langs = all ? [...ORDER] : [ledgerLang];
    const today = new Date().toISOString().slice(0, 10);
    const { text, wordTotal } = buildMarkdown(photos, reviewMap, {
      langs,
      includeGrammar,
      filter: useFilter ? { mastery: ledgerMastery, search: ledgerSearch } : null,
      today,
    });

    if (!text) {
      status.textContent = "Nothing to export with those options.";
      btn.disabled = false;
      return;
    }

    const result = await downloadMarkdown(text, exportFilename(langs, today));
    if (result === "cancelled") { status.textContent = ""; btn.disabled = false; return; }
    status.textContent = `${wordTotal} word${wordTotal === 1 ? "" : "s"} exported.`;
    setTimeout(() => { dlg.close(); btn.disabled = false; }, 900);
  } catch (e) {
    console.error("export failed", e);
    status.textContent = "Export failed. Try again.";
    btn.disabled = false;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

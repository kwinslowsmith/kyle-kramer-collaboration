/**
 * Markdown takeout — everything you've learned, as a plain text file.
 *
 * Your words, readings, meanings, example sentences, and the grammar the app
 * taught you, grouped under the photo each one came from. Built entirely from
 * data the Data panel already holds in memory (photos + reviewMap), so this
 * costs zero Firestore reads and works offline once the app has loaded.
 *
 * buildMarkdown() is pure — no DOM, no network — so it can be unit-tested in
 * node against fixture photos. The mastery chips it prints come from vocab.js's
 * masteryOf(), the same function that paints the chips on screen, so the file
 * and the ledger can never disagree.
 */
import { LANG, ORDER } from "./study.js";
import { wordKey, masteryOf, meaningLangFor, MASTERY_LABEL } from "./vocab.js";

// ── Markdown escaping ────────────────────────────────────────────────────────
// A text file, not innerHTML: escape the characters that would be read as
// markdown syntax, and nothing else. Leading #/- are neutralized separately
// because they only mean anything at the start of a line.
function esc(s) {
  return String(s ?? "")
    .replace(/([\\`*_\[\]])/g, "\\$1")
    .replace(/^([#\-+>])/, "\\$1")
    .trim();
}

// Bold the exact highlight substring inside the sentence, mirroring
// study.js highlightStructure(). Falls back to the plain sentence when the
// model's highlight doesn't literally occur in its own sentence.
function highlight(sentence, chunk) {
  const s = esc(sentence);
  if (!chunk) return s;
  const h = esc(chunk);
  const at = s.indexOf(h);
  if (at < 0) return s;
  return `${s.slice(0, at)}**${h}**${s.slice(at + h.length)}`;
}

function isoDay(secs) {
  if (!secs) return "";
  return new Date(secs * 1000).toISOString().slice(0, 10);
}

// ── Word rows ────────────────────────────────────────────────────────────────
// One concept, seen through the lens of `tl` (the language being exported) with
// its meaning in `ml`. Returns null when this photo has no word in `tl`.
function conceptRow(concept, tl, ml, reviewMap) {
  const entry = concept.langs?.[tl];
  const word = (entry?.word || "").trim();
  if (!word) return null;

  const review = reviewMap.get(`${tl}__${wordKey(word)}`);
  const mastery = masteryOf(review);
  const meaning = (concept.langs?.[ml]?.word || "").trim();

  const bits = [];
  if (meaning) bits.push(esc(meaning));
  if (concept.pos) bits.push(esc(concept.pos));
  bits.push(review?.seen
    ? `${MASTERY_LABEL[mastery]}, quizzed ×${review.seen}, ${Math.round((review.correct / review.seen) * 100)}%`
    : MASTERY_LABEL[mastery]);

  const reading = (entry.reading || "").trim();
  const head = reading ? `**${esc(word)}** (${esc(reading)})` : `**${esc(word)}**`;

  let row = `- ${head} — ${bits.join(" · ")}`;
  if (entry.example) row += `\n  - ${esc(entry.example)}`;
  return { row, word, meaning, reading, mastery };
}

function passesFilter(row, filter) {
  if (!filter) return true;
  if (filter.mastery && filter.mastery !== "all" && row.mastery !== filter.mastery) return false;
  if (filter.search) {
    const hay = `${row.word} ${row.reading} ${row.meaning}`.toLowerCase();
    if (!hay.includes(filter.search)) return false;
  }
  return true;
}

// ── Grammar rows ─────────────────────────────────────────────────────────────
// Scaffold fields (chunk_gloss / does / translation) landed 2026-07-01. Each
// renders only when present, so older photos degrade to point + sentence —
// exactly what study.js does on the card.
function grammarRow(g) {
  const head = g.cefr ? `- **${esc(g.point)}** (${esc(g.cefr)})` : `- **${esc(g.point)}**`;
  const lines = [head];
  if (g.sentence) lines.push(`  - ${highlight(g.sentence, g.highlight)}`);
  if (g.highlight && g.chunk_gloss) lines.push(`  - ${esc(g.highlight)} — ${esc(g.chunk_gloss)}`);
  if (g.does) lines.push(`  - ${esc(g.does)}`);
  if (g.translation) lines.push(`  - Meaning: ${esc(g.translation)}`);
  return lines.join("\n");
}

// ── Per-photo section ────────────────────────────────────────────────────────
// Returns null when the photo contributes no words in this language (either it
// never had any, or the filter removed them all). A photo with no words carries
// no grammar either — the words are the reason it's in the file.
function photoSection(photo, tl, ml, reviewMap, opts) {
  const rows = (photo.concepts || [])
    .map((c) => conceptRow(c, tl, ml, reviewMap))
    .filter((r) => r && passesFilter(r, opts.filter));
  if (!rows.length) return null;

  const out = [`## ${isoDay(photo.createdAt?.seconds) || "Undated"}`];

  // Scene caption: the sentence in the language you're learning, with your
  // mother tongue underneath when both were generated.
  const sl = photo.scene_langs || {};
  const tText = sl[tl]?.text || (tl === "en" ? photo.scene : "") || "";
  const hText = sl[ml]?.text || (ml === "en" ? photo.scene : "") || "";
  if (tText) {
    out.push("", `> ${esc(tText)}`);
    if (hText && hText !== tText) out.push(`> (${esc(hText)})`);
  } else if (hText) {
    out.push("", `> ${esc(hText)}`);
  }

  out.push("", "### Words", ...rows.map((r) => r.row));

  if (opts.includeGrammar) {
    const gram = (photo.grammar || []).filter((g) => g.lang === tl && g.point);
    if (gram.length) out.push("", "### Grammar", ...gram.map(grammarRow));
  }

  return { text: out.join("\n"), wordCount: rows.length };
}

// ── Per-language section ─────────────────────────────────────────────────────
function languageSection(photos, tl, reviewMap, opts) {
  const ml = meaningLangFor(tl);
  const sections = photos
    .map((p) => photoSection(p, tl, ml, reviewMap, opts))
    .filter(Boolean);
  if (!sections.length) return null;

  const words = sections.reduce((n, s) => n + s.wordCount, 0);
  return {
    lang: tl,
    words,
    photos: sections.length,
    text: sections.map((s) => s.text).join("\n\n"),
  };
}

/**
 * Build the whole document.
 *
 * @param photos     the Data panel's live list of "done" photo docs
 * @param reviewMap  `${lang}__${wordKey}` -> {seen, correct, lastResult}
 * @param opts       { langs: string[], includeGrammar: bool, filter: null | {mastery, search}, today: "YYYY-MM-DD" }
 * @returns { text, wordTotal, photoTotal } — text is "" when nothing survived
 */
export function buildMarkdown(photos, reviewMap, opts) {
  const o = { includeGrammar: true, filter: null, ...opts };
  const langs = (o.langs?.length ? o.langs : ORDER).filter((l) => LANG[l]);
  // Newest photo first: the words you just learned are the ones you want on top.
  const ordered = [...(photos || [])].sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const sections = langs
    .map((l) => languageSection(ordered, l, reviewMap || new Map(), o))
    .filter(Boolean);
  if (!sections.length) return { text: "", wordTotal: 0, photoTotal: 0 };

  const wordTotal = sections.reduce((n, s) => n + s.words, 0);
  const photoTotal = Math.max(...sections.map((s) => s.photos));
  const multi = sections.length > 1;

  const head = ["# Lens — my language notes"];
  const names = sections.map((s) => LANG[s.lang].name).join(" · ");
  head.push("", `Exported ${o.today} · ${names} · ${photoTotal} photo${photoTotal === 1 ? "" : "s"} · ${wordTotal} word${wordTotal === 1 ? "" : "s"}`);
  head.push("", "Words are grouped under the photo they came from, newest first. Readings are always included, whatever the app's romanization switch is set to.");
  if (o.filter) head.push("", "Filtered to match what the Vocabulary list was showing when this was exported.");

  const body = sections.map((s) => multi
    // In a multi-language file each language owns a level-2 heading, so photo
    // headings drop a level to keep the tree honest.
    ? `## ${LANG[s.lang].name}\n\n${s.text.replace(/^## /gm, "### ").replace(/^### Words$/gm, "#### Words").replace(/^### Grammar$/gm, "#### Grammar")}`
    : s.text).join("\n\n---\n\n");

  return { text: `${head.join("\n")}\n\n${body}\n`, wordTotal, photoTotal };
}

// ── Delivery ─────────────────────────────────────────────────────────────────
// Blob + <a download> everywhere it works. Inside an installed iOS PWA a blob
// download silently no-ops, so we hand the file to the share sheet instead —
// the user saves it to Files or mails it to themselves.
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

export async function downloadMarkdown(text, filename) {
  const type = "text/markdown;charset=utf-8";

  if (isStandalone() && typeof File === "function") {
    const file = new File([text], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      } catch (e) {
        if (e?.name === "AbortError") return "cancelled";
        // Anything else: fall through to the download path.
      }
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}

export function exportFilename(langs, today) {
  const tag = langs.length === 1 ? langs[0] : "all";
  return `lens-vocab-${tag}-${today}.md`;
}

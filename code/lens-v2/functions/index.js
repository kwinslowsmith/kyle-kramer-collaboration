/**
 * Lens v2 — the vision Cloud Function.
 *
 * This is the ENTIRE reason a backend exists: the Anthropic API key lives here,
 * server-side, and never touches a phone. A photo lands in Firestore as a
 * `queued` record; this function reads the (already-downscaled) image from
 * Storage, asks the vision model for vocabulary, and writes the words back.
 *
 * Cost control is structural, not hopeful:
 *   - MODEL is a single config constant — swap Sonnet -> Haiku in one line.
 *   - Images arrive pre-downscaled (~1024px / ~200KB) from the phone, so the
 *     input token count (and therefore the bill) is already small.
 *   - The vision call is retried at most MAX_VISION_ATTEMPTS times for TRANSIENT
 *     errors only (429 / 5xx). A permanently-failing photo is marked
 *     `needs_reprocessing` and the function returns normally — it can NEVER loop
 *     the (billed) vision call forever.
 *   - The real backstop is the hard spend cap in the Anthropic Console
 *     (see SETUP.md). This code is the guardrail against a bug; the cap is the wall.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");  // grounding pass (Click Target bboxes)
const GRAMMAR_IDS = require("./grammar-ids.json");  // per-language locked taxonomy: { code: [{id, point, cefr}] }

admin.initializeApp();

// ── Config constants (the levers) ────────────────────────────────────────────
const MODEL = "claude-sonnet-4-6";   // <- single source of truth. Drop to "claude-haiku-4-5" to cut cost ~3x.
const MAX_TOKENS = 3800;             // generous for ~5 concepts x 7 vocab languages PLUS grammar (2/lang x 6, now with translation/does/chunk_gloss scaffolds) PLUS the 7-language scene caption; caps runaway output cost. (eu is vocab-only; grammar stays 6 langs.)
const MAX_VISION_ATTEMPTS = 2;       // transient-only retries. NOT a re-bill loop — see catch block.
const EFFORT = "low";                // extraction doesn't need deep reasoning; "low" trims tokens.
const GRAMMAR_PER_LANG = 2;          // sentences per language banked per photo.

// ── Localization / Click Target hotspots (the accuracy fix) ──────────────────
// v1 asked the VOCAB model for box coordinates in the same call — LLM coordinate
// regression is weak, so boxes came out slightly off and had to be hand-fixed in
// bbox_editor.py. v2 DECOUPLES naming from locating: Claude names the concepts
// (what it's good at), then a dedicated grounding model locates them. The boxes
// are written as a `bbox` array PARALLEL to `concepts` (percentages 0-100, v1's
// exact {x1,y1,x2,y2} shape) so the front-end hit-test is reused verbatim.
// Precision over recall: a concept we can't confidently box stays a flashcard.
const LOCALIZE = true;                        // master kill-switch for the bbox pass
const LOCALIZER_MODEL = "gemini-2.5-flash";   // swappable grounding model (Google spatial understanding)
const BOX_MAX_AREA_PCT = 80;                  // drop a "box" covering more of the frame than this (a non-answer)
const BOX_MIN_AREA_PCT = 0.3;                 // drop slivers
const BOX_IOU_DUP = 0.6;                      // two kept boxes this similar => keep one, drop the other

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Keep the fleet tiny: 4 trip users, low traffic. Caps concurrency so a burst
// of trail photos processing at the lodge can't fan out into a cost spike.
setGlobalOptions({ maxInstances: 3, region: "us-central1" });

// ── The structured-output contract ───────────────────────────────────────────
// JSON schema => the model is forced to return valid JSON in this exact shape.
// No brittle parsing on our side. (bbox / Click-Target hotspots are a v2.x add —
// today's endpoint is "get vocabulary back + review it", which Random and Word
// Hunt modes satisfy with concepts alone.)
const LANG_ENTRY = {
  type: "object",
  additionalProperties: false,
  properties: {
    word: { type: "string" },
    reading: { type: "string" },   // romanization / kana+romaji / article / pinyin; "" for en
    example: { type: "string" },   // one natural A2-B1 sentence in that language
  },
  required: ["word", "reading", "example"],
};

// One grammar example, native to a single language. Per Vera's rule these are
// NOT translations of each other across languages — each is a sentence natural to
// its own language that happens to describe the same photo. `id`/`cefr` come from
// the locked taxonomy (grammar-ids.json); `highlight` is the exact substring of
// `sentence` that shows the structure (so the card can emphasize it).
const GRAMMAR_ENTRY = {
  type: "object",
  additionalProperties: false,
  properties: {
    lang: { type: "string", enum: ["en", "ko", "ja", "es", "fr", "zh"] },
    id: { type: "string", description: "snake_case grammar-point id from the provided taxonomy for that language" },
    point: { type: "string", description: "short human name of the grammar point" },
    cefr: { type: "string", enum: ["A1", "A2", "B1", "B2"] },
    sentence: { type: "string", description: "a natural sentence about THIS photo, in that language, demonstrating the point" },
    highlight: { type: "string", description: "the exact substring of sentence that shows the structure" },
    // Beginner-decode scaffolds (added 2026-07-01, Vera + Quinn). A native
    // sentence with a bolded chunk teaches nothing if the learner can't read it.
    translation: { type: "string", description: "a natural ENGLISH translation of the whole sentence (if lang is en, repeat the sentence verbatim)" },
    does: { type: "string", description: "ONE short English clause, max ~12 words, plain language, NO grammar jargon/term-names/CEFR — says what the highlighted structure DOES for the listener" },
    chunk_gloss: { type: "string", description: "a literal English gloss of the HIGHLIGHT substring only, form: 'piece (meaning) + piece (meaning)'; literal not idiomatic" },
  },
  required: ["lang", "id", "point", "cefr", "sentence", "highlight", "translation", "does", "chunk_gloss"],
};

// The one-sentence scene caption, given natively in a single language. Mirrors
// LANG_ENTRY's shape so the front-end can show the caption in the language being
// learned (with TTS) and flip it to the learner's mother tongue on tap.
const SCENE_ENTRY = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", description: "the one-sentence scene description, idiomatic to this language" },
  },
  required: ["text"],
};

const VOCAB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene: { type: "string", description: "one-sentence English description of the photo (same as scene_langs.en.text)" },
    scene_langs: {
      type: "object",
      additionalProperties: false,
      description: "the one-sentence scene caption in all seven languages",
      properties: {
        en: SCENE_ENTRY, ko: SCENE_ENTRY, ja: SCENE_ENTRY,
        es: SCENE_ENTRY, fr: SCENE_ENTRY, zh: SCENE_ENTRY,
        eu: SCENE_ENTRY,
      },
      required: ["en", "ko", "ja", "es", "fr", "zh", "eu"],
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pos: { type: "string", description: "part of speech, e.g. noun / verb" },
          pointable: { type: "boolean", description: "true ONLY if this concept is a single concrete object that is clearly and individually visible in THIS photo (a thing you could tap on); false for verbs, actions, phrases, materials, or whole-scene ideas" },
          langs: {
            type: "object",
            additionalProperties: false,
            properties: {
              en: LANG_ENTRY, ko: LANG_ENTRY, ja: LANG_ENTRY,
              es: LANG_ENTRY, fr: LANG_ENTRY, zh: LANG_ENTRY,
              eu: LANG_ENTRY,
            },
            required: ["en", "ko", "ja", "es", "fr", "zh", "eu"],
          },
        },
        required: ["pos", "pointable", "langs"],
      },
    },
    grammar: {
      type: "array",
      description: "scene-relevant grammar examples, native to each language",
      items: GRAMMAR_ENTRY,
    },
  },
  required: ["scene", "scene_langs", "concepts", "grammar"],
};

// Compact per-language taxonomy reference, built once at module load. The model
// MUST pick `id` values from this list (the engine downstream reads these ids),
// so we hand it the controlled vocabulary inline.
const LANG_NAMES = { en: "English", ko: "Korean", ja: "Japanese", es: "Spanish", fr: "French", zh: "Mandarin" };
const GRAMMAR_REF = Object.entries(GRAMMAR_IDS)
  .map(([code, pts]) =>
    `${LANG_NAMES[code]} (${code}):\n` +
    pts.map((p) => `  ${p.id} — ${p.point} [${p.cefr}]`).join("\n"))
  .join("\n\n");

const PROMPT = `You are a multilingual language tutor. Look at this photo and produce two things.

PART 1 — VOCABULARY. Pick the 3-5 MOST USEFUL concepts a learner would actually want — high-frequency, concrete, pointable things, plus at least one verb or short phrase if the scene supports it. No abstractions, no brand names. For each concept set "pointable": true only if it is a single concrete object clearly and individually visible in THIS photo (a thing you could tap on) — set it false for verbs, actions, phrases, materials, or whole-scene ideas. For each concept, teach it in all seven languages (en, ko, ja, es, fr, zh, eu). For each language give:
- word: the word/phrase in that language (eu = Basque / Euskara — the bare citation form, e.g. "etxe")
- reading: romanization (ko: revised romanization; ja: "kana · romaji"; es/fr: the article el/la/le/la/les; zh: pinyin with tone marks; eu: the determined/article-suffixed form of the noun, e.g. "etxea" for "etxe" — Basque is read as written, so give this form since the bare noun rarely stands alone; en: leave "")
- example: one natural, sayable A2-B1 sentence using the word in that language (NOT a translation of the English sentence — a sentence natural to that language)

PART 2 — GRAMMAR. For EACH of the six grammar languages (en, ko, ja, es, fr, zh — Basque is vocabulary-only for now, do NOT emit grammar for eu), write ${GRAMMAR_PER_LANG} short, natural sentences that describe THIS photo, each demonstrating ONE grammar point. Rules:
- The sentences are native to each language. Do NOT translate one sentence into the others — each language gets its own sentences, idiomatic to that language.
- Strongly prefer A1/A2 points and keep the sentence itself short and simple; only reach for B1+ when the scene genuinely invites it. The learner is a beginner — a simpler sentence they can decode beats a clever one they can't. Vary the points within a language.
- For each sentence, set "id", "point", and "cefr" by choosing from the controlled taxonomy below for that language. Use the id EXACTLY as written. Set "lang" to the language code.
- "highlight" must be an exact substring of "sentence" — the words that show the structure.
- "translation": a natural ENGLISH translation of the WHOLE sentence (for lang=en, repeat the sentence). This is the beginner's meaning anchor — it must be accurate.
- "does": ONE short English clause (max ~12 words) in plain language that says what the highlighted structure DOES — its job for the listener, NOT its grammar-term name and NOT a CEFR level. Example: for a topic marker write "marks what the sentence is about", not "topic particle". For ser/estar write "used because the location is temporary".
- "chunk_gloss": a LITERAL, morpheme-by-morpheme English gloss of the HIGHLIGHT substring only, in the form "piece (meaning) + piece (meaning)". Literal, not idiomatic — the idiomatic meaning already lives in "translation".

GRAMMAR TAXONOMY (choose ids only from these, per language):
${GRAMMAR_REF}

PART 3 — SCENE CAPTION. Write ONE natural sentence that describes the whole photo (what is happening / what we see), and give that same caption in all seven languages (including eu / Basque) under "scene_langs". Each is idiomatic to its own language — not a stiff word-for-word translation — but they all describe the same scene. Keep it short and learner-friendly (roughly A2-B1). Copy the English caption into "scene" as well.`;

// ── The Language Compendium harvest ──────────────────────────────────────────
// Pools the generated vocabulary + grammar from every processed photo into two
// de-duped, top-level collections — a growing "trip dictionary" Kramer (admin)
// can browse. It is ANONYMOUS by design: we copy ONLY the language content, never
// the image, the uid, or any photo reference. (Per the privacy decision: friends
// know their generated content is pooled; their photos never are.)
//
// De-dup is by deterministic doc id, so repeat sightings of the same word /
// grammar point land on the same doc: `seen` increments and new example
// sentences union in. All writes are atomic (increment + arrayUnion), so no
// read-modify-write race even when several photos process at once.
const EXAMPLE_CAP = 8;        // soft cap surfaced in the viewer; arrayUnion itself is unbounded.

// Firestore doc ids can't contain "/" and have a length limit; normalize the key
// so the same surface word always maps to the same doc. CJK scripts pass through
// (lowercase is a no-op for them); spaces/slashes are flattened.
function compKey(s) {
  return String(s).trim().toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[\/\\#?]/g, "-")
    .slice(0, 200);
}

async function harvestToCompendium(parsed) {
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const batch = db.batch();
  let ops = 0;

  // Vocabulary: one doc per (language, word), examples accrue.
  for (const c of parsed.concepts || []) {
    const pos = c.pos || "";
    for (const [lang, entry] of Object.entries(c.langs || {})) {
      const word = (entry?.word || "").trim();
      if (!word) continue;
      const ref = db.collection("compendium_words").doc(`${lang}__${compKey(word)}`);
      const fields = {
        lang, word, pos,
        reading: entry.reading || "",
        seen: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const ex = (entry.example || "").trim();
      if (ex) fields.examples = FieldValue.arrayUnion(ex);
      batch.set(ref, fields, { merge: true });
      ops++;
    }
  }

  // Grammar: one doc per (language, grammar-point id), example sentences accrue.
  for (const g of parsed.grammar || []) {
    const id = (g?.id || "").trim();
    if (!id || !g.lang) continue;
    const ref = db.collection("compendium_grammar").doc(`${g.lang}__${compKey(id)}`);
    const fields = {
      lang: g.lang, id,
      point: g.point || "",
      cefr: g.cefr || "",
      seen: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if ((g.sentence || "").trim()) {
      fields.examples = FieldValue.arrayUnion({
        sentence: g.sentence.trim(),
        highlight: (g.highlight || "").trim(),
      });
    }
    batch.set(ref, fields, { merge: true });
    ops++;
  }

  if (ops === 0) return;
  await batch.commit();
  console.log(`Compendium += ${ops} entries (cap ${EXAMPLE_CAP} examples/entry on view).`);
}

// ── Localization pass: ground concept labels to tap-target boxes ─────────────
// Takes the concepts Claude already named and asks a dedicated grounding model
// WHERE each pointable one is. Returns an array PARALLEL to `concepts`:
// [{x1,y1,x2,y2}] (a one-box list, percentages 0-100, top-left/bottom-right —
// v1's exact shape) for a confidently-located concept, else null.
//
// Precision over recall by design: anything we can't confidently box becomes
// null and simply stays a flashcard, never a wrong tap-target. Every safeguard
// below is "when in doubt, null".
async function localizeConcepts(base64, mediaType, concepts) {
  const nullAll = () => concepts.map(() => null);
  if (!LOCALIZE) return nullAll();

  // Only concrete, visibly-locatable nouns are worth grounding. Trust Claude's
  // explicit `pointable` flag; fall back to a noun POS for legacy safety.
  const targets = concepts
    .map((c, i) => ({ i, label: (c?.langs?.en?.word || "").trim(), ok: isPointable(c) }))
    .filter((t) => t.ok && t.label);
  if (!targets.length) return nullAll();   // nothing to point at -> no Gemini call, zero cost

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
  const model = genAI.getGenerativeModel({
    model: LOCALIZER_MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });

  const labelList = targets.map((t) => t.label).join(", ");
  // Recall-suppressing prompt: the standard box response carries no reliable
  // numeric confidence, so we tell the model to omit anything uncertain instead.
  const prompt =
    `Detect these specific items in the image: ${labelList}.\n` +
    `Return ONLY items you can clearly and unambiguously see. Give a TIGHT box ` +
    `around just that object. Respond as a JSON array; each element is ` +
    `{"label": <the exact label from the list>, "box_2d": [ymin, xmin, ymax, xmax]} ` +
    `with box_2d normalized to 0-1000. Omit any listed item you cannot confidently ` +
    `locate. Do not invent items not in the list. At most one box per label.`;

  const resp = await model.generateContent([
    { inlineData: { data: base64, mimeType: mediaType } },
    { text: prompt },
  ]);

  let detections;
  try { detections = JSON.parse(resp.response.text()); } catch { detections = []; }
  if (!Array.isArray(detections)) detections = [];

  // Map each detection back to its concept index by exact (case-insensitive) label.
  const byLabel = new Map(targets.map((t) => [t.label.toLowerCase(), t.i]));
  const out = concepts.map(() => null);
  const kept = [];   // {box} of accepted boxes, for duplicate suppression
  for (const d of detections) {
    const idx = byLabel.get((d?.label || "").trim().toLowerCase());
    if (idx === undefined || out[idx]) continue;         // unknown label or already filled
    const box = toPercentBox(d?.box_2d);
    if (!box) continue;                                  // implausible geometry -> drop
    if (kept.some((k) => iou(k, box) > BOX_IOU_DUP)) continue;  // duplicate region -> drop
    // Firestore forbids nested arrays (an array whose elements are arrays), so we
    // CANNOT store bbox as [ [box], null, [box] ]. Wrap each concept's box list in
    // an object — Firestore allows arrays of objects and objects containing arrays.
    out[idx] = { boxes: [box] };
    kept.push(box);
  }
  return out;
}

function isPointable(c) {
  if (typeof c?.pointable === "boolean") return c.pointable;
  return /noun/i.test(c?.pos || "");   // legacy fallback when the flag is absent
}

// Gemini [ymin,xmin,ymax,xmax] on a 0-1000 scale -> v1 {x1,y1,x2,y2} percentages
// (0-100), with all the "when in doubt, drop it" geometry checks. Returns null
// to drop the box entirely (concept stays a flashcard).
function toPercentBox(b) {
  if (!Array.isArray(b) || b.length !== 4 ||
      b.some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
  const clamp = (n) => Math.max(0, Math.min(100, n / 10));   // /1000*100
  const y1 = clamp(b[0]), x1 = clamp(b[1]), y2 = clamp(b[2]), x2 = clamp(b[3]);
  if (x2 <= x1 || y2 <= y1) return null;                     // zero/negative/transposed
  const areaPct = (x2 - x1) * (y2 - y1) / 100;               // % of the frame's area
  if (areaPct > BOX_MAX_AREA_PCT || areaPct < BOX_MIN_AREA_PCT) return null;
  return { x1, y1, x2, y2 };
}

// Intersection-over-union of two {x1,y1,x2,y2} boxes (percentage space).
function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (inter <= 0) return 0;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

exports.processPhoto = onDocumentCreated(
  {
    document: "users/{uid}/photos/{photoId}",
    secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();

    // Only act on fresh `queued` records that carry an image path.
    if (data.status !== "queued" || !data.imagePath) {
      console.log(`Skip ${snap.ref.path}: status=${data.status} imagePath=${!!data.imagePath}`);
      return;
    }

    await snap.ref.update({ status: "processing", startedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Pull the (already-downscaled) image out of Storage and base64 it.
    let base64, mediaType;
    try {
      const file = admin.storage().bucket().file(data.imagePath);
      const [meta] = await file.getMetadata();
      mediaType = meta.contentType || "image/jpeg";
      const [buf] = await file.download();
      base64 = buf.toString("base64");
    } catch (err) {
      console.error(`Storage read failed for ${data.imagePath}:`, err.message);
      // No image to bill against — mark for manual reprocessing and stop.
      await snap.ref.update({ status: "needs_reprocessing", error: `storage: ${err.message}` });
      return;
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    // Transient-only retry loop. We catch billed-call failures here so a bad
    // photo can never re-trigger and re-bill: after MAX_VISION_ATTEMPTS we mark
    // the doc and return normally (Firebase sees success, no auto-retry).
    let lastErr;
    for (let attempt = 1; attempt <= MAX_VISION_ATTEMPTS; attempt++) {
      try {
        const resp = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT, format: { type: "json_schema", schema: VOCAB_SCHEMA } },
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          }],
        });

        const textBlock = resp.content.find((b) => b.type === "text");
        const parsed = JSON.parse(textBlock.text); // structured output guarantees valid JSON
        const concepts = parsed.concepts || [];

        // Second pass: locate the pointable concepts for Click Target. Isolated —
        // a grounding failure NEVER fails the photo (we fall back to all-null
        // boxes; vocab is intact). The catch lives on THIS call, not in the vision
        // retry loop, so a Gemini error can't re-trigger and re-bill Claude.
        let bbox = concepts.map(() => null);
        try {
          bbox = await localizeConcepts(base64, mediaType, concepts);
        } catch (e) {
          console.warn(`Localize failed for ${snap.ref.path}: ${e.message}`);
        }
        const localizedCount = bbox.filter(Boolean).length;

        await snap.ref.update({
          status: "done",
          scene: parsed.scene || "",
          scene_langs: parsed.scene_langs || {},
          concepts,
          grammar: parsed.grammar || [],
          bbox,                                       // parallel to concepts; null = not a tap-target
          localizer: LOCALIZE ? LOCALIZER_MODEL : null,
          localizedCount,
          model: MODEL,
          attempts: attempt,
          inputTokens: resp.usage?.input_tokens ?? null,
          outputTokens: resp.usage?.output_tokens ?? null,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Done ${snap.ref.path}: ${concepts.length} concepts, ` +
          `${parsed.grammar?.length || 0} grammar, ${localizedCount} located, ` +
          `${resp.usage?.input_tokens}+${resp.usage?.output_tokens} tok (attempt ${attempt})`);

        // Harvest into the shared Language Compendium — a de-duped, ANONYMOUS pool
        // of every user's generated vocab + grammar. NO image, NO uid, NO photo
        // reference: only the language content. Never fails the photo (already
        // marked done); a compendium write error is logged and swallowed.
        await harvestToCompendium(parsed).catch((e) =>
          console.warn(`Compendium harvest failed for ${snap.ref.path}: ${e.message}`));
        return;
      } catch (err) {
        lastErr = err;
        const status = err?.status;
        const transient = status === 429 || (status >= 500 && status < 600) || err?.name === "APIConnectionError";
        console.warn(`Vision attempt ${attempt}/${MAX_VISION_ATTEMPTS} failed (${status || err?.name}): ${err.message}`);
        if (!transient) break;                 // 4xx (bad request etc.) — don't burn another billed call
        if (attempt < MAX_VISION_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * attempt)); // small backoff
        }
      }
    }

    // Exhausted retries (or hit a non-transient error). Park it — never loop.
    await snap.ref.update({
      status: "needs_reprocessing",
      attempts: MAX_VISION_ATTEMPTS,
      error: `vision: ${lastErr?.status || lastErr?.name || "unknown"} ${lastErr?.message || ""}`.trim(),
    });
    console.error(`Parked ${snap.ref.path} as needs_reprocessing.`);
  }
);

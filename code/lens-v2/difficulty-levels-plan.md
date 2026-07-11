# Lens v2 — Per-Language Difficulty Levels (plan)

Design doc. Written 2026-07-10. Owner: Mason (PM).
Companion to `../grammar-engine-plan.md` and `../grammar-affordance-report.md`.
Status: design approved by Kramer 2026-07-10. Code lands in sequenced phases (see Sequencing).

---

## 1. The problem in one paragraph

Lens generates vocabulary and grammar for every photo at a difficulty that is hardcoded in the
Cloud Function prompt, identically for every user and every language. Three strings do it:

- `functions/index.js:173` — vocab examples must be *"one natural, sayable A2-B1 sentence"*
- `functions/index.js:177` — *"Strongly prefer A1/A2 points... The learner is a beginner"*
- `functions/index.js:187` — the scene caption, *"roughly A2-B1"*

One dial, welded shut, serving seven languages and twelve users. Kramer's Korean happens to sit at
a well-judged A1/A2 because that is genuinely where he is. His Spanish is C1 across all four skills
in `language-proficiency.json` and gets the same beginner nouns. Yulia Nomura's Japanese never
stretches her. Nobody can change any of it.

**The outcome we want.** A user opens a settings pane, sets a level per language, and the
vocabulary inferred from each new photo changes accordingly: a C1 Spanish reader gets precise,
low-frequency, idiomatic words where an A1 reader gets concrete nouns. Then the app watches how
they actually perform and gently asks whether the dial is still right.

---

## 2. What the investigation found

| Fact | Where | Consequence |
| --- | --- | --- |
| No user settings document exists at all | `firestore.rules` matches only `users/{uid}/photos` and `users/{uid}/reviews` | The pane needs a new doc and new rules, not an edit to existing state |
| Language choice lives in `localStorage` | `public/js/study.js:31-32` (`lensHome` / `lensTarget`) | Device-local and invisible to the backend. Must be mirrored to Firestore for the Function to read |
| The photo doc carries `uid`; the trigger exposes `event.params.uid` | `functions/index.js:362` | The Function can read per-user levels with one extra Firestore get. No re-architecture needed |
| One photo generates all 7 languages in a single call | `VOCAB_SCHEMA`, `functions/index.js:111` | A single "difficulty" setting is wrong. It must be a per-language **map** |
| `GRAMMAR_REF` is a module-level constant listing **all 25 points** per language | `functions/index.js:162-166` | Filtering that list by CEFR band before it enters the prompt is the strongest and most deterministic lever we have |
| The taxonomy tops out at **B2**, thinly (`es` has 1 B2 point, `en` has 1) | `functions/grammar-ids.json` | Grammar cannot serve C1. See decision 1 |
| `users/{uid}/reviews` already banks `seen` / `correct` per word | written at `public/js/app.js:233-246`; aggregated at `public/js/data.js:145-152` | The reflection nudge has real data to lean on with zero new writes |
| The ZPD dial is already specified | `../grammar-engine-plan.md` §4.5 — stagnation guard / reach / catch | The nudge implements an existing design rather than inventing one |

The single most important line in that table is the `GRAMMAR_REF` one. Today the model is handed
every grammar point for every language on every photo and *asked politely* to prefer easy ones.
Filtering the list by the learner's band means a C1 Spanish learner receives a list containing no
A1 points, so no A1 point can be chosen. Prompt-nudging is the weak version of difficulty control.
List-filtering is the strong one.

---

## 2.5 The finding that reshaped this plan: the model collapses to the floor

Kramer reported that his Korean grammar is "everything A1." Checked against the taxonomy, this is
not the model working from a mostly-A1 menu. **Korean's 25 points are 6 A1 / 7 A2 / 9 B1 / 3 B2** —
only a quarter are A1. The model is handed a rich, mostly-intermediate list and, because the prompt
frames the user as *"a beginner"* and says *"strongly prefer A1/A2,"* it **collapses to the single
easiest rung and stays there** — a well-known LLM behavior when a menu is paired with a "keep it
simple" instruction. The `"Vary the points within a language"` line already in the prompt (`:177`)
is not overcoming it.

Two consequences that a naive "add a level setting" would miss:

1. **A band filter alone does not fix the collapse.** If a B1 learner's filter is `{A2, B1}`, the
   same instinct will floor the model to the easiest A2 point every photo. We need a **distribution
   target**, not just a permitted band (see §5a). Difficulty is not one number; it is a spread.

2. **The output actively contradicts the system's own Korean pedagogy.** The A1 points the model
   defaults to are `이것은 [명사]이에요` ("this is a [noun]") and `[명사]이/가 있어요` ("there is a
   [noun]"). CLAUDE.md's Korean-context rule is explicit: Kramer is *"at a conversational plateau...
   target post-Hangul intermediate: directionals, tense variations, politeness levels, natural
   requests."* That target is sitting **right there in the ignored B1 shelf** — future/intention,
   because/so, can/cannot, relative clauses, if/when, have-to, present progressive, honorifics. The
   app is feeding him the one band its own instructions tell it to skip. This is the strongest single
   argument for the whole build: not "some users want harder content," but "Lens is contradicting a
   documented learning goal for its primary user, every day."

Confirmation instrument: `scratchpad/lens-cefr-probe.js` — a read-only console snippet that prints
the real CEFR histogram of the grammar across Kramer's own photos. The fix is not "done" until that
histogram moves off the A1 floor and shows a spread.

---

## 3. Decisions (confirmed with Kramer, 2026-07-10)

1. **Grammar caps at B2.** A `C1` setting keeps grammar inside the locked 95-id taxonomy and
   expresses the difficulty through vocabulary selection and richer example sentences. Extending
   the taxonomy with a C1 tier is a content project (Quinn plus the language specialists) and does
   not block this build.
2. **All seven languages keep generating**, each at that user's own level for that language. This
   resolves open decision #6 in `../STATUS.md`, outstanding since 2026-06-28.
3. **Levels are self-selected**, then nudged by quiz accuracy. No placement test.
4. **New photos only. No regeneration.** Old cards keep the level they were born at. The settings
   pane says this plainly so nobody expects their library to re-cook. The escape hatch is deleting
   a photo and retaking it.

---

## 4. The settings document

A new Firestore root doc at `users/{uid}`. Read once per photo by the Cloud Function; read and
written by the client.

```
users/{uid} = {
  email,                    // convenience, not a gate
  home:   "en",             // mirrors localStorage lensHome
  target: "ko",             // mirrors localStorage lensTarget
  levels: {                 // one entry per language, a MOVING estimate not a fixed switch
    ko: { band: "B1", points: 20, source: "self", changedAt: <ts> },
    es: { band: "C1", points: 60, source: "nudge", changedAt: <ts> },
    ...
  },
  updatedAt
}
```

Level enum: `A1 A2 B1 B2 C1`. Keys constrained to the seven codes in `study.js:ORDER`.

**A level is an estimate that moves, not a 5-way switch — reuse the `language-proficiency.json`
shape.** That file already models a proven idea used all over KRAMOS: a skill is `{ level, points
0-100, history }`, and points drift on evidence until they cross a boundary and promote/demote the
level. Lens should borrow it exactly. A learner isn't "B1"; they're "B1 at 20 points, trending up."
This matters because of §2.5: the difference between "too easy" and "just right" is often *within* a
band, not a whole band jump, and a coarse switch forces every correction to be a big overshoot. With
points, quiz accuracy and the reflection taps nudge `points` by small increments (±5–10); at 100 it
promotes to the next band at points 0, at <0 it demotes to the band below at 80 (hysteresis, so it
doesn't oscillate on the boundary). Self-report sets the initial `band` (per decision 3); everything
after is evidence. The Cloud Function reads only `band` — the points are the client-side dial that
decides *when* `band` changes.

**One level per language, not per skill.** `language-proficiency.json` also splits reading, listening,
speaking and writing — correct for a CEFR self-test, overkill here. Lens is a reading and recognition
surface; one dial per language is the right granularity. Four would quadruple the pane for no gain.

`localStorage` stays as the offline read cache so the study deck renders before Firestore resolves.
This matters on the Camino, where the app has to work with no signal. Firestore is the write target
and the source of truth the Function reads.

---

## 5. The Cloud Function — where the difficulty actually happens

Five changes to `functions/index.js`, in order of leverage.

**a. Filter the grammar taxonomy by band AND set a distribution target.** `GRAMMAR_REF` becomes
`buildGrammarRef(band)`, built per-invocation instead of at module load. For each language the
allowed CEFR set is `{ band, one rung below }`, clipped to the B2 ceiling, so `C1 → {B1, B2}` and
`A1 → {A1}`. If a language has fewer than three points in that band (French has 2 at B2, Spanish 1),
widen down one more rung. The one-rung-below inclusion preserves variety and interleaving.

The filter alone is necessary but **not sufficient** — §2.5 showed the model floors to the easiest
rung it is offered. So the prompt also carries an explicit **per-photo distribution target** for the
`GRAMMAR_PER_LANG` (currently 2) sentences: *"of your two sentences, make one AT the learner's band
and one a deliberate reach ONE rung above it (capped at B2); never emit two sentences at the same
CEFR unless the band contains only one level."* That single instruction is what actually moves the
histogram — it converts "prefer easy" (which collapses) into "hit this spread" (which the model
follows reliably because it is a concrete quota, not a vibe). At `A1` the reach is A2; at `B1` it is
one at B1 and one at B2; at `C1` (grammar capped at B2) it is one B1 and one B2. This is the ZPD dial
(`../grammar-engine-plan.md` §4.5) operationalized *at generation time*, not just in the nudge — the
"reach" is baked into every photo, so growth is the default, not a thing the user has to opt into.

**b. Delete the three hardcoded difficulty strings** and replace them with a per-language level
table interpolated into the prompt, plus the vocabulary rubric in §6.

**c. Add a `pointable` floor.** At C1 the natural vocabulary is abstract and idiomatic, which would
starve Click Target of tap-targets and quietly break a shipped game mode. Regardless of level, at
least two concepts must be concrete, individually-visible objects (`pointable: true`). This goes in
the prompt as a hard requirement, not a preference.

**d. Raise `MAX_TOKENS` from 3800 to roughly 5200.** C1 sentences are longer and the current ceiling
would truncate. It is a ceiling, not a target — `outputTokens` is already written to each photo doc
and surfaced in the Data panel, so the real cost is observable from day one.

**e. Snapshot the level onto the photo doc** as `levelsAtGen`. Costs nothing, lets a card show
"generated at B1", and gives the Data panel something honest to chart when a level moves.

**Backward compatibility.** A user with no settings doc gets `DEFAULT_LEVELS`, chosen to reproduce
today's output exactly (A2 across the board, matching the current "A2-B1 / prefer A1-A2" behavior).
Phase 1 therefore ships invisibly, which makes it safe to deploy and trivial to roll back.

---

## 6. The vocabulary rubric

This is the heart of the request: the level must change **which concepts get named**, not merely how
long the example sentence is. Owned by Vera, reviewed per language by the specialists.

- **A1** — three to five concrete, high-frequency nouns plus one everyday verb. Examples 4-7 words, present tense.
- **A2** — concrete nouns, common verbs and adjectives. Examples 6-10 words, simple past or near future.
- **B1** — one abstract or process concept allowed; common collocations. Examples 10-14 words, one subordinate clause.
- **B2** — precise over generic (*heron*, not *bird*; *sycamore*, not *tree*); phrasal verbs and idiomatic chunks. Examples use connectors and hypotheticals.
- **C1** — low-frequency, register-marked, idiomatic collocations; deliberately skip words a B2 learner already owns. Examples carry nuance and non-literal use.

Two rules hold at every band: no brand names, and at least two concepts stay concrete and pointable.

The failure mode to guard against is C1 collapsing into rare-for-rare's-sake vocabulary. Nobody
wants a photo of a park to teach them *sesquipedalian*. The rubric says precise and useful, not
obscure. Diego, Jin, Haruki, Céleste, Wen, Rafa and Aitor each sanity-check their language's first
B2 and C1 outputs against real usage before the band is considered trustworthy.

---

## 7. The settings pane

A new `public/js/settings.js` plus a `⚙ Settings` topbar button, following the exact pattern the
Compendium and Data toggles already use (`public/index.html:38-41`, `public/js/app.js:84-90`), and a
`#settings-view` panel styled like the existing `#data-view`. No new visual language, so no Mira gate.

Contents:

- "I speak" and "I'm learning" — the same two pickers as the study bar, now writing through to Firestore.
- Seven rows, one per language, each an `A1 … C1` select. The row for the current target is highlighted.
- One plain sentence beneath: *this changes the words new photos teach you; photos you've already taken keep the words they have.*
- The reflection history: what the app has observed, and what it suggested.

On first load, seed the Firestore doc from the existing `localStorage` values so nobody loses their
language pair.

---

## 8. The reflection nudge

Ada owns the design, Vera owns the voice. Two triggers, both riding on data that already exists.

The points model in §4 does the fine adjustment silently; the nudge is only for the moments that
cross a band boundary, because a whole-band change is big enough to deserve the learner's consent.

**Passive (moves points, silently).** After a Quiz round, compute rolling accuracy for the target
language from `users/{uid}/reviews`. `data.js:145-152` already builds exactly this aggregate as
`reviewMap`, so reuse it rather than writing a second one. Over the last twelve or more answered
items, nudge `points` by a small step:

- accuracy at or above 85% → `points += 8` (this is §4.5's stagnation guard, made continuous)
- accuracy at or below 50% → `points -= 8` (the catch, made continuous)
- in between → no change

These small moves never surprise the learner; they just tighten the estimate. The **nudge dialog
only fires when a move would cross a band boundary** (`points` about to pass 100 or drop below 0).

**Active.** A three-way tap on the study card's grammar block: 🥱 too easy · 👍 right · 😵 too hard.
Writes `users/{uid}/reflections/{lang}` with atomic increments and moves `points` the same way
(🥱 `+8`, 😵 `-8`). This is the most honest signal we get — the learner reacting to a real sentence
in front of them — and it costs one tap.

**The nudge itself** (band-crossing only) is one warm line and two buttons, in the warm-demander
voice from `../grammar-engine-plan.md` §4.5 — no score, no shaming on a miss, no confetti on a gimme:

> Your Spanish has been landing every time lately. Want to push it up to B2?
> `[Move it up]` `[Not yet]`

It never crosses a band without a tap. Ada's rule: self-assessment is a conversation, not a verdict.
Accepting sets `levels.es.band = "B2"`, `points = 0`, `source = "nudge"`. Declining holds `points`
at 92 (just under the boundary) so it doesn't re-ask on the very next round — a decline is data too.

Cooldowns: at most one band-crossing nudge per language per seven days, and no nudge for three
photos after any band change.

---

## 9. Security rules

```
match /users/{uid} {
  allow read:  if isGuest() && request.auth.uid == uid;
  allow write: if isGuest() && request.auth.uid == uid
               && request.resource.data.levels.keys().hasOnly(['en','ko','ja','es','fr','zh','eu']);
  // Per-language band validity is checked client-side and in the Function's read
  // (an unknown band falls back to DEFAULT_LEVELS). Firestore rules cannot cheaply
  // reach into every nested {band,points} object, so the enum guard lives in code,
  // not the rule — the rule's job is "only this user, only these language keys".
}
match /users/{uid}/reflections/{lang} {
  allow read, write: if isGuest() && request.auth.uid == uid;
}
```

The nested `{band, points, source, changedAt}` shape (§4) is why the enum check moved out of the
rule: Firestore rules can validate the top-level key set cheaply but cannot iterate nested object
fields without a brittle per-key expression. The defense-in-depth is instead: the pane's `<select>`
can only emit valid bands, and the Cloud Function treats any unrecognized band as `DEFAULT_LEVELS`
(so a malformed value degrades to today's behavior, never to a crash or an unbounded prompt). Dex
confirms the key-set guard in the emulator before deploying.

---

## 9.5 Make the level observable (a CEFR mirror in the Data panel)

Kramer discovered the all-A1 problem by eyeballing cards. The system should never make him do that.
The Data panel (`public/js/data.js`) already reads his photos and renders bar charts with no chart
library; add one more, computed from the same in-memory photo list at zero extra Firestore cost:

- a **per-language CEFR histogram** of the grammar actually generated (bucket `photo.grammar[].cefr`),
- the current `band`/`points` for that language shown beside it,
- and, once `levelsAtGen` is on the photo doc, a faint line showing where the dial *was* when older
  photos were made — so a level change is visible as the histogram shifting right over time.

This is not decoration. It is the instrument that tells us the fix worked: before the change, Korean
is a single A1 bar; after, it should be a B1-centered spread with a B2 reach tail. The console probe
(`scratchpad/lens-cefr-probe.js`) is the manual version of exactly this chart — the Data panel makes
it a permanent, no-effort readout. Owner: Dex (aggregation) + Rex (the bar).

---

## 10. Known consequences, written down rather than discovered later

- **The Compendium now pools mixed levels.** `compendium_words` de-dupes by `(lang, word)`, so a C1
  Spanish word and an A1 one land in the same doc with no way to tell them apart. Add a
  `levels: arrayUnion(level)` field in `harvestToCompendium` (`functions/index.js:212`).
- **Basque is vocabulary-only.** `grammar-ids.json` has no `eu`, and `LANG_NAMES`
  (`functions/index.js:161`) omits it. The level applies to `eu` vocabulary and nothing else.
- **Old photos are frozen** by decision 4. There is no regeneration path in this build.
- **Cost rises** with output tokens per photo. Watch `outputTokens` in the Data panel for the first
  week after Phase 1 ships.

---

## 11. Sequencing

- **Phase 0.** This document, plus the `../STATUS.md` decision-register update. No code.
- **Phase 1 — backend, invisible.** Settings schema (the `{band, points}` shape), rules,
  `buildGrammarRef(band)` + the per-photo **distribution target** (§5a — the piece that actually
  breaks the collapse), prompt rewrite, `levelsAtGen` snapshot, `DEFAULT_LEVELS`. Zero user-visible
  change until a band is set, so it deploys and rolls back safely.
- **Phase 2 — the pane + the mirror.** `settings.js`, topbar toggle, localStorage seed, and the
  §9.5 CEFR histogram in the Data panel — shipped together so the moment the dials go live there is
  a readout proving they did something.
- **Phase 3 — the nudge.** Passive points drift, active per-card tap, band-crossing dialog, Vera's
  copy.
- **Phase 4 — later.** Feed `band` into the §4 selection algorithm and Grammar Cloze. Commission
  the C1 taxonomy tier if C1 vocabulary alone proves insufficient.

**Fastest path to Kramer feeling the fix:** Phase 1 plus setting `levels.ko.band = "B1"` on his own
account is enough to move his Korean off the A1 floor on the very next photo — the pane (Phase 2) is
how *everyone else* gets there, but his specific complaint is a one-field change once Phase 1 ships.

Every deploy bumps the `sw.js` cache version (currently v14) so PWA clients self-heal.

---

## 12. Verification

1. **Regression first.** A user with no settings doc takes a photo. The resulting doc's `concepts`
   and `grammar` must be shape-identical to today's, at A1/A2. This proves `DEFAULT_LEVELS` is a
   true no-op and that Phase 1 is safe to deploy blind.
2. **The actual bug.** Set `levels.ko.band = "B1"` and `levels.es.band = "C1"` on Kramer's account.
   Take one photo. Inspect the doc: Korean grammar must now be centered at B1 with one B2 reach
   sentence, and **zero A1** entries — the direct refutation of the reported symptom. Spanish grammar
   must be B1/B2 only, no A1/A2. `concepts[].langs.es.word` should not be a first-500-words noun.
3. **The collapse is actually gone (not just the floor raised).** Across five B1-Korean photos, the
   generated grammar must use **at least three distinct point ids** and include B2 reaches — proving
   the distribution target (§5a) beat the floor-and-repeat instinct, not merely moved the floor up.
   Run `scratchpad/lens-cefr-probe.js`: the Korean histogram must be a spread, not a single bar.
4. **Click Target survives.** Same photo: `bbox.filter(Boolean).length >= 2`. If C1 starved the
   pointable floor, a shipped game mode broke silently.
5. **Yulia.** Set `levels.ja.band = "B1"` on her account and confirm her next photo's Japanese
   grammar leaves the A1 band.
6. **The points model promotes.** Simulate 85%+ accuracy on ≥12 Korean reviews; confirm `points`
   climbs by 8/round and that crossing 100 raises the nudge dialog rather than silently jumping band.
7. **Cost.** `outputTokens` on the C1 photo stays under the new `MAX_TOKENS`.
8. **Rules.** In the emulator: a write with an unknown language key must be rejected; a valid write
   must pass; a write to another uid's doc must be rejected.
9. **The mirror.** The Data-panel CEFR histogram (§9.5) renders and matches the console probe.
7. **Old photos untouched.** Re-read a pre-change photo doc and confirm nothing rewrote it.

---

## 13. Team

Mason (PM, sequencing, `STATUS.md`) · Vera (band rubric, nudge voice) · Quinn (taxonomy band filter,
B2 ceiling) · Ada (self-assessment framing, no-shame design) · Dex (Firestore schema and rules) ·
Lisa (code review) · Rex (settings pane) · Diego, Jin, Haruki, Céleste, Wen, Rafa, Aitor
(per-language band accuracy pass on first outputs).

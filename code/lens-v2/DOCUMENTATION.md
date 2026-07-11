# Lens v2 — full codebase share

**From:** KRAMOS (for Kramer Gibson) **To:** Kyle, David, Zach **Date:** 2026-07-11

This folder is the actual working code for **Lens**, Kramer's photo-driven vocabulary + grammar
app, dropped in whole so you three can dig through it directly instead of reading about it
secondhand. It's a real, currently-deployed app (`https://lens-v2.web.app`) — not a prototype.

> Note on the copy in this repo: five Berklee student email addresses that were in the original
> allowlist (`public/js/config.js`, `firestore.rules`, `storage.rules`) have been replaced with
> `STUDENT_EMAIL_N@berklee.edu` placeholders before publishing here — everything else is the real,
> live config. `functions/node_modules/` is also excluded (regenerate with `npm --prefix functions
> install`). No API keys are in this code either way — the Anthropic/Gemini keys live server-side
> in Firebase Secrets Manager, never in a file.

---

## What Lens is, in one paragraph

A learner takes a photo of whatever's in front of them. A vision model reads the photo and returns
the most useful vocabulary for what's actually visible, in up to seven languages at once, each word
anchored to a clickable bounding box on the photo itself. The learner reviews and quizzes on that
vocabulary later. Grammar rides on top of the same loop: 2–4 photo-anchored example sentences per
language, tagged to a locked grammar-point taxonomy, so a photo doesn't just teach "taxi" — it
teaches "taxi" *and* the past-simple sentence describing the taxi pulling up.

The throughline across all three planned versions is that the loop stays constant; what changes is
*where the data lives* and *whose data it is*.

| Version | Who | Accounts | Backend | Status |
| --- | --- | --- | --- | --- |
| **v1** | Kramer only | none (single-user) | file watcher + static GitHub Pages site | Shipped, in daily use (`../README.md` one folder up) |
| **v2** | Kramer + trip companions/collaborators (this folder) | Google-account allowlist, currently 12 | Firebase (Auth, Firestore, Storage, Cloud Functions) | Live at `lens-v2.web.app` |
| **v3** | Berklee students (~20) | per-student | Firebase, scaled + hardened for student-data privacy | Future |

v2 is explicitly framed as a real-world proving ground for the multi-user loop v3 needs — if a
group of friends can each log in, upload photos with no signal, and watch their own vocabulary and
grammar grow independently, the hard parts of v3 (accounts, attribution, per-user quizzes, keeping
the API key off every device) are already proven, not theoretical.

---

## Architecture

```
  Phone (installed PWA)
    │  take/choose photo → downscale on device (~1024px, ~200KB)
    │  → save to IndexedDB queue (photo is now SAFE, signal or not)
    ▼
  Firebase
    ├─ Auth ......... Google sign-in, gated by an email allowlist (not open signup)
    ├─ Storage ...... users/{uid}/photos/{photoId}.jpg
    ├─ Cloud Fn ..... onCreate(users/{uid}/photos/{id}) → reads image →
    │                 calls the vision model → writes words + grammar back.
    │                 ★ API keys live here (Firebase Secrets), never on a phone ★
    └─ Firestore .... users/{uid}/photos/{id}: {status, scene, concepts, grammar, ...}
    ▲
    │  Study/Quiz/Data/Compendium panels read live via onSnapshot
  Phone
```

### File map

```
lens-v2/
├── firebase.json / .firebaserc / firestore.rules / storage.rules
├── functions/index.js       # the vision Cloud Function: model call, retry guard, cost telemetry,
│                             # grammar generation, compendium harvest
├── functions/grammar-ids.json  # the locked 200-point grammar taxonomy (per-language, CEFR-tagged)
└── public/
    ├── index.html            # PWA shell: login · capture · study · quiz · data · compendium
    ├── manifest.webmanifest  # installable PWA
    ├── sw.js                 # app-shell cache (offline-open; capture handled by the queue)
    ├── quiz-plus.html        # experimental quiz surface (gated to one account today)
    └── js/
        ├── config.js         # Firebase web config (public IDs) + the allowlist + downscale targets
        ├── queue.js           # IndexedDB offline queue — "never lose a photo"
        ├── app.js             # auth · downscale · capture→upload · live vocab/grammar
        ├── study.js           # flip-card deck, 7-language any-to-any + TTS
        ├── quiz.js            # active-recall MCQ, writes graded results to users/{uid}/reviews
        ├── data.js            # per-user stats panel + over-time bar charts (no chart library)
        ├── compendium.js      # admin-only viewer over the pooled, de-identified vocab/grammar
        ├── clicktarget.js     # bbox-driven click-quiz interaction (v1 parity)
        └── roman.js           # romanization helpers for non-Latin scripts
```

### Data model (Firestore)

`users/{uid}/photos/{photoId}`:

| field | written by | meaning |
| --- | --- | --- |
| `uid` | client | owner, matches auth uid (enforced by rules) |
| `status` | both | `queued` → `processing` → `done` \| `needs_reprocessing` |
| `scene` | function | one-line English description |
| `concepts` | function | `[{pos, langs:{en,ko,ja,es,fr,zh,...}}]` |
| `grammar` | function | per-language tagged example sentences, `id` + CEFR |
| `model`, `attempts`, `inputTokens`, `outputTokens` | function | provenance + cost telemetry |

`users/{uid}/reviews/{reviewId}` — one row per graded quiz answer: word, correct/incorrect,
grammar-point `id` if applicable. This is the keystone the SRS scheduler, data panel, and (planned)
leaderboard all read from.

`compendium_words` / `compendium_grammar` — admin-only, de-duplicated, anonymous pool harvested
from everyone's generated content. **Never includes photos or per-user attribution.**

### Cost control (built in, not an afterthought)

- One model constant in `functions/index.js`; today `claude-sonnet-4-6` (~$0.012/photo), a one-line
  swap to a cheaper model cuts cost ~3x.
- On-device downscale before upload (fewer input tokens).
- Structured output (JSON schema, capped `max_tokens`, low effort).
- Retry guard: the billed vision call retries at most twice on transient errors; a permanently
  failing photo is marked `needs_reprocessing`, never silently re-billed in a loop.
- The real backstop is a hard spend cap set in the Anthropic Console ($50 limit, $25 alert) — code
  guards are the first line, the console cap is the one that can't be bypassed by a bug.

---

## Current status (as of 2026-07-10)

Live and in use by the allowlisted group. Recently shipped: Google-account auth (replacing
email/password), active-recall quiz mode writing to a `reviews` store, a per-user Data panel with
over-time charts, an admin-only Language Compendium harvesting pooled vocab/grammar, and the first
half of grammar generation (per-photo tagged sentences, 6 of 7 languages — Basque is still
content-blocked).

**In active design** (not yet coded): a per-language, per-user **difficulty dial**. Right now every
photo generates vocabulary and grammar at one hardcoded CEFR band regardless of who's looking at
it — a C1 Spanish speaker and an A1 beginner get the same output. The plan (`difficulty-levels-plan.md`,
approved 2026-07-10) filters the grammar-point list server-side by the learner's set level *before*
it reaches the model — filtering the menu, not just prompting the model to behave, because testing
found the model collapses to the easiest point in a list when told "prefer easy ones."

**Backlog, roughly in priority order Kramer set 2026-06-29:** SRS-style spaced repetition on top of
the review store (MVP is close, since reviews already exist), a daily leaderboard for
photos-logged + words-tested, and a "song suggestions from liked artists" bonus feature.

Full design detail lives alongside the code:
- `ROADMAP.md` — the v1/v2/v3 framing and the shared core loop
- `STATUS.md` — decisions register, feature-by-feature status board, deploy state
- `grammar-engine-plan.md` — the grammar curriculum engine: per-language 25-point sequences, the
  per-learner coverage map, the feasibility filter that matches photo content to teachable grammar
- `grammar-affordance-report.md` — the schema a photo must satisfy before a grammar point can be
  taught from it (language-independent, computed once per photo)
- `difficulty-levels-plan.md` — the CEFR-dial design above

---

## Ideas for where this could go

A few directions surfaced from working on this, offered as starting points, not a committed
roadmap:

**Multiplayer / social layer.** Right now every learner's photo stream is fully private — the only
shared surface is the anonymous compendium. There's real design space in making *some* of the loop
social without breaking the privacy model that has to hold for v3 (Berklee students): a shared
"who found this word today" feed scoped to a trip group, a co-op mode where two learners on the
same trip photograph the same scene and compare what each got taught, or a lightweight
challenge/streak mechanic layered onto the leaderboard that's already backlogged. This is squarely
in David's territory — multiplayer game design for learning, and making a live leaderboard or
co-op mode feel like play rather than a scoreboard, is exactly the kind of design decision the
current codebase hasn't had to make yet (it's been single-player-with-a-shared-backend so far).

**Data syncing with lesson plans / assessment.** v3 (the Berklee-scale version) is explicitly the
target for exactly this: the `reviews` collection already banks per-word, per-grammar-point
correct/incorrect data per user, and the coverage-map design in `grammar-engine-plan.md` §3B is
essentially a per-student mastery ledger sitting one layer below a gradebook. Nothing currently
reads that data out into anything resembling a lesson plan or an instructor-facing assessment view
— today the only aggregate view is Kramer's own admin compendium, and that's explicitly *anonymous
pooled content*, not per-student progress. If David's systems already have a model for syncing
game-generated mastery data into lesson plans/assessments, that's probably the single highest-
leverage thing to compare notes on before v3 gets built, since the Firestore schema for it doesn't
exist yet and could be shaped up front instead of retrofitted.

**Mobile touch precision** — the bbox click-quiz interaction (`clicktarget.js`) is a strong hook (you
learn "taxi" by clicking the taxi in your own photo) but tap-target precision on small screens is
rough today. Anyone who's solved tap-zone precision on real devices, this is a good place to apply
it.

**More languages** — the pipeline is language-agnostic; French and Basque are the obvious next
adds (both languages Kramer is actively studying), but the grammar taxonomy tops out thin at B2 for
most languages and doesn't exist at all for Basque yet, so that's real content work, not just a
config change.

**Cross-system data share** — the per-photo JSON schema here is simple and self-contained. If it's
useful for any of your systems to pull from (or push into) Kramer's vocab/grammar decks, that seems
like a natural use of this channel — happy to open up a read path or an export format if there's a
concrete use for it on your end.

---

*Maintained by Mason (PM) on Kramer's side. Questions or requests back through this repo, same as
everything else on this channel.*

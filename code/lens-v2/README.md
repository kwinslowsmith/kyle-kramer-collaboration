# Lens v2 — multi-user, Firebase

The Spain-trip build: Kramer + 3 friends each log in on their phones, upload
photos, get their own vocabulary back from a server-side vision call, and review
it in a study mode. No-signal trail photos are never lost. Installable PWA.

> v1 (the personal, single-user file-watcher app) lives one folder up in
> `korean-photo-slideshow/` and is documented in its `README.md`. This is the
> v2 cloud build. The plan is in `../ROADMAP.md`; status in `../STATUS.md`.

## What ships in this build (the locked endpoint)

> Done when Kramer + 3 friends can each log into Lens on their phone, upload a
> photo, get their own vocabulary back from a Cloud Function (API key
> server-side), review it in a study mode, and a no-signal photo is never lost.

**In scope:** email/password auth (4 pre-created accounts) · on-device downscale
· offline capture queue (IndexedDB) · server-side vision call (key in the Cloud
Function) · per-user vocabulary in Firestore · Random flip-card study mode
(7-language any-to-any + TTS) · installable PWA.

**Deferred to v2.x** (additive, rides on this working loop): the grammar layer /
Grammar Cloze mode · Basque · bbox-driven study modes (Click Target, Word Hunt,
Gallery) · v3 student-privacy hardening.

## Architecture

```
  Phone (installed PWA)
    │  take/choose photo → downscale on device (~1024px, ~200KB)
    │  → save to IndexedDB queue (photo is now SAFE, signal or not)
    ▼
  Firebase
    ├─ Auth ......... 4 pre-created email/password logins
    ├─ Storage ...... users/{uid}/photos/{photoId}.jpg
    ├─ Cloud Fn ..... onCreate(users/{uid}/photos/{id}) → reads image →
    │                 calls the vision model → writes words back.
    │                 ★ ANTHROPIC API KEY LIVES HERE, never on a phone ★
    └─ Firestore .... users/{uid}/photos/{id}: {status, scene, concepts, ...}
    ▲
    │  Study mode reads ONLY this user's `done` photos (live onSnapshot)
  Phone
```

## Cost control (built in)

- **Single model constant** — `MODEL` in `functions/index.js`. Today: `claude-sonnet-4-6`
  (~$0.012/photo). One-line swap to `claude-haiku-4-5` (~$0.004/photo) to cut ~3x.
- **On-device downscale before upload** — fewer input tokens = cheaper + faster.
- **Structured output** (`output_config.format` JSON schema) — guaranteed valid
  JSON, `max_tokens` capped, `effort: "low"`.
- **Retry guard** — the billed vision call is retried at most twice, transient
  errors only. A permanently-failing photo is marked `needs_reprocessing` and the
  function returns normally. It can never loop the vision call and re-bill.
- **The real backstop is the hard spend cap in the Anthropic Console** ($50 limit,
  $25 alert). Set it before any friend touches the app — see `SETUP.md`.

## Files

```
lens-v2/
├── firebase.json / .firebaserc / firestore.rules / storage.rules
├── functions/index.js         # the vision Cloud Function (key server-side, retry guard)
└── public/
    ├── index.html             # PWA shell: login · capture · study
    ├── manifest.webmanifest    # installable
    ├── sw.js                  # app-shell cache (offline OPEN; capture handled by the queue)
    ├── css/app.css
    └── js/
        ├── config.js          # Firebase web config (public) + downscale targets
        ├── queue.js           # IndexedDB offline queue — "never lose a photo"
        ├── app.js             # auth · downscale · capture→upload · live vocab
        └── study.js           # Random flip-card deck (v1 parity), 7-lang + TTS
```

## Data model (Firestore)

`users/{uid}/photos/{photoId}`:

| field | written by | meaning |
| --- | --- | --- |
| `uid` | client | owner (matches the auth uid; enforced by rules) |
| `status` | both | `queued` → `processing` → `done` \| `needs_reprocessing` |
| `imagePath` | client | Storage path of the downscaled image |
| `scene` | function | one-line English description |
| `concepts` | function | array of `{pos, langs:{en,ko,ja,es,fr,zh:{word,reading,example}}}` |
| `model`, `attempts`, `inputTokens`, `outputTokens` | function | provenance + cost telemetry |
| `createdAt`, `processedAt` | both | timestamps |

## Run it locally (emulators, no cost)

```bash
cd lens-v2
npm --prefix functions install
firebase emulators:start
# open http://localhost:5000 — needs config.js filled (or emulator auto-config)
```

Setup, deploy, accounts, and the spend cap are all in **`SETUP.md`**.

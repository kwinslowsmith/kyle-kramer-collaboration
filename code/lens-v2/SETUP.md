# Lens v2 — Setup (the hands-on steps)

These are the steps that need *your* hands (account creation, billing, secrets,
spend cap). The code is already written. Same Firebase account as Keystroke
Derby: **kramermusician@gmail.com**. Do step 6 (the spend cap) BEFORE any friend
touches the app — that's the real backstop.

You'll run these from `korean-photo-slideshow/lens-v2/`.

---

## 1. Firebase project + CLI

```bash
firebase login            # if not already: type `! firebase login` in the prompt to do it in this session
firebase projects:create lens-v2 --display-name "Lens"   # or reuse an existing id; update .firebaserc to match
firebase use lens-v2
```

Cloud Functions require the **Blaze (pay-as-you-go) plan**. Enable it in the
console: <https://console.firebase.google.com/project/lens-v2/usage/details>.
Blaze has a generous free tier; at 4 users the Firebase side is effectively free.

## 2. Enable the services

In the Firebase console for the project:
- **Authentication** → Sign-in method → enable **Email/Password**.
- **Firestore Database** → create (production mode; our rules lock it down).
- **Storage** → get started (our rules lock it down).

## 3. Create a web app + paste its config

```bash
firebase apps:create web "Lens Web"
firebase apps:sdkconfig web    # prints the config object
```

Copy the values into `public/js/config.js` (replace every `REPLACE_ME`). These
are public identifiers, not secrets.

## 4. Set the Anthropic API key as a server-side secret

This is the key the Cloud Function uses. It NEVER goes in client code or git.

> NOTE: The project `.env` only has `GEMINI_API_KEY` — there is no Anthropic key
> there yet. Create one at <https://console.anthropic.com/settings/keys> (this is
> a metered API-credit key, separate from your Max subscription) and set the spend
> cap in the same console session (step 6) before pasting it here.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# paste the new key when prompted
```

## 5. Install deps + deploy

```bash
npm --prefix functions install
firebase deploy --only firestore:rules,storage:rules,functions,hosting
```

Hosting URL will be `https://lens-v2.web.app`. Add it to the home screen on each
phone (Share → Add to Home Screen) to install the PWA.

## 6. ★ Set the hard spend cap (do this FIRST, before sharing) ★

In the **Anthropic Console** (console.anthropic.com), Billing → Usage limits:
- **Monthly usage limit: $50** (hard cap — requests stop above it).
- **Email alert at: $25.**

Real usage for a whole trip is ~$2–3, so this only ever fires if something is
wrong. It's the wall behind the in-code retry guard.

## 7. Create the 4 trip accounts

Authentication → Users → Add user, four times (you + 3 friends), each with an
email + a password you share with them. No open signup — these four are it.

```bash
# or from the CLI, repeat per person:
# (console "Add user" is easiest; there's no first-party CLI create-user command)
```

## 8. Smoke test before the trip

1. Open `https://lens-v2.web.app` on a phone, sign in as yourself.
2. Take a photo. Within ~10s a card deck appears with vocabulary.
3. Turn on airplane mode, take 2 photos → status says "waiting to upload."
4. Turn signal back on → they upload and process automatically. **No photo lost.**
5. Sign in as a friend on another phone → you see only your own words, they see
   only theirs.
6. Check the Anthropic Console usage ticked up by pennies, not dollars.

If all six pass, the v2 core loop is trip-ready.

---

### Swapping the vision model later
Edit `MODEL` in `functions/index.js` (e.g. to `claude-haiku-4-5` for ~3x lower
cost) and `firebase deploy --only functions`. One line.

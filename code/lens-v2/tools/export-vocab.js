#!/usr/bin/env node
/**
 * export-vocab.js — pull MY OWN lens-v2 vocabulary out of Firestore into a flat
 * JSON file the Pebble watch builders can read.
 *
 * "My account only": this authenticates with the Firebase Admin SDK (which can
 * read everything), then deliberately scopes the read to a SINGLE user's
 * subtree — users/{uid}/photos — resolving uid from Kramer's email. No other
 * user's data is ever touched. The anonymous shared `compendium_*` pool is
 * intentionally NOT used here, because the watch decks should reflect the words
 * Kramer himself photographed.
 *
 * Auth (one-time setup, no gcloud needed): download a service-account key from
 *   Firebase console → Project settings → Service accounts → Generate new
 *   private key, and save it to  ~/.kramos-lens/serviceAccount.json
 * (kept outside the repo/vault, never committed). The script also honours
 * GOOGLE_APPLICATION_CREDENTIALS and falls back to Application Default
 * Credentials if you ever do install gcloud.
 *
 * Output: ~/Dropbox/KRAMOS/lens-vocab/lens-vocab.json
 *
 * Usage:
 *   node tools/export-vocab.js                       # default email below
 *   node tools/export-vocab.js --email you@x.com     # override account
 *   node tools/export-vocab.js --uid <firebase-uid>  # skip email lookup
 *   node tools/export-vocab.js --out /path/file.json # override destination
 */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");

// firebase-admin lives in the Cloud Functions install — reuse it.
const ADMIN_PATH = path.join(__dirname, "..", "functions", "node_modules", "firebase-admin");
let admin;
try {
  admin = require(ADMIN_PATH);
} catch (e) {
  console.error("Could not load firebase-admin from " + ADMIN_PATH);
  console.error("Run `npm install` in lens-v2/functions first.");
  process.exit(1);
}

const PROJECT_ID = "lens-v2";
const DEFAULT_EMAIL = "kramermusician@gmail.com";

// ---- args ----
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const EMAIL = argVal("--email") || DEFAULT_EMAIL;
const UID_OVERRIDE = argVal("--uid");
const OUT = argVal("--out") ||
  path.join(os.homedir(), "Dropbox", "KRAMOS", "lens-vocab", "lens-vocab.json");

// ---- credentials ----
function resolveCredential() {
  // 1) explicit env (standard Google convention)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS &&
      fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return admin.credential.cert(
      require(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)));
  }
  // 2) the KRAMOS convention: local-only key folder, never in git/vault
  const local = path.join(os.homedir(), ".kramos-lens", "serviceAccount.json");
  if (fs.existsSync(local)) {
    return admin.credential.cert(require(local));
  }
  // 3) Application Default Credentials (works if you've run gcloud ADC login)
  try {
    return admin.credential.applicationDefault();
  } catch (e) {
    return null;
  }
}

async function main() {
  const cred = resolveCredential();
  if (!cred) {
    console.error("\nNo Firebase credentials found.");
    console.error("Fix: download a service-account key and save it to:");
    console.error("    ~/.kramos-lens/serviceAccount.json");
    console.error("(Firebase console → Project settings → Service accounts → Generate new private key)\n");
    process.exit(2);
  }
  admin.initializeApp({ credential: cred, projectId: PROJECT_ID });

  const db = admin.firestore();

  // Resolve the uid for MY account only.
  let uid = UID_OVERRIDE;
  if (!uid) {
    try {
      const user = await admin.auth().getUserByEmail(EMAIL);
      uid = user.uid;
    } catch (e) {
      console.error("Could not resolve uid for " + EMAIL + ": " + e.message);
      console.error("Pass --uid <firebase-uid> explicitly if needed.");
      process.exit(3);
    }
  }
  console.error("Account: " + EMAIL + "  uid=" + uid);

  // Read ONLY this user's processed photos.
  const snap = await db.collection("users").doc(uid).collection("photos")
    .where("status", "==", "done").get();
  console.error("Processed photos: " + snap.size);

  // Flatten + de-dupe concepts by English headword (lowercased).
  const byKey = new Map();
  let rawConcepts = 0;
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const concepts = Array.isArray(data.concepts) ? data.concepts : [];
    for (const c of concepts) {
      rawConcepts++;
      const langs = c && c.langs ? c.langs : null;
      if (!langs || !langs.en || !langs.en.word) continue;
      const key = String(langs.en.word).trim().toLowerCase();
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          pos: c.pos || "",
          photoId: doc.id,
          langs: langs,
        });
      }
    }
  });

  const concepts = Array.from(byKey.values())
    .sort((a, b) => a.langs.en.word.localeCompare(b.langs.en.word));

  const payload = {
    generated: new Date().toISOString(),
    source: "lens-v2 users/{uid}/photos (status=done)",
    email: EMAIL,
    uid: uid,
    photoCount: snap.size,
    rawConcepts: rawConcepts,
    conceptCount: concepts.length,
    concepts: concepts,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.error("Wrote " + concepts.length + " unique concepts -> " + OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });

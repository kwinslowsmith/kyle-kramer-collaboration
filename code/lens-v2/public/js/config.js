/**
 * Firebase web config. These values are PUBLIC (they identify the project, they
 * are not secrets — security lives in the Auth + Firestore/Storage rules). The
 * Anthropic API key is NOT here; it lives server-side in the Cloud Function.
 *
 * Fill these in after `firebase apps:create web` (see SETUP.md). Until then the
 * app shows a clear "not configured yet" message instead of a cryptic error.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCL0YEBjRRzam0tuaXwP5nUQ8Aa7tdcw3U",
  authDomain: "lens-v2.firebaseapp.com",
  projectId: "lens-v2",
  storageBucket: "lens-v2.firebasestorage.app",
  messagingSenderId: "169781960240",
  appId: "1:169781960240:web:f7642d73682173a180d7f5",
};

export const IS_CONFIGURED = !Object.values(firebaseConfig).includes("REPLACE_ME");

// The closed guest list. Only these Google accounts may use Lens — this is what
// keeps "sign in with Google" from being open signup (which would let strangers
// burn the API budget). Enforced both client-side (UX) AND in the Firestore /
// Storage security rules (the real gate). Keep all three in sync; lowercase.
// NOTE: if you change this list, also update the email arrays in firestore.rules
// and storage.rules, then redeploy rules.
export const ALLOWLIST = [
  "kramermusician@gmail.com",
  "zacharyjenglish@gmail.com",
  "benhill7@gmail.com",
  "teacherdavidgreen@gmail.com",
  "kwinslowsmith@gmail.com",
  "karolzbuczek@gmail.com",
  // 5 Berklee student accounts redacted for this public share (real emails
  // live in the private repo copy) — placeholders kept so the array shape /
  // count in firestore.rules and storage.rules stays legible:
  "STUDENT_EMAIL_1@berklee.edu",
  "STUDENT_EMAIL_2@berklee.edu",
  "STUDENT_EMAIL_3@berklee.edu",
  "STUDENT_EMAIL_4@berklee.edu",
  "STUDENT_EMAIL_5@berklee.edu",
  "henryfrederickwright@gmail.com",
].map((e) => e.toLowerCase());

// Admin(s) — who may open the Language Compendium viewer. The compendium pools
// every user's generated vocab + grammar (NEVER their photos); only these
// accounts can read it. This is a UX gate only; the real gate is the
// `isAdmin()` check in firestore.rules. Keep the two in sync; lowercase.
export const ADMIN_EMAILS = [
  "kramermusician@gmail.com",
].map((e) => e.toLowerCase());

// Quiz Plus (experimental) — who sees the topbar button and may use the page
// (quiz-plus.html re-checks this list itself). A personal experiment for now;
// widen or drop the gate if it ships to everyone. Lowercase.
export const QUIZ_PLUS_EMAILS = [
  "kramermusician@gmail.com",
].map((e) => e.toLowerCase());

// Downscale targets — keep images small for cost + speed (smaller image =
// fewer input tokens). Matches v1's deploy.py ~1024px long-edge JPEG.
export const DOWNSCALE = { maxEdge: 1024, quality: 0.8, targetBytes: 220 * 1024 };

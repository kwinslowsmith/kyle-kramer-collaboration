/**
 * Lens v2 — app wiring.
 *
 * Flow: sign in -> capture a photo -> downscale on device -> save to the offline
 * queue -> upload (Storage + Firestore `queued` record) -> the Cloud Function
 * fills in vocabulary -> it streams live into Study mode, scoped to this user.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig, IS_CONFIGURED, DOWNSCALE, ALLOWLIST, QUIZ_PLUS_EMAILS } from "./config.js";
import { enqueue, flush, list as queueList } from "./queue.js";
import { initStudy, setStudyPhotos, setDeleteHandler } from "./study.js";
import { initQuiz, setQuizPhotos, setReviewHandler, showQuiz } from "./quiz.js";
import { initClickTarget, setClickTargetPhotos, showClickTarget } from "./clicktarget.js";
import { initCompendium, setupCompendium } from "./compendium.js";
import { initData, setupData, setDataPhotos } from "./data.js";

const $ = (s) => document.querySelector(s);

if (!IS_CONFIGURED) {
  $("#unconfigured").hidden = false;
  $("#app").hidden = true;
  throw new Error("Firebase not configured — fill in public/js/config.js (see SETUP.md).");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null;

// ── Auth (Google sign-in, restricted to the allowlist) ──────────────────────
const provider = new GoogleAuthProvider();

$("#google-signin").addEventListener("click", async () => {
  $("#login-error").textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Installed PWAs / some mobile browsers block popups — fall back to redirect.
    if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(err.code)) {
      try { await signInWithRedirect(auth, provider); return; } catch (e2) { console.warn(e2); }
    }
    $("#login-error").textContent = "Sign-in failed. Try again.";
    console.warn(err);
  }
});
$("#logout").addEventListener("click", () => signOut(auth));
$("#quizplus-toggle").addEventListener("click", () => { location.href = "./quiz-plus.html"; });

// Catch the result of a redirect-based sign-in on page load.
getRedirectResult(auth).catch((err) => console.warn("redirect result:", err));

function allowed(user) {
  return user && user.email && ALLOWLIST.includes(user.email.toLowerCase());
}

onAuthStateChanged(auth, (user) => {
  // Closed guest list: a signed-in but non-allowlisted Google account is bounced
  // immediately (and the security rules block them server-side regardless).
  if (user && !allowed(user)) {
    $("#login-error").textContent = `${user.email} isn't on the Lens guest list.`;
    signOut(auth);
    currentUser = null;
    $("#login-view").hidden = false;
    $("#main-view").hidden = true;
    return;
  }
  currentUser = user;
  $("#login-view").hidden = !!user;
  $("#main-view").hidden = !user;
  // Show/hide the admin-only Compendium toggle (real gate is firestore.rules).
  setupCompendium(db, user);
  // Quiz Plus (experimental) — button only for the emails in QUIZ_PLUS_EMAILS;
  // the page itself re-checks the same list.
  $("#quizplus-toggle").hidden =
    !(user && user.email && QUIZ_PLUS_EMAILS.includes(user.email.toLowerCase()));
  // Per-user Data panel — visible to every signed-in user.
  setupData(db, user);
  if (user) {
    $("#who").textContent = user.email;
    watchPhotos(user.uid);
    drainQueue();
  }
});

// ── On-device downscale (smaller image = fewer tokens = cheaper + faster) ────
async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, DOWNSCALE.maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Step quality down until under target bytes (or floor at 0.5).
  let quality = DOWNSCALE.quality;
  let blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  while (blob && blob.size > DOWNSCALE.targetBytes && quality > 0.5) {
    quality -= 0.1;
    blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  }
  return blob;
}

// ── Capture -> queue -> upload ───────────────────────────────────────────────
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // allow re-picking the same file
  if (!file) return;
  setStatus("Saving photo…");
  try {
    const blob = await downscale(file);
    await enqueue(blob);            // <- on disk BEFORE any network call. Now it's safe.
    setStatus("Saved. Uploading when online…");
    await drainQueue();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't process that photo. It may be an unsupported format.");
  }
});

// Upload one downscaled blob: Storage object + Firestore `queued` record.
async function uploadOne(blob) {
  const uid = currentUser.uid;
  const photoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const imagePath = `users/${uid}/photos/${photoId}.jpg`;
  await uploadBytes(storageRef(storage, imagePath), blob, { contentType: "image/jpeg" });
  await setDoc(doc(db, "users", uid, "photos", photoId), {
    uid,
    status: "queued",
    imagePath,
    createdAt: serverTimestamp(),
  });
}

async function drainQueue() {
  if (!currentUser) return;
  const { uploaded, remaining } = await flush(uploadOne);
  const queued = await queueList();
  const failed = queued.filter((q) => q.status === "failed").length;
  if (remaining === 0) setStatus("All photos uploaded.");
  else setStatus(`${remaining} photo(s) waiting to upload${failed ? `, ${failed} need attention` : ""}.`);
  if (uploaded) console.log(`Uploaded ${uploaded} queued photo(s).`);
}

window.addEventListener("online", drainQueue);

function setStatus(msg) { $("#capture-status").textContent = msg; }

// ── Live vocabulary (this user's photos only) ───────────────────────────────
const urlCache = new Map(); // imagePath -> download URL (resolve once, reuse)

async function resolveImageUrl(imagePath) {
  if (!imagePath) return null;
  if (!urlCache.has(imagePath)) {
    try { urlCache.set(imagePath, await getDownloadURL(storageRef(storage, imagePath))); }
    catch (e) { console.warn("image url failed", imagePath, e); urlCache.set(imagePath, null); }
  }
  return urlCache.get(imagePath);
}

// ── Delete (owner only; clears Storage object + Firestore doc) ───────────────
// Storage first, then Firestore. If the image is already gone we still drop the
// doc — a missing object shouldn't strand a record. The live onSnapshot listener
// updates the deck automatically once the doc disappears.
async function deletePhoto(photoId, imagePath) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  if (imagePath) {
    try { await deleteObject(storageRef(storage, imagePath)); }
    catch (e) { if (e.code !== "storage/object-not-found") console.warn("storage delete:", e); }
    urlCache.delete(imagePath);
  }
  await deleteDoc(doc(db, "users", uid, "photos", photoId));
}

// Wipe ALL of this user's photos regardless of status (done / queued / parked),
// so "start fresh" really means empty. Reads the whole subcollection once and
// deletes each doc + its object.
async function deleteAllPhotos() {
  if (!currentUser) return 0;
  const uid = currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "photos"));
  const docs = [];
  snap.forEach((d) => docs.push({ id: d.id, imagePath: d.data().imagePath }));
  for (const d of docs) await deletePhoto(d.id, d.imagePath);
  return docs.length;
}

// Re-queue any photo the Cloud Function parked as `needs_reprocessing` (e.g. a
// transient vision error). The function triggers on document CREATE only, so we
// can't just flip status back to 'queued' — we create a FRESH queued doc pointing
// at the SAME image (still in Storage; we never touch it) and delete the stale
// parked doc. onCreate fires and the photo runs through the pipeline again.
async function reprocessParked() {
  if (!currentUser) return 0;
  const uid = currentUser.uid;
  const snap = await getDocs(query(
    collection(db, "users", uid, "photos"), where("status", "==", "needs_reprocessing")));
  const parked = [];
  snap.forEach((d) => { const p = d.data(); if (p.imagePath) parked.push({ id: d.id, imagePath: p.imagePath }); });
  for (const p of parked) {
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, "users", uid, "photos", newId), {
      uid, status: "queued", imagePath: p.imagePath, createdAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, "users", uid, "photos", p.id));
  }
  return parked.length;
}

setDeleteHandler(deletePhoto);

// ── Quiz result write-back (per word; the SRS / leaderboard grade store) ─────
// One doc per word, id `lang__word`, so repeated quizzing accumulates rather
// than piles up rows. Atomic increments keep the counts correct even if two
// quizzes race. merge:true so the first answer creates it and later ones add to
// it. Storage object path uses '/', so slashes are scrubbed from the doc id.
async function recordReview(lang, word, correct, meta) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const id = `${lang}__${word}`.toLowerCase().replace(/\//g, "-");
  await setDoc(doc(db, "users", uid, "reviews", id), {
    uid, lang, word,
    reading: meta?.reading || "",
    meaning: meta?.meaning || "",
    seen: increment(1),
    correct: increment(correct ? 1 : 0),
    lastResult: correct,
    lastSeen: serverTimestamp(),
  }, { merge: true });
}
setReviewHandler(recordReview);

// ── Cards / Quiz / Click Target mode toggle ──────────────────────────────────
const modeTabs = document.querySelectorAll(".mode-tab");
function setMode(mode) {
  modeTabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  $("#cards-mode").hidden = mode !== "cards";
  $("#quiz-mode").hidden = mode !== "quiz";
  $("#clicktarget-mode").hidden = mode !== "clicktarget";
  showQuiz(mode === "quiz");
  showClickTarget(mode === "clicktarget");
}
modeTabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

// "Clear all" — two-tap confirm so a stray click can't wipe the collection.
let clearArmed = false;
const clearBtn = $("#clear-all");
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!clearArmed) {
      clearArmed = true;
      clearBtn.textContent = "Tap again to delete ALL photos";
      clearBtn.classList.add("danger");
      setTimeout(() => { clearArmed = false; clearBtn.textContent = "Clear all photos"; clearBtn.classList.remove("danger"); }, 4000);
      return;
    }
    clearArmed = false;
    clearBtn.classList.remove("danger");
    clearBtn.disabled = true;
    clearBtn.textContent = "Clearing…";
    try {
      const n = await deleteAllPhotos();
      setStatus(`Cleared ${n} photo${n === 1 ? "" : "s"}. Fresh start.`);
    } catch (e) {
      console.error(e);
      setStatus("Couldn't clear photos. Try again.");
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = "Clear all photos";
    }
  });
}

const reprocessBtn = $("#reprocess");
if (reprocessBtn) {
  reprocessBtn.addEventListener("click", async () => {
    reprocessBtn.disabled = true;
    const label = reprocessBtn.textContent;
    reprocessBtn.textContent = "Re-queuing…";
    try {
      const n = await reprocessParked();
      setStatus(n ? `Re-queued ${n} photo${n === 1 ? "" : "s"}. Processing…` : "Nothing to reprocess.");
    } catch (e) {
      console.error(e);
      setStatus("Couldn't reprocess. Try again.");
    } finally {
      reprocessBtn.disabled = false;
      reprocessBtn.textContent = label;
    }
  });
}

function watchPhotos(uid) {
  const q = query(collection(db, "users", uid, "photos"), where("uid", "==", uid));
  onSnapshot(q, async (snap) => {
    const photos = [];
    let pending = 0, parked = 0;
    snap.forEach((d) => {
      const p = d.data();
      if (p.status === "done") photos.push({ id: d.id, ...p });
      else if (p.status === "needs_reprocessing") parked++;
      else pending++;
    });
    // Attach the photo's download URL so the study deck can show the image.
    await Promise.all(photos.map(async (p) => { p.imageUrl = await resolveImageUrl(p.imagePath); }));
    photos.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setStudyPhotos(photos);
    setQuizPhotos(photos);
    setClickTargetPhotos(photos);
    setDataPhotos(photos);
    $("#processing-note").textContent =
      (pending ? `${pending} processing… ` : "") +
      (parked ? `${parked} need reprocessing.` : "");
    const rb = $("#reprocess");
    if (rb) rb.hidden = parked === 0;
    $("#count").textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  });
}

initStudy();
initQuiz();
initClickTarget();
initCompendium();
initData();

/**
 * Offline-first capture queue (IndexedDB).
 *
 * THE ONE HARD CONSTRAINT: a photo is written to disk here BEFORE any network
 * call. Shoot all day on a Basque mountainside with no bars — every photo is
 * safe in IndexedDB. When the phone is back on wifi, flush() uploads them.
 *
 * A photo leaves the queue ONLY after a confirmed Storage upload + Firestore
 * record. Upload retries are capped so a genuinely corrupt blob can't spin
 * forever — after MAX_UPLOAD_ATTEMPTS it's marked `failed` and kept locally
 * (surfaced to the user), never silently dropped.
 */

const DB_NAME = "lens-queue";
const STORE = "pending";
const MAX_UPLOAD_ATTEMPTS = 6;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Write a captured photo to disk immediately. Returns the local queue id. */
export async function enqueue(blob) {
  const db = await openDB();
  const id = `${Date.now()}-${Math.floor(performance.now())}`;
  const entry = { id, blob, attempts: 0, status: "pending", createdAt: Date.now() };
  await new Promise((resolve, reject) => {
    const r = tx(db, "readwrite").put(entry);
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  });
  return id;
}

export async function list() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = tx(db, "readonly").getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function remove(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = tx(db, "readwrite").delete(id);
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
  });
}

async function mark(id, patch) {
  const db = await openDB();
  const store = tx(db, "readwrite");
  return new Promise((resolve, reject) => {
    const g = store.get(id);
    g.onsuccess = () => {
      const e = g.result;
      if (!e) return resolve();
      Object.assign(e, patch);
      const p = store.put(e);
      p.onsuccess = resolve;
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
}

/**
 * Try to upload every pending photo via `uploadFn(blob)`.
 * `uploadFn` must fully persist the photo (Storage + Firestore) or throw.
 * Resolves to { uploaded, remaining }. Safe to call repeatedly / on reconnect.
 */
export async function flush(uploadFn) {
  if (!navigator.onLine) return { uploaded: 0, remaining: (await list()).length };
  const entries = await list();
  let uploaded = 0;
  for (const e of entries) {
    if (e.status === "failed") continue; // parked — needs manual attention, but still on disk
    try {
      await uploadFn(e.blob);
      await remove(e.id);
      uploaded++;
    } catch (err) {
      const attempts = (e.attempts || 0) + 1;
      if (attempts >= MAX_UPLOAD_ATTEMPTS) {
        await mark(e.id, { attempts, status: "failed", error: String(err && err.message || err) });
        console.warn(`Queue ${e.id} parked as failed after ${attempts} tries:`, err);
      } else {
        await mark(e.id, { attempts });
        console.warn(`Queue ${e.id} upload failed (try ${attempts}):`, err);
      }
    }
  }
  const remaining = (await list()).length;
  return { uploaded, remaining };
}

export const QUEUE_LIMITS = { MAX_UPLOAD_ATTEMPTS };

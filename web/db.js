/**
 * Minimal IndexedDB wrapper for persisting voice recordings (as Blobs)
 * across page reloads.
 */
const RecordingsDB = (() => {
  const DB_NAME = "voice-recorder-db";
  const DB_VERSION = 1;
  const STORE_NAME = "recordings";

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function withStore(mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function addRecording(record) {
    await withStore("readwrite", (store) => store.put(record));
    return record;
  }

  async function updateRecording(id, changes) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) return resolve(null);
        const updated = { ...existing, ...changes };
        store.put(updated);
        resolve(updated);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function deleteRecording(id) {
    return withStore("readwrite", (store) => store.delete(id));
  }

  async function getAllRecordings() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  return { addRecording, updateRecording, deleteRecording, getAllRecordings };
})();

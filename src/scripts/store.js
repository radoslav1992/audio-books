/**
 * Local persistence layer — favorites + listening progress.
 *
 * Everything lives in localStorage so the app stays completely client-side
 * with zero accounts and zero backend. All writes are defensive: if storage
 * is unavailable (private mode, quota) the app degrades gracefully instead
 * of throwing.
 */

const FAV_KEY = 'vintage_audiobooks.favorites.v1';
const PROGRESS_KEY = 'vintage_audiobooks.progress.v1';

/* A custom event lets multiple parts of a page react to store changes. */
const CHANGE_EVENT = 'vab:store-change';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
    return true;
  } catch {
    return false;
  }
}

export function onStoreChange(handler) {
  window.addEventListener(CHANGE_EVENT, handler);
  // React to changes from other tabs too.
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/* ----------------------------- favorites ----------------------------- */

/** @returns {Array<{id,title,author,cover,addedAt}>} newest first */
export function getFavorites() {
  const list = read(FAV_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(id) {
  return getFavorites().some((b) => b.id === id);
}

export function addFavorite(book) {
  const list = getFavorites().filter((b) => b.id !== book.id);
  list.unshift({
    id: book.id,
    title: book.title,
    author: book.author,
    cover: book.cover,
    addedAt: Date.now(),
  });
  write(FAV_KEY, list);
}

export function removeFavorite(id) {
  write(FAV_KEY, getFavorites().filter((b) => b.id !== id));
}

/** Toggle and return the new state (true = now a favorite). */
export function toggleFavorite(book) {
  if (isFavorite(book.id)) {
    removeFavorite(book.id);
    return false;
  }
  addFavorite(book);
  return true;
}

/* ----------------------------- progress ------------------------------ */

/**
 * Progress shape, keyed by book id:
 * {
 *   [id]: {
 *     id, title, author, cover,
 *     chapterIndex, chapterTitle,
 *     position,      // seconds into the current chapter
 *     chapterCount,
 *     updatedAt
 *   }
 * }
 */
function readProgressMap() {
  const map = read(PROGRESS_KEY, {});
  return map && typeof map === 'object' ? map : {};
}

export function getProgress(id) {
  return readProgressMap()[id] || null;
}

/** All in-progress books, most recently played first. */
export function getAllProgress() {
  return Object.values(readProgressMap()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function saveProgress(entry) {
  if (!entry || !entry.id) return;
  const map = readProgressMap();
  map[entry.id] = { ...map[entry.id], ...entry, updatedAt: Date.now() };
  write(PROGRESS_KEY, map);
}

export function clearProgress(id) {
  const map = readProgressMap();
  delete map[id];
  write(PROGRESS_KEY, map);
}

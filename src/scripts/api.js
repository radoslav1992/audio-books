/**
 * Internet Archive client — 100% browser-side, no proxy, no API key.
 *
 * Why the Internet Archive instead of librivox.org/api?
 *   The LibriVox public API does not send CORS headers, so it cannot be
 *   called from a static, client-only site. Every LibriVox recording is,
 *   however, mirrored in the Internet Archive's `librivoxaudio` collection,
 *   and the Archive's search + metadata endpoints DO support CORS. Each item
 *   also carries a `Project Gutenberg` text-source link, giving us exactly
 *   the LibriVox-audio + Gutenberg-text pairing we want.
 */

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata/';
const COLLECTION = 'librivoxaudio';

/** Fields we ask the search API to return for each result. */
const FIELDS = [
  'identifier',
  'title',
  'creator',
  'description',
  'downloads',
  'avg_rating',
  'year',
  'runtime',
  'subject',
];

/** Build a cover-image URL for an Archive item (square thumbnail service). */
export function coverUrl(identifier) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

/** Build a streamable audio URL for a file within an item. */
export function audioUrl(identifier, fileName) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

/** Public landing page for an item on archive.org. */
export function detailUrl(identifier) {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

/** Normalise the `creator` field, which may be a string or an array. */
export function authorName(creator) {
  if (!creator) return 'Unknown author';
  if (Array.isArray(creator)) return creator.filter(Boolean).join(', ') || 'Unknown author';
  return String(creator);
}

/** Clean LibriVox descriptions: strip HTML tags and boilerplate footers. */
export function cleanDescription(desc) {
  if (!desc) return '';
  let text = Array.isArray(desc) ? desc.join(' ') : String(desc);
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  // Drop the standard "(Summary by ...)" attribution tail if present.
  text = text.replace(/\(?Summary by [^).]*\)?\.?\s*$/i, '').trim();
  return text;
}

/**
 * Search the LibriVox collection.
 *
 * @param {object} opts
 * @param {string} [opts.query]  free-text query (title / author / subject)
 * @param {number} [opts.page=1] 1-based page number
 * @param {number} [opts.rows=24] results per page
 * @param {string} [opts.sort='downloads desc'] Archive sort expression
 * @returns {Promise<{ books: Array, total: number, page: number, rows: number }>}
 */
export async function searchBooks({ query = '', page = 1, rows = 24, sort = 'downloads desc' } = {}) {
  const clauses = [`collection:(${COLLECTION})`, 'mediatype:(audio)'];
  if (query && query.trim()) {
    const q = query.trim().replace(/["\\]/g, ' ');
    clauses.push(`(title:(${q}) OR creator:(${q}) OR subject:(${q}))`);
  }

  const params = new URLSearchParams();
  params.set('q', clauses.join(' AND '));
  FIELDS.forEach((f) => params.append('fl[]', f));
  params.set('rows', String(rows));
  params.set('page', String(page));
  params.set('output', 'json');
  if (sort) sort.split(',').forEach((s) => params.append('sort[]', s.trim()));

  const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  const docs = data?.response?.docs ?? [];

  return {
    books: docs.map((d) => ({
      id: d.identifier,
      title: d.title || d.identifier,
      author: authorName(d.creator),
      description: cleanDescription(d.description),
      downloads: d.downloads ?? 0,
      rating: d.avg_rating ? Number(d.avg_rating) : null,
      year: d.year ?? null,
      runtime: d.runtime || null,
      subjects: Array.isArray(d.subject) ? d.subject : d.subject ? [d.subject] : [],
      cover: coverUrl(d.identifier),
    })),
    total: data?.response?.numFound ?? 0,
    page,
    rows,
  };
}

/**
 * Fetch the full record for one audiobook, including its ordered chapter
 * list (one entry per audio file).
 *
 * @param {string} identifier
 * @returns {Promise<object>}
 */
export async function getBook(identifier) {
  const res = await fetch(`${METADATA_URL}${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error(`Could not load book (${res.status})`);
  const data = await res.json();
  if (!data || !data.metadata) throw new Error('Book not found.');

  const meta = data.metadata;
  const files = Array.isArray(data.files) ? data.files : [];

  // Reduce the many encodings of each section (VBR mp3, 64kb mp3, ogg,
  // spectrogram, fingerprint…) down to one streamable file per chapter.
  // We prefer the 64Kbps CBR MP3: it is LibriVox's streaming standard and,
  // unlike the VBR originals, reports a reliable duration to <audio>.
  const audioExt = /\.(mp3|m4b|m4a|ogg)$/i;
  const formatScore = (name) => {
    const n = name.toLowerCase();
    if (/_64kb\.mp3$/.test(n)) return 5;
    if (/\.mp3$/.test(n)) return 4;
    if (/\.m4[ab]$/.test(n)) return 3;
    if (/\.ogg$/.test(n)) return 2;
    return 1;
  };
  // Strip a bitrate/encoding suffix + extension so a section's different
  // encodings collapse to one key (e.g. foo_01_64kb.mp3 → foo_01).
  const sectionBase = (name) =>
    name
      .toLowerCase()
      .replace(/_(\d+kbs?|vbr)(?=\.[a-z0-9]+$)/, '')
      .replace(/\.[a-z0-9]+$/, '');

  const groups = new Map();
  for (const f of files) {
    if (!f.name || !audioExt.test(f.name) || f.source === 'metadata') continue;
    const trackNum = f.track ? parseInt(String(f.track), 10) : NaN;
    const key = Number.isFinite(trackNum) ? `t${trackNum}` : sectionBase(f.name);
    const prev = groups.get(key);
    if (!prev || formatScore(f.name) > formatScore(prev.name)) groups.set(key, f);
  }

  const chapters = [...groups.values()].map((f, i) => ({
    index: i,
    title: f.title || prettifyFileName(f.name),
    file: f.name,
    track: f.track ? parseInt(String(f.track), 10) : null,
    length: f.length ? parseLength(f.length) : null,
    url: audioUrl(identifier, f.name),
  }));

  // Order by track number when available, otherwise keep file order.
  chapters.sort((a, b) => {
    if (a.track != null && b.track != null) return a.track - b.track;
    return a.index - b.index;
  });
  chapters.forEach((c, i) => (c.index = i));

  const totalSecs = chapters.reduce((sum, c) => sum + (c.length || 0), 0);

  return {
    id: meta.identifier,
    title: Array.isArray(meta.title) ? meta.title[0] : meta.title || meta.identifier,
    author: authorName(meta.creator),
    description: cleanDescription(meta.description),
    language: meta.language || null,
    year: meta.year || null,
    runtime: meta.runtime || formatTime(totalSecs) || null,
    totalSeconds: totalSecs || null,
    textSource: meta.url_text_source || meta['external-identifier-text'] || null,
    subjects: Array.isArray(meta.subject) ? meta.subject : meta.subject ? [meta.subject] : [],
    cover: coverUrl(identifier),
    detail: detailUrl(identifier),
    chapters,
  };
}

/* ----------------------------- helpers ----------------------------- */

/** Archive `length` may be seconds ("123.4") or "MM:SS" / "HH:MM:SS". */
function parseLength(value) {
  const str = String(value).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function prettifyFileName(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format seconds → "H:MM:SS" or "M:SS". */
export function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

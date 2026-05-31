/**
 * Wikipedia client — 100% browser-side, no proxy, no API key.
 *
 * Used to enrich each book page with context drawn from Wikipedia:
 *   • a short biography of the author, and
 *   • a summary of the book itself (preferred over the LibriVox blurb).
 *
 * Both endpoints send CORS headers, so they work from a static, client-only
 * site exactly like the Internet Archive client does:
 *   • REST search   — resolves free text to matching page titles.
 *   • REST summary  — returns the lead paragraph, thumbnail and page URL.
 */

const SEARCH_URL = 'https://en.wikipedia.org/w/rest.php/v1/search/title';
const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

/** Per-session caches so revisiting a page doesn't refetch the same lookups. */
const authorCache = new Map();
const bookCache = new Map();

/**
 * Tidy an Archive `creator` string into a single searchable person name.
 *
 *   "Austen, Jane"            → "Jane Austen"
 *   "Twain, Mark (1835-1910)" → "Mark Twain"
 *   "Doyle, Arthur Conan; …"  → "Arthur Conan Doyle"  (first author only)
 */
export function normalizeAuthor(author) {
  if (!author) return '';
  let name = String(author).trim();
  if (/^unknown author$/i.test(name)) return '';

  // Keep only the first author when several are listed.
  name = name.split(/\s*[;,]\s*and\s+|\s*;\s*|\s+&\s+/)[0].trim();

  // Drop trailing life-dates like "(1835-1910)" or "1835-1910".
  name = name.replace(/\(?\b\d{3,4}\s*[-–]\s*\d{0,4}\b\)?\.?\s*$/, '').trim();

  // Flip a single "Lastname, Firstname" into natural order.
  const comma = name.match(/^([^,]+),\s*(.+)$/);
  if (comma) name = `${comma[2].trim()} ${comma[1].trim()}`.trim();

  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Tidy an Archive book title into something Wikipedia can match.
 *
 *   "Pride and Prejudice (version 5)" → "Pride and Prejudice"
 *   "Art of War, The"                 → "The Art of War"
 *   "Moby Dick, Vol. 1"               → "Moby Dick"
 */
export function normalizeTitle(title) {
  if (!title) return '';
  let t = String(title).trim();
  t = t.replace(/\([^)]*\)/g, ' ');                       // "(version 3)", "(Dramatic Reading)"
  t = t.replace(/[,:]\s*(?:vol(?:ume)?|book|part|no)\.?\s*[\divxlc]+\b.*$/i, ''); // volume tails
  t = t.replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  // Move a trailing article to the front: "Art of War, The" → "The Art of War".
  const m = t.match(/^(.*?),\s*(the|a|an)$/i);
  if (m) t = `${m[2]} ${m[1]}`.trim();
  return t.replace(/\s+/g, ' ').trim();
}

/** A Wikipedia search URL for an author — the always-works fallback link. */
export function authorSearchUrl(author) {
  const name = normalizeAuthor(author) || String(author || '').trim();
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
}

/** Search page titles for a query; returns up to `limit` canonical titles. */
async function searchTitles(query, limit = 1) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia search failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.pages) ? data.pages.map((p) => p.title).filter(Boolean) : [];
}

/** Fetch and normalise the summary for one page title, or null if unusable. */
async function summaryFor(title) {
  const res = await fetch(`${SUMMARY_URL}${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type === 'disambiguation' || !data.extract) return null;
  return {
    title: data.title || title,
    extract: data.extract,
    description: data.description || null,
    url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    thumbnail: data.thumbnail?.source || null,
  };
}

/**
 * Fetch a short biography for an author.
 *
 * Resolves to `null` whenever there is nothing useful to show (no name, no
 * matching page, a disambiguation stub or a network error).
 *
 * @param {string} author  raw author string from the book record
 * @returns {Promise<{ title, extract, url, thumbnail, description } | null>}
 */
export async function fetchAuthorBio(author) {
  const name = normalizeAuthor(author);
  if (!name) return null;
  if (authorCache.has(name)) return authorCache.get(name);

  const result = await (async () => {
    try {
      const [title] = await searchTitles(name, 1);
      return title ? await summaryFor(title) : null;
    } catch (err) {
      console.warn('Author biography lookup failed:', err);
      return null;
    }
  })();

  authorCache.set(name, result);
  return result;
}

const BOOKISH = /\b(novel|novella|book|short stor(?:y|ies)|stor(?:y|ies)|poem|poetry|play|memoir|essays?|collection|fairy tale|treatise|epic|fable|autobiograph|non-?fiction|fiction|written by|published)\b/i;
const NOT_BOOKISH = /\b(film|movie|album|song|single|television|tv series|video game|band|musician|actor|actress|painting)\b/i;

/**
 * Score how likely a summary is to be the Wikipedia article for *this* book
 * (as opposed to a film/album of the same name, or an unrelated page).
 */
function scoreBook(summary, cleanTitle, authorLast) {
  if (!summary) return -Infinity;
  const hay = `${summary.description || ''} ${summary.extract}`.toLowerCase();
  let score = 0;
  if (authorLast && hay.includes(authorLast.toLowerCase())) score += 3;
  if (BOOKISH.test(hay)) score += 2;
  if (NOT_BOOKISH.test(`${summary.description || ''}`)) score -= 3;
  // Reward a close title match.
  const a = summary.title.toLowerCase();
  const b = cleanTitle.toLowerCase();
  if (a === b) score += 2;
  else if (a.startsWith(b) || b.startsWith(a)) score += 1;
  return score;
}

/**
 * Fetch a Wikipedia summary of the book itself, disambiguating against films
 * and same-named pages by checking each candidate for the author's name and
 * book-like wording.
 *
 * Resolves to `null` when no confident match is found, so the caller can fall
 * back to the LibriVox description.
 *
 * @param {string} title   raw book title from the record
 * @param {string} author  raw author string from the record
 * @returns {Promise<{ title, extract, url, thumbnail, description } | null>}
 */
export async function fetchBookSummary(title, author) {
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) return null;
  const authorName = normalizeAuthor(author);
  const authorLast = authorName ? authorName.split(' ').pop() : '';
  const key = `${cleanTitle}|${authorName}`;
  if (bookCache.has(key)) return bookCache.get(key);

  const result = await (async () => {
    try {
      // Bias the search toward the right article by including the author.
      const queries = authorName ? [`${cleanTitle} ${authorName}`, cleanTitle] : [cleanTitle];
      const titles = [];
      for (const q of queries) {
        for (const t of await searchTitles(q, 4)) if (!titles.includes(t)) titles.push(t);
        if (titles.length >= 5) break;
      }

      let best = null;
      let bestScore = -Infinity;
      for (const t of titles.slice(0, 5)) {
        const s = await summaryFor(t);
        const score = scoreBook(s, cleanTitle, authorLast);
        if (score > bestScore) { best = s; bestScore = score; }
      }

      // Require some positive evidence so we don't show an unrelated page.
      return bestScore >= 2 ? best : null;
    } catch (err) {
      console.warn('Book summary lookup failed:', err);
      return null;
    }
  })();

  bookCache.set(key, result);
  return result;
}

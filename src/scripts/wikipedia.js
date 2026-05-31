/**
 * Wikipedia client — 100% browser-side, no proxy, no API key.
 *
 * Given an author's name we fetch a short biographical summary so each book
 * page can offer a little historical context about who wrote it and when.
 *
 * Both endpoints used here send CORS headers, so they work from a static,
 * client-only site exactly like the Internet Archive client does:
 *   • REST search   — resolves a free-text name to the best matching page,
 *                     coping with variant spellings, redirects and the
 *                     "Lastname, Firstname" form the Archive often stores.
 *   • REST summary  — returns the lead paragraph, thumbnail and page URL.
 */

const SEARCH_URL = 'https://en.wikipedia.org/w/rest.php/v1/search/title';
const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

/** Per-session cache so revisiting a book doesn't refetch the same author. */
const cache = new Map();

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

/** A Wikipedia search URL for an author — the always-works fallback link. */
export function authorSearchUrl(author) {
  const name = normalizeAuthor(author) || String(author || '').trim();
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
}

/** Resolve a free-text author name to Wikipedia's canonical page title. */
async function resolveTitle(name) {
  const params = new URLSearchParams({ q: name, limit: '1' });
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia search failed (${res.status})`);
  const data = await res.json();
  const page = Array.isArray(data?.pages) ? data.pages[0] : null;
  return page?.title || null;
}

/**
 * Fetch a short biography for an author.
 *
 * Resolves silently to `null` whenever there is nothing useful to show
 * (no name, no matching page, a disambiguation stub or a network error) so
 * callers can simply skip the section rather than surface an error.
 *
 * @param {string} author  raw author string from the book record
 * @returns {Promise<{ title, extract, url, thumbnail, description } | null>}
 */
export async function fetchAuthorBio(author) {
  const name = normalizeAuthor(author);
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);

  const result = await (async () => {
    try {
      const title = await resolveTitle(name);
      if (!title) return null;

      const res = await fetch(`${SUMMARY_URL}${encodeURIComponent(title)}`);
      if (!res.ok) return null;
      const data = await res.json();

      // Disambiguation pages and empty summaries carry no usable context.
      if (data.type === 'disambiguation' || !data.extract) return null;

      return {
        title: data.title || title,
        extract: data.extract,
        description: data.description || null,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        thumbnail: data.thumbnail?.source || null,
      };
    } catch (err) {
      console.warn('Author biography lookup failed:', err);
      return null;
    }
  })();

  cache.set(name, result);
  return result;
}

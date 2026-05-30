/** Small DOM/rendering helpers shared across pages. */

import { formatTime } from './api.js';

/** Escape text for safe insertion into HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FALLBACK_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
       <rect width="100%" height="100%" fill="#e7ddc9"/>
       <text x="50%" y="50%" font-family="Georgia, serif" font-size="120"
             fill="#b08d57" text-anchor="middle" dominant-baseline="central">&#10070;</text>
     </svg>`
  );

/** Build the markup for a single book card (anchor → book page). */
export function bookCardHTML(book) {
  const subtitle = book.runtime ? `· ${esc(book.runtime)}` : '';
  return `
    <a class="card" href="${import.meta.env.BASE_URL}book?id=${encodeURIComponent(book.id)}"
       aria-label="${esc(book.title)} by ${esc(book.author)}">
      <span class="card__frame">
        <img class="card__cover" loading="lazy" src="${esc(book.cover)}"
             alt="Cover of ${esc(book.title)}"
             onerror="this.onerror=null;this.src='${FALLBACK_COVER}'" />
      </span>
      <span class="card__body">
        <span class="card__title">${esc(book.title)}</span>
        <span class="card__author">${esc(book.author)}</span>
        <span class="card__meta">${book.year ? esc(book.year) : ''} ${subtitle}</span>
      </span>
    </a>`;
}

/** Render an array of books into a container element as a grid of cards. */
export function renderGrid(container, books) {
  if (!books.length) {
    container.innerHTML = `<p class="empty">No books found on this shelf.</p>`;
    return;
  }
  container.innerHTML = books.map(bookCardHTML).join('');
}

/** A "Continue listening" card with a progress bar. */
export function progressCardHTML(p) {
  const pct =
    p.position && p.chapterCount
      ? Math.min(100, Math.round(((p.chapterIndex + 0.5) / p.chapterCount) * 100))
      : 0;
  return `
    <a class="card card--progress" href="${import.meta.env.BASE_URL}book?id=${encodeURIComponent(p.id)}"
       aria-label="Continue ${esc(p.title)}">
      <span class="card__frame">
        <img class="card__cover" loading="lazy" src="${esc(p.cover)}"
             alt="Cover of ${esc(p.title)}"
             onerror="this.onerror=null;this.src='${FALLBACK_COVER}'" />
        <span class="card__resume">Resume</span>
      </span>
      <span class="card__body">
        <span class="card__title">${esc(p.title)}</span>
        <span class="card__author">${esc(p.author)}</span>
        <span class="card__meta">Ch. ${(p.chapterIndex ?? 0) + 1}${
          p.chapterCount ? ' of ' + p.chapterCount : ''
        } · ${formatTime(p.position)}</span>
        <span class="progress"><span class="progress__bar" style="width:${pct}%"></span></span>
      </span>
    </a>`;
}

export { FALLBACK_COVER };

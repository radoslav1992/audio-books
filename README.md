# 📖 Fiction & Fact Library — Vintage Audiobooks

A completely client-side audiobook player for the world's public-domain
literature, dressed in a warm, antiquarian-library aesthetic (cream paper,
terracotta ink, display serifs — inspired by the claude.ai palette).

Browse and stream thousands of classic audiobooks — *The Adventures of
Sherlock Holmes*, *The Art of War*, and more — read aloud by
[LibriVox](https://librivox.org) volunteers and paired with
[Project Gutenberg](https://www.gutenberg.org) texts.

## ✨ Features

- **Live catalogue** — search by title, author or subject; browse by popularity,
  rating, recency or title; quick subject chips; "load more" pagination.
- **A real audio player** — play/pause, previous/next chapter, skip back 15s /
  forward 30s, scrubbable seek bar, variable playback speed (0.75×–2×), full
  chapter list, and [Media Session](https://developer.mozilla.org/docs/Web/API/Media_Session_API)
  support so lock-screen & hardware media keys work.
- **Favorites** — save books to a private shelf, kept in `localStorage`.
- **Resume where you left off** — listening progress (chapter + position) is
  saved automatically and surfaced as a "Continue listening" shelf.
- **No backend, no accounts, no tracking** — every page is static HTML and all
  your data stays in your browser.
- Keyboard shortcuts: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd>
  skip 15s/30s.

## 🏗 How it works

The app is built with [Astro](https://astro.build) and ships as a fully static
site. All book data is fetched **in the browser** from the
[Internet Archive](https://archive.org)'s `librivoxaudio` collection:

| Need | Endpoint (CORS-enabled) |
| --- | --- |
| Search / browse | `https://archive.org/advancedsearch.php` |
| Book + chapters | `https://archive.org/metadata/{id}` |
| Stream audio | `https://archive.org/download/{id}/{file}.mp3` |
| Cover art | `https://archive.org/services/img/{id}` |

> The Internet Archive is used instead of `librivox.org/api` because the latter
> does not send CORS headers and so cannot be called from a static client-only
> site. The Archive mirrors every LibriVox recording and links back to the
> Project Gutenberg text source.

### Project layout

```
src/
  layouts/Layout.astro      # shared shell: head, fonts, masthead, footer
  pages/
    index.astro             # library: hero + search + browse grid
    book.astro              # detail page + audio player + chapters (reads ?id=)
    favorites.astro         # saved books + continue-listening
    about.astro             # colophon
  scripts/
    api.js                  # Internet Archive client + formatting helpers
    store.js                # localStorage: favorites + progress
    ui.js                   # shared DOM/card rendering helpers
  styles/
    global.css              # vintage + claude.ai theme
    player.css              # book page & player styling
```

## 🚀 Development

```bash
npm install
npm run dev      # local dev server at http://localhost:4321
npm run build    # static build into dist/
npm run preview  # serve the production build locally
```

## 📦 Deployment

The output in `dist/` is plain static files — host it anywhere (GitHub Pages,
Netlify, Cloudflare Pages, S3, …). If you deploy under a sub-path, set
[`base`](https://docs.astro.build/en/reference/configuration-reference/#base)
in `astro.config.mjs`; all internal links already respect `import.meta.env.BASE_URL`.

## ⚖️ Licensing

All audiobooks and texts are in the **public domain**. Audio is provided by
LibriVox, texts by Project Gutenberg, hosting by the Internet Archive. This
player is just a viewer — please respect each project's terms when redistributing.

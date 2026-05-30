// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Fully static, client-rendered site. All book data is fetched in the
// browser from the Internet Archive's CORS-enabled APIs, so there is no
// server runtime and the build can be hosted anywhere (Cloudflare, Netlify,
// GitHub Pages, a plain bucket, etc.).
export default defineConfig({
  output: 'static',
  site: 'https://fictionandfactlibrary.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Generates /sitemap-index.xml (plus /sitemap-0.xml) at the site root.
      // Exclude the 404 page from the index.
      filter: (page) => !page.endsWith('/404/') && !page.endsWith('/404'),
    }),
  ],
});

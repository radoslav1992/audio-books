// @ts-check
import { defineConfig } from 'astro/config';

// Fully static, client-rendered site. All book data is fetched in the
// browser from the Internet Archive's CORS-enabled APIs, so there is no
// server runtime and the build can be hosted anywhere (GitHub Pages,
// Netlify, Cloudflare Pages, a plain bucket, etc.).
export default defineConfig({
  output: 'static',
  site: 'https://example.com',
  trailingSlash: 'ignore',
});

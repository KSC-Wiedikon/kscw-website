// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://kscw-website.pages.dev',
  // Single-URL site: one page per path, language switched client-side by
  // public/js/i18n.js. No directory-based i18n routing. Legacy /de//en/ URLs
  // are 301'd to canonical paths via public/_redirects (Cloudflare Pages).
});

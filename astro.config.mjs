// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://kscw.ch',
  // Astro 7 defaults to 'jsx' whitespace rules: whitespace containing a line break
  // is dropped, so "die\n<a>Datenschutzerklärung</a>\ngelesen" rendered as
  // "dieDatenschutzerklärunggelesen". `true` keeps Astro 6's collapse-to-one-space.
  compressHTML: true,
  // Single-URL site: one page per path, language switched client-side by
  // public/js/i18n.js. No directory-based i18n routing. Legacy /de//en/ URLs
  // are 301'd to canonical paths via public/_redirects (Cloudflare Pages).
});

import { test, expect } from '@playwright/test'

/**
 * Stored-XSS regressions for the 2026-05-31 audit fixes. Runs against the local
 * preview built from THIS branch (`npm run build` fetches dev Directus, then
 * `astro preview` on :4321 via the shared playwright.config.ts webServer).
 *
 *   npm run build && npx playwright test tests/e2e/security-xss.spec.ts
 *
 * Note: these assert the SINKS are closed (descriptions are inert text, the JSON
 * island can't break out). A full end-to-end proof would seed an event whose
 * description contains `<img onerror>` / `</script>` in dev Directus; that needs
 * write access and is out of scope for a read-only regression run.
 */
test.describe('Website stored-XSS regressions', () => {
  test('homepage event descriptions are inert text (set:html removed)', async ({ page }) => {
    await page.goto('/de/')
    const descs = page.locator('.event-description')
    const n = await descs.count()
    for (let i = 0; i < n; i++) {
      const childEls = await descs.nth(i).evaluate((el) => el.childElementCount)
      expect(childEls, 'event description must have no HTML child elements (text only)').toBe(0)
    }
  })

  test('calendar JSON data island cannot break out of <script> and stays valid JSON', async ({ page }) => {
    await page.goto('/de/weiteres/kalender')
    const island = page.locator('#events-data')
    await expect(island).toHaveCount(1)
    const raw = await island.evaluate((el) => el.textContent || '')
    expect(raw.toLowerCase(), 'data island must not contain a literal </script sequence').not.toContain('</script')
    expect(() => JSON.parse(raw), 'island must still parse as JSON (\\u003c decodes transparently)').not.toThrow()
  })

  test('RSS feed is well-formed XML (escaped slugs/titles)', async ({ request }) => {
    const res = await request.get('/feed.xml')
    expect(res.status()).toBe(200)
    const xml = await res.text()
    // A well-formed feed has no unescaped raw ampersands (would break parsers).
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/)
  })
})

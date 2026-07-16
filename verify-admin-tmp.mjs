/**
 * Drives the REAL /admin against dev Directus: login → scorer courses → the EN course's
 * signups (where the seeded scoresheet is) → opens the scoresheet menu.
 * Throwaway — deleted after the run.
 */
import { chromium } from 'playwright'

const OUT = '/tmp/claude-1000/-home-lucanepa-repos-kscw-website/788c1af6-7ae2-4908-b06a-27d802c77ad8/scratchpad'
const BASE = process.env.BASE || 'http://localhost:4321'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' })
await page.fill('#email', process.env.ADMIN_EMAIL)
await page.fill('#password', process.env.ADMIN_PASSWORD)
await page.click('#login-form button[type=submit]')
await page.waitForTimeout(3000)

await page.goto(`${BASE}/admin/?tab=scorer_courses`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// The nav tab is also called "Registrations" — scope to the course card's button, which
// is an .admin-btn. first() is the EN course (the one carrying the seeded sheet).
const cardBtns = page.locator('.admin-btn:has-text("Registrations"), .admin-btn:has-text("Anmeldungen")')
console.log('course registration buttons found:', await cardBtns.count())
await cardBtns.first().click()
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT}/admin-4-signups.png`, fullPage: true })

const yes = page.locator('button[aria-pressed]')
console.log('aria-pressed buttons (Yes/No pills):', await yes.count())

const tick = page.locator('button', { hasText: /^✓/ })
const tickCount = await tick.count()
console.log('scoresheet ticks:', tickCount)
if (tickCount) {
  await tick.first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/admin-5-menu.png` })
  const items = await page.locator('body > div[style*="position:fixed"] button').allTextContents()
  console.log('menu items:', JSON.stringify(items))
}

console.log('\n--- console errors ---')
console.log(errors.length ? errors.join('\n') : '(none)')
await browser.close()

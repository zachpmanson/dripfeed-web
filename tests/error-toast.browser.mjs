import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE, 'index.mjs')).href
    : 'playwright'
)
const artifacts = process.env.TEST_ARTIFACT_DIR
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
const evidence = { layouts: [], errors: [], blockedRequests: [] }
let browser
try {
  await server.listen()
  const origin = new URL(server.resolvedUrls.local[0]).origin
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
  evidence.browser = browser.version()
  const context = await browser.newContext()
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    evidence.blockedRequests.push(route.request().url())
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  for (const width of [360, 768, 1600]) {
    for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(`${origin}/tests/fixtures/error-toast.html`)
      await page.locator('#background').waitFor()
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      await page.locator('#background').focus()
      const before = await page.locator('#reader').boundingBox()
      await page.evaluate(() => window.showError('Sync failed: ' + 'UnbrokenURL'.repeat(100)))
      const toast = page.getByRole('alert')
      await toast.waitFor()
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        'background',
        'no focus theft',
      )
      assert.deepEqual(await page.locator('#reader').boundingBox(), before, 'no layout shift')
      const metrics = await toast.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        const dismiss = node.querySelector('button').getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          position: style.position,
          background: style.backgroundColor,
          text: getComputedStyle(node.querySelector('span')).color,
          scrollWidth: document.documentElement.scrollWidth,
          dismissHeight: dismiss.height,
          dismissVisible: dismiss.top >= rect.top && dismiss.bottom <= rect.bottom,
        }
      })
      evidence.layouts.push({ viewportWidth: width, theme, ...metrics })
      assert.equal(metrics.position, 'fixed')
      assert.ok(metrics.left >= 10 && metrics.right <= width - 10, 'viewport gutters')
      assert.ok(metrics.top >= 10 && metrics.bottom <= 630, 'vertical containment')
      assert.ok(metrics.width <= 500 && metrics.height < 400, 'bounded toast')
      assert.ok(metrics.scrollWidth <= width, 'no horizontal overflow for long error text')
      assert.ok(metrics.dismissHeight >= 36 && metrics.dismissVisible, 'usable visible dismiss')
      assert.equal(metrics.background, theme === 'dark' ? 'rgb(28, 31, 38)' : 'rgb(255, 255, 255)')
      assert.equal(metrics.text, theme === 'dark' ? 'rgb(255, 141, 141)' : 'rgb(179, 38, 30)')
      await page.locator('#background').click()
      assert.equal(
        await page.locator('#background').textContent(),
        'Background control: 1',
        'background remains interactive',
      )
      assert.equal(await page.getByRole('alert').count(), 1, 'rerender retains one toast')
      // Chromium also makes the overflowing message keyboard-scrollable.
      // Traverse that optional tab stop before the dismiss control.
      for (let tab = 0; tab < 3; tab += 1) {
        await page.keyboard.press('Tab')
        if (
          await page.evaluate(
            () => document.activeElement.getAttribute('aria-label') === 'Dismiss error',
          )
        )
          break
      }
      assert.equal(
        await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
        'Dismiss error',
      )
      if (artifacts) {
        await mkdir(artifacts, { recursive: true })
        await page.screenshot({ path: resolve(artifacts, `${theme}-${width}.png`) })
      }
      await page.keyboard.press('Enter')
      await toast.waitFor({ state: 'detached' })
      assert.deepEqual(
        await page.locator('#reader').boundingBox(),
        before,
        'dismissal does not shift layout',
      )
    }
  }
  assert.deepEqual(evidence.errors, [])
  assert.deepEqual(evidence.blockedRequests, [])
  evidence.result = 'passed'
} catch (error) {
  evidence.result = 'failed'
  evidence.error = error.stack
  process.exitCode = 1
} finally {
  console.log(JSON.stringify(evidence, null, 2))
  if (artifacts) {
    await mkdir(artifacts, { recursive: true })
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(evidence, null, 2))
  }
  await browser?.close()
  await server.close()
}

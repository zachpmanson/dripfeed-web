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
const evidence = { layouts: [], errors: [] }
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  for (const width of [360, 1000, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/article-tables.html`)
    await page.frameLocator('iframe').locator('#overflow').waitFor()
    const metrics = await page
      .frameLocator('iframe')
      .locator('body')
      .evaluate((body) => {
        const doc = body.ownerDocument
        const viewport = doc.documentElement.clientWidth
        const tables = [...doc.querySelectorAll('table')].map((table) => {
          const box = table.getBoundingClientRect()
          table.scrollLeft = table.scrollWidth
          return {
            id: table.id,
            left: box.left,
            right: box.right,
            width: box.width,
            center: (box.left + box.right) / 2,
            scrollWidth: table.scrollWidth,
            clientWidth: table.clientWidth,
            scrollLeft: table.scrollLeft,
          }
        })
        const prose = doc.querySelector('#prose').getBoundingClientRect()
        return {
          viewport,
          documentWidth: doc.documentElement.scrollWidth,
          proseWidth: prose.width,
          tables,
        }
      })
    evidence.layouts.push({ width, ...metrics })
    for (const table of metrics.tables) {
      assert.ok(
        Math.abs(table.center - metrics.viewport / 2) <= 1,
        `${width}px ${table.id}: centered`,
      )
      assert.ok(
        table.left >= 15 && table.right <= metrics.viewport - 15,
        `${width}px ${table.id}: viewport gutters`,
      )
      assert.ok(
        table.width <= metrics.viewport - 30,
        `${width}px ${table.id}: constrained to viewport`,
      )
    }
    assert.ok(
      metrics.documentWidth <= metrics.viewport + 1,
      `${width}px: no page horizontal overflow`,
    )
    assert.ok(metrics.proseWidth <= 46 * 16, `${width}px: prose stays constrained`)
    const overflow = metrics.tables.find((table) => table.id === 'overflow')
    assert.ok(overflow.scrollWidth > overflow.clientWidth, `${width}px: wide table scrolls locally`)
    assert.ok(overflow.scrollLeft > 0, `${width}px: overflowing content remains reachable`)
    if (artifacts) {
      await mkdir(artifacts, { recursive: true })
      await page.screenshot({ path: resolve(artifacts, `${width}.png`), fullPage: true })
    }
  }
  assert.deepEqual(evidence.errors, [])
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

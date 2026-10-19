// Run against a managed local Vite server (no live API or real credentials):
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium \
//   nix develop --command node --test tests/reconnect-sync.browser.mjs
// Override VITE_TEST_URL if Vite is not listening on http://127.0.0.1:5173.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const viteUrl = process.env.VITE_TEST_URL || 'http://127.0.0.1:5173'
const startTime = Date.UTC(2026, 0, 1)
let browser

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
  })
})
after(async () => browser?.close())

async function eventually(check, description) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await delay(50)
  }
  assert.fail(`Timed out: ${description}`)
}

async function setup(t, initialStatus = 200, holdInitially = false) {
  const counts = { feeds: 0, items: 0, updated: 0, writes: 0 }
  let status = initialStatus
  let heldResponse
  let hold = holdInitially
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', new URL(viteUrl).origin)
    res.setHeader('Access-Control-Allow-Headers', 'Authorization')
    res.setHeader('Access-Control-Expose-Headers', 'Date, Retry-After')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
    if (req.method !== 'GET') {
      counts.writes++
      return res.writeHead(405).end()
    }
    const path = new URL(req.url, 'http://localhost').pathname
    res.setHeader('Content-Type', 'application/json')
    if (path.endsWith('/feeds')) {
      counts.feeds++
      const respond = () => {
        if (status === 429) res.setHeader('Retry-After', '120')
        res.writeHead(status).end(JSON.stringify({ feeds: [] }))
      }
      if (hold) heldResponse = respond
      else respond()
    } else if (path.endsWith('/folders')) {
      res.end(JSON.stringify({ folders: [] }))
    } else if (path.endsWith('/items/updated')) {
      counts.updated++
      res.setHeader('Date', new Date(startTime + counts.updated * 1000).toUTCString())
      res.end(JSON.stringify({ items: [] }))
    } else if (path.endsWith('/items')) {
      counts.items++
      res.end(JSON.stringify({ items: [] }))
    } else res.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const apiUrl = `http://127.0.0.1:${server.address().port}`
  const context = await browser.newContext({ serviceWorkers: 'block' })
  if (process.env.BROWSER_EVIDENCE_DIR) {
    await mkdir(process.env.BROWSER_EVIDENCE_DIR, { recursive: true })
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  }
  // Guard against accidentally reaching the Vite live /apps proxy or any remote host.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    const allowed =
      url.origin === apiUrl ||
      (url.origin === new URL(viteUrl).origin && !url.pathname.startsWith('/apps'))
    return allowed ? route.continue() : route.abort('blockedbyclient')
  })
  t.after(async () => {
    heldResponse?.()
    if (process.env.BROWSER_EVIDENCE_DIR) {
      await context.tracing.stop({
        path: join(process.env.BROWSER_EVIDENCE_DIR, `${t.name.replace(/[^a-z0-9]+/gi, '-')}.zip`),
      })
    }
    await context.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    assert.equal(counts.writes, 0, 'regression must never write to an API')
  })
  const page = await context.newPage()
  await page.clock.install({ time: startTime })
  await page.clock.pauseAt(startTime)
  await page.goto(`${viteUrl}/tests/fixtures/reconnect-sync.html?api=${encodeURIComponent(apiUrl)}`)
  await eventually(
    () =>
      page
        .locator('output')
        .getAttribute('data-ready')
        .then((value) => value === 'true'),
    'local mirror becomes ready',
  )
  const settled = async (n) => {
    await eventually(async () => {
      const marker = await page.evaluate(async () => {
        const { dbGetMeta } = await import('/src/db.ts')
        return dbGetMeta('reconcile:lastModified')
      })
      return marker === String(startTime / 1000 + n - 2)
    }, `sync ${n} persisted its reconciliation marker`)
  }
  const wake = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
    })
  return {
    page,
    context,
    counts,
    settled,
    wake,
    setStatus: (value) => (status = value),
    hold: () => (hold = true),
    release: () => {
      hold = false
      heldResponse?.()
      heldResponse = undefined
    },
  }
}

test('Chromium reconnect bypasses NETWORK backoff once; wake/poll storms do not duplicate sync', async (t) => {
  const h = await setup(t)
  await h.settled(1)
  await h.context.setOffline(true)
  await h.page.clock.runFor(30_001)
  await h.wake()
  await eventually(
    () =>
      h.page
        .locator('output')
        .textContent()
        .then((text) => text.includes('connection')),
    'real offline fetch failure is reported',
  )
  assert.equal(h.counts.feeds, 1, 'offline fetch cannot reach the fake API')

  h.hold()
  await h.context.setOffline(false)
  await eventually(() => h.counts.feeds === 2, 'online event retries before 60s backoff expires')
  await h.wake()
  // Keep the retry pending beyond both the throttle and a poll interval.
  await h.page.clock.runFor(180_000)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 2, 'pending retry is single-flight across all wake sources')
  h.release()
  await h.settled(2)
  assert.equal(h.counts.items, 2)
  assert.equal(h.counts.updated, 2)

  await h.wake()
  await h.settled(3)
  assert.equal(h.counts.feeds, 3, 'normal wake is eligible after the long-running retry')
  await h.wake()
  await h.page.clock.runFor(29_999)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 3, 'successful sync restores ordinary wake throttling')

  await h.page.evaluate(() => window.unmountHarness())
  await h.page.clock.runFor(180_000)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 3, 'unmount removes online, wake, and poll listeners')
})

test('slow hydrated startup sync cannot overlap focus, visibility, online, or poll ticks', async (t) => {
  const h = await setup(t, 200, true)
  await eventually(() => h.counts.feeds === 1, 'startup sync reaches fake API')
  await h.page.clock.runFor(180_000)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 1)
  h.release()
  await h.settled(1)
  assert.equal(h.counts.items, 1)
})

test('online events preserve a background HTTP 503 backoff', async (t) => {
  const h = await setup(t)
  await h.settled(1)
  h.setStatus(503)
  await h.page.clock.runFor(30_001)
  await h.wake()
  await eventually(
    () =>
      h.page
        .locator('output')
        .textContent()
        .then((text) => text !== 'ok'),
    'background server failure is reported',
  )
  await h.context.setOffline(true)
  await h.context.setOffline(false)
  await h.page.clock.runFor(59_999)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 2, 'online cannot bypass a background server failure')
  h.setStatus(200)
  await h.page.clock.runFor(2)
  await h.wake()
  await h.settled(2)
  assert.equal(h.counts.feeds, 3)
})

for (const status of [503, 429]) {
  test(`online events preserve HTTP ${status} startup backoff`, async (t) => {
    const h = await setup(t, status)
    await eventually(
      () =>
        h.page
          .locator('output')
          .textContent()
          .then((text) => text !== 'ok'),
      'startup server failure is reported',
    )
    await h.context.setOffline(true)
    await h.context.setOffline(false)
    await h.wake()
    await h.page.clock.runFor(59_999)
    await h.wake()
    await delay(100)
    assert.equal(h.counts.feeds, 1, 'online and focus cannot bypass server backoff')
    h.setStatus(200)
    await h.page.clock.runFor(status === 429 ? 60_002 : 2)
    await h.wake()
    await h.settled(1)
    assert.equal(h.counts.feeds, 2, 'ordinary retry resumes after server backoff/cooldown')
  })
}

test('online event retries a returning reader whose startup sync failed offline', async (t) => {
  const h = await setup(t)
  await h.settled(1)
  // Keep local Vite modules available during reload; fail only API requests
  // at the browser network layer to model a disconnected returning reader.
  await h.context.route('**/apps/news/api/**', (route) => route.abort('internetdisconnected'))
  await h.page.reload()
  await eventually(
    () =>
      h.page
        .locator('output')
        .textContent()
        .then((text) => text.includes('connection')),
    'hydrated startup network failure',
  )
  await h.context.unroute('**/apps/news/api/**')
  await h.context.setOffline(true)
  await h.context.setOffline(false)
  await eventually(() => h.counts.feeds === 2, 'startup network failure retries immediately online')
  await h.settled(2)
  await h.wake()
  await delay(100)
  assert.equal(h.counts.feeds, 2, 'repeated online/wake events do not repeat the startup retry')
})

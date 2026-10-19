import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

// Use a local Playwright install, or an explicitly supplied shared installation.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE, 'index.mjs')).href
    : 'playwright'
)
const artifacts = process.env.TEST_ARTIFACT_DIR
if (artifacts) await mkdir(artifacts, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
let browser
const evidence = { checks: {}, pageErrors: [], consoleErrors: [] }
try {
  await server.listen()
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
  })
  evidence.browserVersion = browser.version()
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } })
  // Never contact the article's origin; popup behavior is still exercised.
  await context.route('https://article.example/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>External article</h1>' }),
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text())
  })
  let popupCount = 0
  page.on('popup', () => popupCount++)
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/iframe-footnotes.html`)
  const frame = page.frameLocator('iframe')
  await frame.locator('#footnote-link span').waitFor()
  await page.waitForFunction(
    () => document.querySelector('iframe').contentDocument.readyState === 'complete',
  )
  evidence.realms = await page.evaluate(() => {
    const iframe = document.querySelector('iframe')
    const target = iframe.contentDocument.querySelector('#footnote-link span')
    const anchor = target.closest('a')
    return {
      targetIsParentElement: target instanceof Element,
      anchorIsParentAnchor: anchor instanceof HTMLAnchorElement,
      targetIsFrameElement: target instanceof iframe.contentWindow.Element,
      anchorIsFrameAnchor: anchor instanceof iframe.contentWindow.HTMLAnchorElement,
      sandbox: iframe.getAttribute('sandbox'),
      articleScriptRan: iframe.contentDocument.body.dataset.articleScriptRan ?? null,
    }
  })
  // Observe after ItemView's listener, without replacing or copying its handler.
  const observeClicks = () =>
    page.evaluate(() => {
      const doc = document.querySelector('iframe').contentDocument
      doc.addEventListener('click', (event) => {
        doc.body.dataset.defaultPrevented = String(event.defaultPrevented)
      })
    })
  await observeClicks()
  const clickFragment = async (selector, targetId) => {
    const popupsBefore = popupCount
    await frame.locator(selector).click()
    const observed = await page.evaluate((id) => {
      const doc = document.querySelector('iframe').contentDocument
      return {
        prevented: doc.body.dataset.defaultPrevented,
        flash: doc.getElementById(id)?.classList.contains('footnote-flash') ?? false,
      }
    }, targetId)
    await page.waitForTimeout(600) // allow the actual smooth scroll (or unwanted popup) to finish
    observed.scrollY = await frame.locator('body').evaluate(() => window.scrollY)
    observed.popupCount = popupCount - popupsBefore
    return observed
  }
  evidence.checks.footnote = await clickFragment('#footnote-link span', 'fn:1')
  if (artifacts) await page.screenshot({ path: resolve(artifacts, 'footnote.png') })
  await page.waitForTimeout(700)
  evidence.checks.flashRemoved = await frame
    .locator('[id="fn:1"]')
    .evaluate((target) => !target.classList.contains('footnote-flash'))
  evidence.checks.backlink = await clickFragment('#backlink', 'reference')
  evidence.checks.missing = await clickFragment('#missing-link', 'missing')
  await frame.locator('#ordinary').click()
  evidence.checks.ordinaryPrevented = await frame
    .locator('body')
    .getAttribute('data-default-prevented')

  for (const [name, expectedUrl] of [
    ['external', 'https://article.example/external'],
    ['relative', 'https://article.example/other'],
  ]) {
    const popupPromise = page.waitForEvent('popup')
    await frame.locator(`#${name}-link`).click()
    const popup = await popupPromise
    await popup.waitForLoadState()
    evidence.checks[name] = {
      url: popup.url(),
      prevented: await frame.locator('body').getAttribute('data-default-prevented'),
      openerIsNull: await popup.evaluate(() => window.opener === null),
      expectedUrl,
    }
    await popup.close()
  }

  // A theme update replaces srcdoc; the new document must receive the handler too.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await frame.locator('html[data-theme-revision="1"]').waitFor()
  await page.waitForFunction(
    () => document.querySelector('iframe').contentDocument.readyState === 'complete',
  )
  await observeClicks()
  evidence.checks.afterReload = await clickFragment('#footnote-link span', 'fn:1')
  evidence.checks.parentUrlUnchanged = page.url().endsWith('/tests/fixtures/iframe-footnotes.html')

  assert.equal(evidence.realms.targetIsParentElement, false)
  assert.equal(evidence.realms.anchorIsParentAnchor, false)
  assert.equal(evidence.realms.targetIsFrameElement, true)
  assert.equal(evidence.realms.anchorIsFrameAnchor, true)
  assert.equal(
    evidence.realms.sandbox,
    'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  )
  assert.equal(evidence.realms.articleScriptRan, null, 'article scripts remain sandboxed')
  for (const name of ['footnote', 'backlink', 'afterReload']) {
    const check = evidence.checks[name]
    assert.equal(check.prevented, 'true', `${name}: fragment default navigation is prevented`)
    assert.equal(check.flash, true, `${name}: destination receives the highlight`)
    assert.equal(check.popupCount, 0, `${name}: fragment must not open a popup`)
    assert.ok(
      name === 'backlink' ? check.scrollY < 100 : check.scrollY > 500,
      `${name}: iframe scrolls to destination`,
    )
  }
  assert.equal(evidence.checks.flashRemoved, true)
  assert.equal(evidence.checks.missing.prevented, 'true')
  assert.equal(evidence.checks.missing.popupCount, 0)
  assert.equal(evidence.checks.ordinaryPrevented, 'false')
  for (const name of ['external', 'relative']) {
    assert.equal(evidence.checks[name].url, evidence.checks[name].expectedUrl)
    assert.equal(evidence.checks[name].prevented, 'false')
    assert.equal(evidence.checks[name].openerIsNull, true)
  }
  assert.equal(evidence.checks.parentUrlUnchanged, true)
  assert.deepEqual(evidence.pageErrors, [])
  // Chromium should report the blocked article script, not execute it.
  assert.ok(evidence.consoleErrors.some((message) => message.includes('Blocked script execution')))
  evidence.result = 'passed'
} catch (error) {
  evidence.result = 'failed'
  evidence.error = error.stack
  process.exitCode = 1
} finally {
  console.log(JSON.stringify(evidence, null, 2))
  if (artifacts)
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(evidence, null, 2))
  await browser?.close()
  await server.close()
}

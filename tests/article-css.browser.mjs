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
if (artifacts) await mkdir(artifacts, { recursive: true })
const reproduce = process.env.EXPECT_VULNERABLE === '1'
const evidence = {
  mode: reproduce ? 'pre-fix reproduction' : 'regression',
  requests: [],
  unexpectedRemote: [],
  cases: {},
  pageErrors: [],
}
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
let browser
try {
  await server.listen()
  const origin = new URL(server.resolvedUrls.local[0]).origin
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
  })
  evidence.browserVersion = browser.version()
  const context = await browser.newContext()
  // Context routing also catches srcdoc/standalone iframe requests. No remote request is forwarded.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    const record = {
      url: request.url(),
      type: request.resourceType(),
      frame: request.frame().url(),
    }
    evidence.requests.push(record)
    if (!['css-probe.invalid', 'article.example'].includes(url.hostname)) {
      evidence.unexpectedRemote.push(record)
      return route.abort()
    }
    if (request.resourceType() === 'stylesheet')
      return route.fulfill({ contentType: 'text/css', body: '' })
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    })
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message))
  await page.goto(`${origin}/tests/fixtures/article-css.html`)
  await page.waitForFunction(() => typeof window.renderArticleCss === 'function')
  const observe = () =>
    page.evaluate(() => {
      const iframe = document.querySelector('#root iframe')
      const doc = iframe.contentDocument
      const style = doc.head.querySelectorAll('style')[1]
      const computed = getComputedStyle(doc.getElementById('sample') || doc.body)
      return {
        breakout: !!doc.getElementById('css-breakout'),
        customStyle: style?.textContent ?? null,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        color: computed.color,
        sandbox: iframe.getAttribute('sandbox'),
        scriptRan: doc.body.dataset.scriptRan ?? null,
        themeRevision: doc.documentElement.dataset.themeRevision,
        images: [...doc.images].map((img) => ({ src: img.src, naturalWidth: img.naturalWidth })),
      }
    })
  const render = async (args) => {
    const start = evidence.requests.length
    const revision = await page.evaluate((options) => window.renderArticleCss(options), args)
    await page.waitForFunction((rev) => {
      const doc = document.querySelector('#root iframe')?.contentDocument
      return (
        doc?.readyState === 'complete' &&
        doc.getElementById('revision')?.textContent === String(rev)
      )
    }, revision)
    await page.waitForTimeout(400)
    return { ...(await observe()), requests: evidence.requests.slice(start) }
  }
  const probe = (name) => `https://css-probe.invalid/${name}`
  const payloads = {
    escapedUrl: String.raw`body { background-image: \75rl("${probe('escaped-url')}"); }`,
    escapedImport: String.raw`@\69mport "${probe('escaped-import.css')}";`,
    imageSet: `body { background-image: image-set("${probe('image-set')}" 1x); }`,
    literalUrl: `body { background-image: url("${probe('literal-url')}"); }`,
    literalImport: `@import "${probe('literal-import.css')}";`,
    breakout: `</StYlE ><img id="css-breakout" src="${probe('breakout')}"><style>`,
    commentBreakout: `/* </StYlE ><img id="css-breakout" src="${probe('comment-breakout')}"><style> */`,
    stringBreakout: `p::before { content: '</StYlE ><img id="css-breakout" src="${probe('string-breakout')}"><style>'; }`,
  }
  for (const [name, css] of Object.entries(payloads)) evidence.cases[name] = await render({ css })

  evidence.cases.typography = await render({
    css: '@media (min-width: 1px) { #sample { font-family: Georgia, serif; font-size: calc(20px + 3px); line-height: 1.8; color: rgb(12, 34, 56); } }',
  })
  evidence.cases.articleImages = await render({
    body: '<p id="sample">Images</p><img src="https://article.example/absolute.png"><img src="../images/photo.png">',
  })
  evidence.cases.defaultMode = await render({ mode: 'default', css: payloads.breakout })
  evidence.cases.sandbox = await render({
    body: '<p id="sample">Script</p><script>document.body.dataset.scriptRan="yes"</' + 'script>',
  })
  await render({ css: 'p { font-size: 25px; }' })
  await page.evaluate(() => {
    window.previousArticleIframe = document.querySelector('#root iframe')
  })
  evidence.cases.cssUpdate = await render({ css: payloads.imageSet, fresh: false })
  evidence.cases.cssUpdate.sameIframe = await page.evaluate(
    () => window.previousArticleIframe === document.querySelector('#root iframe'),
  )
  evidence.cases.themeBefore = await render({ css: payloads.escapedUrl })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.waitForFunction(
    () =>
      document.querySelector('#root iframe')?.contentDocument?.documentElement?.dataset
        .themeRevision === '1',
  )
  await page.waitForTimeout(400)
  evidence.cases.themeAfter = await observe()

  // A deliberately unsanitized control proves resource interception works, separate from ItemView.
  const start = evidence.requests.length
  await page.evaluate((url) => {
    const iframe = document.createElement('iframe')
    iframe.id = 'unsanitized-control'
    iframe.srcdoc = `<style>body { background: url("${url}"); }</style><img src="${url}-image">`
    document.body.append(iframe)
  }, probe('unsanitized-control'))
  await page.waitForFunction(
    () =>
      document.querySelector('#unsanitized-control')?.contentDocument?.images[0]?.naturalWidth > 0,
  )
  await page.waitForTimeout(400)
  evidence.controlRequests = evidence.requests.slice(start)
  assert.equal(evidence.controlRequests.length, 2)
  assert.ok(
    evidence.controlRequests.some((request) => request.url.endsWith('/unsanitized-control')),
  )
  assert.equal(evidence.cases.articleImages.images.length, 2)
  assert.deepEqual(
    evidence.cases.articleImages.images.map((img) => img.src),
    ['https://article.example/absolute.png', 'https://article.example/images/photo.png'],
  )
  assert.ok(evidence.cases.articleImages.images.every((img) => img.naturalWidth > 0))
  assert.equal(evidence.cases.articleImages.requests.length, 2)
  assert.equal(evidence.cases.typography.fontSize, '23px')
  assert.equal(evidence.cases.typography.lineHeight, '41.4px')
  assert.equal(evidence.cases.typography.color, 'rgb(12, 34, 56)')
  assert.equal(evidence.cases.defaultMode.breakout, false)
  assert.equal(evidence.cases.defaultMode.requests.length, 0)
  assert.equal(evidence.cases.sandbox.scriptRan, null)
  assert.equal(
    evidence.cases.sandbox.sandbox,
    'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  )
  if (reproduce) {
    for (const name of [
      'escapedUrl',
      'escapedImport',
      'imageSet',
      'breakout',
      'commentBreakout',
      'stringBreakout',
    ])
      assert.ok(evidence.cases[name].requests.length > 0, `${name}: reproduce intercepted resource`)
    assert.equal(evidence.cases.breakout.breakout, true)
  } else {
    for (const name of Object.keys(payloads)) {
      assert.equal(evidence.cases[name].requests.length, 0, `${name}: no custom-CSS requests`)
      assert.equal(evidence.cases[name].breakout, false, `${name}: no HTML breakout`)
      assert.equal(evidence.cases[name].customStyle, '', `${name}: whole sheet rejected`)
    }
    assert.equal(evidence.cases.themeAfter.customStyle, '')
    assert.equal(evidence.cases.cssUpdate.customStyle, '')
    assert.equal(evidence.cases.cssUpdate.requests.length, 0)
    assert.equal(evidence.cases.cssUpdate.sameIframe, true)
    assert.equal(
      evidence.requests.filter(
        (request) =>
          request.url.startsWith('https://css-probe.invalid/') &&
          !request.url.includes('unsanitized-control'),
      ).length,
      0,
    )
  }
  assert.deepEqual(evidence.unexpectedRemote, [])
  assert.deepEqual(evidence.pageErrors, [])
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

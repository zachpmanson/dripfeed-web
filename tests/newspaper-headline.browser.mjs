// Dependency-free Chromium/CDP regression. Uses Node's built-in WebSocket.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

assert.ok(process.env.CHROMIUM_PATH, 'Set CHROMIUM_PATH to a Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'dripfeed-headline-'))
const artifacts = process.env.TEST_ARTIFACT_DIR
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/.pi-subagents/**'] } },
})
const evidence = { checks: [], layouts: [], pageErrors: [], blockedRequests: [], maxMounted: 0 }
let browser, socket
async function eventually(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await delay(50)
  }
  throw new Error('Timed out waiting for browser state')
}
try {
  await server.listen()
  browser = spawn(
    process.env.CHROMIUM_PATH,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let port
  await eventually(async () => {
    try {
      port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
      return !!port
    } catch {
      return false
    }
  })
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let id = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      const url = new URL(request.url)
      // Vite normally proxies /apps to the real News server, including mutating GETs.
      if (
        url.origin === new URL(server.resolvedUrls.local[0]).origin &&
        !url.pathname.startsWith('/apps') &&
        request.method === 'GET'
      ) {
        void send('Fetch.continueRequest', { requestId })
      } else {
        evidence.blockedRequests.push(request.url)
        void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
      }
    }
    if (message.method === 'Runtime.exceptionThrown')
      evidence.pageErrors.push(message.params.exceptionDetails.text)
    if (!message.id) return
    const { resolve, reject, timer } = pending.get(message.id)
    clearTimeout(timer)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id
      const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10000)
      pending.set(requestId, { resolve, reject, timer })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    assert.equal(result.exceptionDetails, undefined, expression)
    return result.result.value
  }
  const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 350))')
  const viewport = async (width) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await settle()
  }
  const scroll = async (top) => {
    await evaluate(
      `(() => { const root = document.querySelector('.newspaper-scroll'); root.scrollTop = ${top}; root.dispatchEvent(new Event('scroll')); })()`,
    )
    await settle()
  }
  const screenshot = async (name) => {
    if (!artifacts) return
    await mkdir(artifacts, { recursive: true })
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(artifacts, `${name}.png`), Buffer.from(data, 'base64'))
  }
  const snapshot = () =>
    evaluate(`(() => {
    const root = document.querySelector('.newspaper-scroll'), rect = root.getBoundingClientRect();
    const box = node => { const r = node.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
    return { scroll:root.scrollTop, root:box(root), width:root.clientWidth, scrollWidth:root.scrollWidth,
      documentWidth:document.documentElement.scrollWidth, viewport:innerWidth,
      count:document.querySelectorAll('.newspaper-story').length,
      columns:[...document.querySelectorAll('.newspaper-column')].map(box),
      placeholder:document.querySelector('[data-newspaper-lead-placeholder]')?.getBoundingClientRect().height,
      stories:[...document.querySelectorAll('[data-story-id]')].map(node => ({ id:Number(node.dataset.storyId),
        ...box(node.closest('.newspaper-story')), headline:box(node),
        column:node.closest('.newspaper-column')?.getAttribute('aria-label') ?? 'lead',
        margin:parseFloat(getComputedStyle(node.closest('.newspaper-story')).marginBottom),
        focused:document.activeElement === node })) };
  })()`)
  const bounded = (state) => {
    evidence.maxMounted = Math.max(evidence.maxMounted, state.count)
    assert.ok(state.count <= 250, 'global mounted-story budget')
    assert.ok(state.scrollWidth <= state.width, 'no scroller horizontal overflow')
    assert.ok(state.documentWidth <= state.viewport, 'no page horizontal overflow')
  }
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1.5, `${message}: ${actual} vs ${expected}`)
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  evidence.browser = (await send('Browser.getVersion')).product
  await viewport(1280)
  await send('Page.navigate', {
    url: `${server.resolvedUrls.local[0]}tests/fixtures/newspaper-headline.html`,
  })
  await eventually(() => evaluate(`!!document.querySelector('[data-story-id="4"]')`))
  await evaluate('document.fonts.ready')
  await settle()
  let state = await snapshot()
  bounded(state)
  const lead = state.stories.find((story) => story.id === 1)
  const right = state.stories.find((story) => story.id === 4)
  const left = state.stories.find((story) => story.id === 2)
  assert.equal(state.columns.length, 3)
  close(lead.left, state.columns[0].left, 'lead starts at first column')
  close(lead.right, state.columns[1].right, 'lead ends at second column')
  close(right.left - lead.right, 28, 'third column alongside lead with one gap')
  close(right.top, lead.top, 'third column starts at lead top')
  close(left.top, lead.bottom + lead.margin, 'left continuation directly follows lead')
  assert.ok(right.bottom > left.top + 1000, 'tall right stack does not impose row-height barrier')
  evidence.layouts.push({ stage: 'wide-2+1', lead, right, left })
  await screenshot('wide-2+1')
  evidence.checks.push(
    'exact two-column lead plus top-aligned third column; no tall-right row barrier',
  )

  await evaluate('window.fixture.remove(1)')
  await settle()
  state = await snapshot()
  bounded(state)
  assert.ok(!state.stories.some((story) => story.column === 'lead'), 'no promoted lead')
  close(state.stories.find((story) => story.id === 2).top, lead.top, 'lead removal closes left gap')
  close(
    state.stories.find((story) => story.id === 4).top,
    right.top,
    'lead removal does not move right column',
  )
  await evaluate('window.fixture.restore()')
  await settle()
  await scroll(4000)
  state = await snapshot()
  bounded(state)
  evidence.layouts.push({
    stage: 'eviction',
    scroll: state.scroll,
    placeholder: state.placeholder,
    count: state.count,
  })
  assert.ok(!state.stories.some((story) => story.id === 1), 'offscreen lead evicted')
  close(
    state.placeholder,
    lead.height + lead.margin,
    'placeholder retains measured two-column lead extent',
  )
  await scroll(0)
  for (const [width, count] of [
    [760, 2],
    [360, 1],
    [1280, 3],
  ]) {
    await viewport(width)
    await scroll(0)
    state = await snapshot()
    bounded(state)
    assert.equal(state.columns.length, count)
    const currentLead = state.stories.find((story) => story.id === 1)
    close(currentLead.left, state.columns[0].left, 'responsive lead left edge')
    close(
      currentLead.right,
      state.columns[Math.min(1, count - 1)].right,
      'responsive lead available span',
    )
    evidence.layouts.push({ stage: `responsive-${width}`, columns: count, lead: currentLead })
    await screenshot(`responsive-${width}`)
  }
  evidence.checks.push(
    'lead removal/rollback, measured placeholder eviction, responsive 3/2/1 spans without overflow',
  )

  await evaluate('window.fixture.tallLead()')
  await settle()
  await scroll(4200)
  state = await snapshot()
  bounded(state)
  assert.ok(
    state.stories.some((story) => story.id === 1),
    'tall lead still represented',
  )
  const visibleRight = state.stories.filter(
    (story) =>
      story.column === 'Column 3' &&
      story.headline.top < state.root.bottom &&
      story.headline.bottom > state.root.top,
  )
  assert.ok(visibleRight.length > 0, 'right deep window covers viewport while left is inside lead')
  const rightStories = state.stories.filter((story) => story.column === 'Column 3')
  assert.ok(
    rightStories.at(-1).top > state.root.bottom,
    'right forward overscan uses its own origin',
  )
  assert.ok(rightStories[0].id > 4, 'right prefix is virtualized independently of tall lead')
  evidence.layouts.push({ stage: 'tall-lead-right-window', visibleRight, count: state.count })
  evidence.checks.push('independent right-column deep window with 6000px left lead')

  await evaluate('window.fixture.hide(2998)')
  await settle()
  bounded(await snapshot())
  await evaluate('window.fixture.show()')
  await settle()
  await settle()
  state = await snapshot()
  bounded(state)
  const target = state.stories.find((story) => story.id === 2998)
  assert.ok(
    target?.focused &&
      target.headline.top < state.root.bottom &&
      target.headline.bottom > state.root.top,
    'deep right selection visible and focused on reader return',
  )
  assert.ok(!state.stories.some((story) => story.id === 1), 'deep return does not mount lead')
  const anchor = state.stories
    .filter(
      (story) => story.headline.bottom > state.root.top && story.headline.top < state.root.bottom,
    )
    .sort((a, b) => a.headline.top - b.headline.top)[0]
  const anchorOffset = anchor.headline.top - state.root.top
  await viewport(760)
  state = await snapshot()
  bounded(state)
  const resized = state.stories.find((story) => story.id === anchor.id)
  assert.ok(resized, 'responsive deep anchor remains mounted')
  close(
    resized.headline.top - state.root.top,
    anchorOffset,
    'responsive deep anchor viewport offset',
  )
  evidence.checks.push(
    'deep right selection return/focus and responsive visible headline anchoring stay bounded',
  )
  assert.deepEqual(evidence.pageErrors, [])
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
    await writeFile(join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2))
  }
  socket?.close()
  browser?.kill()
  await server.close()
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

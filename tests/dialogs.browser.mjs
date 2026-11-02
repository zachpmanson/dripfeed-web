// Dependency-free Chromium/CDP regression. Uses Node's built-in WebSocket.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

assert.ok(process.env.CHROMIUM_PATH, 'Set CHROMIUM_PATH to a Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'dripfeed-dialog-'))
const artifacts = process.env.TEST_ARTIFACT_DIR
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/.pi-subagents/**'] } },
})
const evidence = { checks: [], pageErrors: [], blockedRequests: [], iframeFocus: [], mixed: [] }
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
  const key = async (key, modifiers = 0) => {
    const code = key === 'Tab' ? 9 : key === 'Escape' ? 27 : 13
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: key === 'Enter' ? '\r' : undefined,
      key,
      code: key,
      windowsVirtualKeyCode: code,
      modifiers,
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode: code,
      modifiers,
    })
    // Base UI redirects focus from its sentinels on the next animation frame.
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    )
  }
  const pointer = async (x, y, type, buttons) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
  const clickAt = async (x, y) => {
    await pointer(x, y, 'mousePressed', 1)
    await pointer(x, y, 'mouseReleased', 0)
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    )
  }
  const click = async (selector) => {
    const point = await evaluate(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`,
    )
    await clickAt(point.x, point.y)
  }
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Accessibility.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1000,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  })
  evidence.browser = (await send('Browser.getVersion')).product
  await send('Page.navigate', { url: `${server.resolvedUrls.local[0]}tests/fixtures/dialogs.html` })
  await eventually(() => evaluate(`!!document.querySelector('#settings')`))
  await evaluate(`fetch('/apps/news/api/v1-3/items/fixture/fulltext').catch(() => {})`)
  await eventually(() => evidence.blockedRequests.length === 1)
  assert.ok(evidence.blockedRequests[0].includes('/apps/news/'))
  const open = async (kind) => {
    // Use real keyboard activation, not a synthetic click.
    await evaluate(`document.querySelector('#${kind}').focus()`)
    await key('Enter')
    await eventually(() => evaluate(`!!document.querySelector('.app-dialog')`))
  }
  const closed = async (kind) => {
    await eventually(() => evaluate(`!document.querySelector('.app-dialog')`))
    assert.equal(await evaluate('document.activeElement.id'), kind, 'focus restores to trigger')
  }
  for (const [kind, name] of [
    ['settings', 'Settings'],
    ['add', 'Add'],
    ['feed', 'Feed settings — Example feed'],
  ]) {
    await open(kind)
    if (await evaluate(`document.querySelector('.app-dialog').tagName === 'DIALOG'`))
      assert.equal(await evaluate(`document.querySelector('.app-dialog').matches(':modal')`), true)
    let ax
    await eventually(async () => {
      ax = await send('Accessibility.getFullAXTree')
      return ax.nodes.some((node) => node.role?.value === 'dialog')
    })
    evidence.checks.push(
      ax.nodes
        .filter((node) => node.role?.value === 'dialog')
        .map((node) => ({ role: node.role.value, name: node.name?.value })),
    )
    assert.ok(
      ax.nodes.some(
        (node) =>
          node.role?.value === 'dialog' && node.name?.value.toLowerCase() === name.toLowerCase(),
      ),
      'named dialog appears in accessibility tree',
    )
    if (kind === 'settings')
      assert.ok(
        ax.nodes.some(
          (node) =>
            node.role?.value === 'textbox' &&
            node.name?.value === 'Custom article CSS' &&
            node.description?.value.includes('Applied live'),
        ),
        'CSS field has name and description',
      )
    assert.equal(
      await evaluate(
        `document.activeElement.matches('${kind === 'add' ? 'input[type=url]' : '.app-dialog button'}')`,
      ),
      true,
      'initial focus',
    )
    await evaluate(
      `window.controls = [...document.querySelector('.app-dialog').querySelectorAll('button, a[href], input, textarea, select')].filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length); controls[0].focus()`,
    )
    await key('Tab', 8)
    assert.equal(
      await evaluate('document.activeElement === controls.at(-1)'),
      true,
      'Shift-Tab wraps',
    )
    await key('Tab')
    assert.equal(await evaluate('document.activeElement === controls[0]'), true, 'Tab wraps')
    for (let i = 0; i < 25; i++) {
      await key('Tab')
      assert.equal(
        await evaluate(`!!document.activeElement.closest('.app-dialog')`),
        true,
        'forward keyboard focus stays inside',
      )
    }
    for (let i = 0; i < 25; i++) {
      await key('Tab', 8)
      assert.equal(
        await evaluate(`!!document.activeElement.closest('.app-dialog')`),
        true,
        'backward keyboard focus stays inside',
      )
    }
    if (kind === 'settings') {
      const geometry = await evaluate(
        `(() => { const d=document.querySelector('.app-dialog'); const r=d.getBoundingClientRect(); return {width:r.width,height:r.height,left:r.left,top:r.top} })()`,
      )
      evidence.checks.push({ desktopSettings: geometry })
      if (artifacts) {
        await mkdir(artifacts, { recursive: true })
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(join(artifacts, 'desktop.png'), Buffer.from(shot.data, 'base64'))
      }
    }
    assert.ok(
      !ax.nodes.some((node) => !node.ignored && node.name?.value === 'Background input'),
      'background is excluded from active accessibility tree',
    )
    await evaluate(
      `document.querySelector('iframe').contentDocument.querySelector('button').focus()`,
    )
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    )
    const focusProbe = await evaluate(`({
      inside: !!document.activeElement.closest('.app-dialog'),
      activeTag: document.activeElement.tagName,
      frameActiveTag: document.querySelector('iframe').contentDocument.activeElement.tagName,
    })`)
    evidence.iframeFocus.push({ kind, ...focusProbe })
    // Diagnostic only: Chromium also permits this same-origin scripted focus
    // with the native baseline. Pointer/keyboard interaction is the parity gate.
    if (!focusProbe.inside) await evaluate(`document.querySelector('.app-dialog button').focus()`)
    // A click on dialog padding must not dismiss it.
    const rect = await evaluate(
      `(() => {const r=document.querySelector('.app-dialog').getBoundingClientRect();return {x:r.x,y:r.y}})()`,
    )
    await clickAt(rect.x + 3, rect.y + 3)
    assert.equal(await evaluate(`!!document.querySelector('.app-dialog')`), true)
    await key('Escape')
    await closed(kind)
    await open(kind)
    await click('.app-dialog button[aria-label=close]')
    await closed(kind)
    await open(kind)
    const inside = await evaluate(
      `(() => {const r=document.querySelector('.app-dialog').getBoundingClientRect();return {x:r.x+3,y:r.y+3}})()`,
    )
    await pointer(inside.x, inside.y, 'mousePressed', 1)
    await pointer(2, 2, 'mouseReleased', 0)
    assert.equal(
      await evaluate(`!!document.querySelector('.app-dialog')`),
      true,
      'drag to backdrop does not dismiss',
    )
    await pointer(2, 2, 'mousePressed', 1)
    await pointer(inside.x, inside.y, 'mouseReleased', 0)
    assert.equal(
      await evaluate(`!!document.querySelector('.app-dialog')`),
      true,
      'drag from backdrop into content does not dismiss',
    )
    await clickAt(2, 2)
    await closed(kind)
    await open(kind)
    const article = await evaluate(
      `(() => { const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x+25,y:r.y+15} })()`,
    )
    await clickAt(article.x, article.y)
    await closed(kind)
    assert.equal(
      await evaluate(
        `document.querySelector('iframe').contentDocument.body.dataset.clicked ?? null`,
      ),
      null,
      'background article button cannot activate through backdrop',
    )
    await clickAt(article.x, article.y)
    assert.equal(
      await evaluate(`document.querySelector('iframe').contentDocument.body.dataset.clicked`),
      'true',
      'iframe interaction restores after close',
    )
    await evaluate(`delete document.querySelector('iframe').contentDocument.body.dataset.clicked`)
    evidence.checks.push(
      `${kind}: AX name, initial focus, Tab/Shift-Tab, inert app/iframe, padding/drag, Escape/close/backdrop, restored trigger`,
    )
  }
  await open('add')
  await click(' .app-dialog input[type=checkbox]')
  await eventually(() => evaluate(`!!document.querySelector(' .app-dialog input[type=password]')`))
  assert.equal(
    await evaluate(
      `document.querySelector(' .app-dialog input[type=password]').closest('label').textContent`,
    ),
    'Feed password',
  )
  await evaluate(`document.querySelector(' .app-dialog input[type=password]').focus()`)
  await send('Input.insertText', { text: 'dummy-feed-password' })
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 450,
    deviceScaleFactor: 1,
    mobile: false,
  })
  for (const theme of ['dark', 'light']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`)
    const metrics = await evaluate(
      `(() => {const d=document.querySelector('.app-dialog'); const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrolls:d.scrollHeight>d.clientHeight}})()`,
    )
    assert.ok(
      metrics.left >= 0 && metrics.right <= 360 && metrics.top >= 0 && metrics.bottom <= 450,
    )
    assert.equal(metrics.scrolls, true, 'expanded feed auth form scrolls within small viewport')
    await evaluate(`document.querySelector(' .app-dialog button[type=submit]').focus()`)
    await key('Tab')
    assert.equal(
      await evaluate(`document.activeElement.matches(' .app-dialog button[aria-label=close]')`),
      true,
    )
  }
  await key('Escape')
  await closed('add')
  await open('add')
  assert.equal(
    await evaluate(`!!document.querySelector(' .app-dialog input[type=password]')`),
    false,
  )
  await evaluate(`document.querySelector(' .app-dialog input[type=checkbox]').click()`)
  assert.equal(
    await evaluate(`document.querySelector(' .app-dialog input[type=password]').value`),
    '',
  )
  await key('Escape')
  await closed('add')
  evidence.checks.push(
    'feed auth: labelled masked password; optional controls reset on reopen; expanded form fits/scrolls at 360x450 in both themes; Tab wraps; no API submission',
  )

  // Preference changes must really insert/remove the editor and preserve Tab edges.
  await open('settings')
  await click('.app-dialog button[aria-label=close]')
  await closed('settings')
  await click('#settings')
  await eventually(() => evaluate(`!!document.querySelector('.app-dialog')`))
  assert.equal(
    await evaluate(`document.activeElement.matches('.app-dialog button[aria-label=close]')`),
    true,
    'pointer opening retains close-button focus',
  )
  await evaluate(`document.querySelector('.css-actions button').click()`)
  await eventually(() => evaluate(`!document.querySelector('textarea')`))
  await evaluate(
    `[...document.querySelectorAll('[role="radio"]')].find(e => e.textContent === 'Custom').click()`,
  )
  await eventually(() => evaluate(`!!document.querySelector('textarea')`))
  assert.equal(
    await evaluate(`document.querySelector('textarea').value`),
    '',
    'reset clears CSS before editor reopens',
  )
  await evaluate(`document.querySelector('.settings-form > :last-child button').focus()`)
  await key('Tab')
  assert.equal(
    await evaluate(`document.activeElement.matches('.app-dialog button[aria-label=close]')`),
    true,
    'dynamic controls preserve wrapping',
  )
  await key('Escape')
  await closed('settings')
  for (let i = 0; i < 3; i++) {
    await open('settings')
    await key('Escape')
    await closed('settings')
  }
  evidence.checks.push(
    'Settings: pointer opening, dynamic editor/reset, current Tab edges, rapid reopen',
  )

  const stack = async (kind) => {
    await evaluate(`window.dispatchEvent(new CustomEvent('fixture-stack', {detail: '${kind}'}))`)
  }
  const activeOwner = async (kind) => {
    const expected =
      kind === 'settings'
        ? 'settings'
        : kind === 'add'
          ? 'add'
          : kind === 'native'
            ? 'native probe'
            : 'feed settings'
    await eventually(() =>
      evaluate(`(() => {
      const visible = [...document.querySelectorAll('.app-dialog')].filter(d => d.getClientRects().length);
      const d = visible[0];
      return visible.length === 1 && d.textContent.toLowerCase().includes('${expected}') && d.contains(document.activeElement);
    })()`),
    )
    const state = await evaluate(`(() => {
      const visible = [...document.querySelectorAll('.app-dialog')].filter(d => d.getClientRects().length);
      const d = visible[0], r = d.getBoundingClientRect();
      window.activePopup = d;
      return { visible: visible.length, hit: d.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)) };
    })()`)
    assert.equal(state.hit, true, `${kind}: newest owner wins pointer hit-testing`)
    let ax
    await eventually(async () => {
      ax = await send('Accessibility.getFullAXTree')
      const dialogs = ax.nodes.filter((n) => !n.ignored && n.role?.value === 'dialog')
      return dialogs.length === 1 && dialogs[0].name?.value.toLowerCase().includes(expected)
    })
    for (let i = 0; i < 3; i++) {
      await key('Tab')
      assert.equal(
        await evaluate('activePopup.contains(document.activeElement)'),
        true,
        'newest owner traps Tab',
      )
      await key('Tab', 8)
      assert.equal(
        await evaluate('activePopup.contains(document.activeElement)'),
        true,
        'newest owner traps Shift-Tab',
      )
    }
    return state
  }

  // Parent-owned forms stay mounted; only the newest owner is presented.
  // These four cases are mandatory, including pre-Escape interaction ownership.
  for (const native of ['add', 'feed', 'native']) {
    for (const [first, second] of [
      ['settings', native],
      [native, 'settings'],
    ]) {
      await open(first)
      if (first === 'add') await click('.app-dialog input[type=checkbox]')
      await evaluate(
        `window.savedControl = document.querySelector('.app-dialog input[type=password]') ?? document.querySelector('.app-dialog textarea') ?? document.querySelector('.app-dialog input') ?? document.querySelector('.app-dialog button'); savedControl.focus()`,
      )
      if (first !== 'feed') await send('Input.insertText', { text: 'synthetic-preserved-value' })
      await evaluate(
        `window.savedValue = savedControl.value; window.savedChecked = savedControl.checked`,
      )
      await stack(second)
      await eventually(() => evaluate(`document.querySelectorAll('.app-dialog').length === 2`))
      const beforeEscape = await activeOwner(second)
      assert.equal(
        await evaluate('savedControl.isConnected'),
        true,
        'covered form node remains mounted',
      )
      await key('Escape')
      await activeOwner(first)
      const remaining = await evaluate(
        `Array.from(document.querySelectorAll('.app-dialog')).map(d => d.textContent)`,
      )
      const focusInside = await evaluate(`!!document.activeElement.closest('.app-dialog')`)
      const expected =
        first === 'settings'
          ? 'Settings'
          : first === 'add'
            ? 'Add'
            : first === 'native'
              ? 'Native probe'
              : 'Feed settings'
      const preserved = await evaluate(
        'savedControl.isConnected && savedControl.value === savedValue && savedControl.checked === savedChecked && document.activeElement === savedControl',
      )
      const passed =
        remaining.length === 1 && remaining[0].includes(expected) && focusInside && preserved
      evidence.mixed.push({
        first,
        second,
        beforeEscape,
        remaining,
        focusInside,
        preserved,
        passed,
      })
      await stack('reset')
      await eventually(() => evaluate(`!document.querySelector('.app-dialog')`))
    }
  }

  // Removing either type of covered owner must not steal focus or revive it.
  for (const [first, second] of [
    ['add', 'settings'],
    ['settings', 'add'],
    ['native', 'settings'],
    ['settings', 'native'],
  ]) {
    await open(first)
    await stack(second)
    await activeOwner(second)
    await stack('remove-covered')
    await eventually(() => evaluate(`document.querySelectorAll('.app-dialog').length === 1`))
    await activeOwner(second)
    await key('Escape')
    await closed(first)
  }
  evidence.checks.push(
    'covered owner removal in both directions: active owner and connected return chain preserved',
  )

  // Genuine same-commit replacements (not merely removing covers from Add).
  for (const [first, second] of [
    ['settings', 'add'],
    ['add', 'settings'],
    ['settings', 'feed'],
    ['feed', 'settings'],
    ['add', 'feed'],
    ['native', 'settings'],
    ['settings', 'native'],
  ]) {
    await open(first)
    await stack(`replace-${second}`)
    await eventually(() => evaluate(`document.querySelectorAll('.app-dialog').length === 1`))
    await activeOwner(second)
    await key('Escape')
    // With no underlying owner, Feed settings' explicit persistent row wins.
    await closed(second === 'feed' ? 'feed' : first)
  }
  evidence.checks.push(
    'atomic Base/native replacements: pending opener chain and explicit feed-row return targets preserved',
  )

  // Three owners, then a rapid full replacement: no stale focus jobs or revivals.
  for (const replace of [false, true]) {
    await open('add')
    await stack('settings')
    await activeOwner('settings')
    await stack('third-feed')
    await activeOwner('feed')
    assert.equal(await evaluate(`document.querySelectorAll('.app-dialog').length`), 3)
    if (replace) {
      await stack('replace-add')
      await eventually(() => evaluate(`document.querySelectorAll('.app-dialog').length === 1`))
      await activeOwner('add')
    } else {
      await key('Escape')
      await activeOwner('settings')
      await key('Escape')
      await activeOwner('add')
    }
    await key('Escape')
    await closed('add')
  }
  evidence.checks.push(
    'three-owner LIFO dismissal and rapid replacement: one interactive owner, no stale focus restoration',
  )

  await open('settings')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 450,
    deviceScaleFactor: 1,
    mobile: false,
  })
  for (const theme of ['dark', 'light']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`)
    const metrics = await evaluate(
      `(() => {const d=document.querySelector('.app-dialog'); const r=d.getBoundingClientRect();const backdrop=document.querySelector('.base-dialog-backdrop');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrolls:d.scrollHeight>d.clientHeight,text:getComputedStyle(d).color,backdrop:backdrop ? getComputedStyle(backdrop).backgroundColor : getComputedStyle(d,'::backdrop').backgroundColor}})()`,
    )
    assert.ok(
      metrics.left >= 0 && metrics.right <= 360 && metrics.top >= 0 && metrics.bottom <= 450,
      'dialog fits small viewport',
    )
    assert.equal(metrics.scrolls, true, 'long settings scrolls inside dialog')
    assert.equal(metrics.backdrop, 'rgba(0, 0, 0, 0.45)')
    evidence.checks.push(
      `${theme}: small viewport contained/scrollable; text ${metrics.text}; original scrim preserved`,
    )
    if (artifacts) {
      await mkdir(artifacts, { recursive: true })
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(artifacts, `${theme}.png`), Buffer.from(shot.data, 'base64'))
    }
  }
  assert.deepEqual(evidence.pageErrors, [])
  assert.equal(evidence.mixed.length, 6)
  assert.ok(
    evidence.mixed.every((test) => test.passed),
    'mixed native/Base overlays must dismiss only the last-opened owner',
  )
  evidence.result = 'passed'
} catch (error) {
  evidence.result = 'failed'
  evidence.error = error.stack
  process.exitCode = 1
} finally {
  socket?.close()
  if (browser) {
    const exited = new Promise((resolve) => browser.once('exit', resolve))
    browser.kill()
    await exited
  }
  await server.close()
  await rm(profile, { recursive: true, force: true })
  console.log(JSON.stringify(evidence, null, 2))
  if (artifacts) {
    await mkdir(artifacts, { recursive: true })
    await writeFile(join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2))
  }
}

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
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
const evidence = { checks: [], pageErrors: [] }
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
  }
  const pointer = async (x, y, type, buttons) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
  const clickAt = async (x, y) => {
    await pointer(x, y, 'mousePressed', 1)
    await pointer(x, y, 'mouseReleased', 0)
  }
  const click = async (selector) => {
    const point = await evaluate(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`,
    )
    await clickAt(point.x, point.y)
  }
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
  const open = async (kind) => {
    // Use real keyboard activation, not a synthetic click.
    await evaluate(`document.querySelector('#${kind}').focus()`)
    await key('Enter')
    await eventually(() => evaluate(`!!document.querySelector('dialog[open]')`))
  }
  const closed = async (kind) => {
    await eventually(() => evaluate(`!document.querySelector('dialog')`))
    assert.equal(await evaluate('document.activeElement.id'), kind, 'focus restores to trigger')
  }
  for (const [kind, name] of [
    ['settings', 'Settings'],
    ['add', 'Add'],
    ['feed', 'Feed settings — Example feed'],
  ]) {
    await open(kind)
    assert.equal(await evaluate(`document.querySelector('dialog').matches(':modal')`), true)
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
      'named native dialog appears in accessibility tree',
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
        `document.activeElement.matches('${kind === 'add' ? 'input[type=url]' : 'dialog button'}')`,
      ),
      true,
      'initial focus',
    )
    await evaluate(
      `window.controls = [...document.querySelectorAll('dialog button, dialog a[href], dialog input, dialog textarea, dialog select')].filter(e => !e.disabled && e.getClientRects().length); controls[0].focus()`,
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
        await evaluate(`!!document.activeElement.closest('dialog')`),
        true,
        'forward keyboard focus stays inside',
      )
    }
    for (let i = 0; i < 25; i++) {
      await key('Tab', 8)
      assert.equal(
        await evaluate(`!!document.activeElement.closest('dialog')`),
        true,
        'backward keyboard focus stays inside',
      )
    }
    assert.ok(
      !ax.nodes.some((node) => !node.ignored && node.name?.value === 'Background input'),
      'background is excluded from active accessibility tree',
    )
    // A click on dialog padding must not dismiss it.
    const rect = await evaluate(
      `(() => {const r=document.querySelector('dialog').getBoundingClientRect();return {x:r.x,y:r.y}})()`,
    )
    await clickAt(rect.x + 3, rect.y + 3)
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`), true)
    await key('Escape')
    await closed(kind)
    await open(kind)
    await click('dialog button[aria-label=close]')
    await closed(kind)
    await open(kind)
    const inside = await evaluate(
      `(() => {const r=document.querySelector('dialog').getBoundingClientRect();return {x:r.x+3,y:r.y+3}})()`,
    )
    await pointer(inside.x, inside.y, 'mousePressed', 1)
    await pointer(2, 2, 'mouseReleased', 0)
    assert.equal(
      await evaluate(`!!document.querySelector('dialog[open]')`),
      true,
      'drag to backdrop does not dismiss',
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
    evidence.checks.push(
      `${kind}: AX name, initial focus, Tab/Shift-Tab, inert app/iframe, padding/drag, Escape/close/backdrop, restored trigger`,
    )
  }
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
      `(() => {const d=document.querySelector('dialog'); const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrolls:d.scrollHeight>d.clientHeight,text:getComputedStyle(d).color,backdrop:getComputedStyle(d,'::backdrop').backgroundColor}})()`,
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

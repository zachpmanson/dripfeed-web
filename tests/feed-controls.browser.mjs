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
const evidence = { checks: [], errors: [], blockedRequests: [], layouts: [] }
// Mock at module boundaries, never forward writes or extraction GETs to News.
const server = await createServer({
  plugins: [
    {
      name: 'fixture-feed-operations',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer?.includes('/src/components/feed/')) return
        if (source === '../../api/news') return '\0fixture-news'
        if (source === '../../actions') return '\0fixture-actions'
        if (source === '../../utils' && importer.includes('FeedContextMenu'))
          return '\0fixture-copy'
      },
      load(id) {
        const exports =
          id === '\0fixture-news'
            ? ['createFeed', 'createFolder', 'deleteFeed', 'moveFeed', 'renameFeed', 'renameFolder']
            : id === '\0fixture-actions'
              ? ['markFeedAllRead', 'setFeedFullText']
              : null
        if (exports)
          return exports
            .map((name) => `export const ${name}=(...args)=>window.fixtureWrite('${name}',args);`)
            .join('\n')
        if (id === '\0fixture-copy')
          return 'export const copyText=(...args)=>window.fixtureCopy(...args);'
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  await server.listen()
  const origin = new URL(server.resolvedUrls.local[0]).origin
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
  evidence.browser = browser.version()
  const context = await browser.newContext({ viewport: { width: 1000, height: 720 } })
  await context.route('**/*', (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.origin === origin && !url.pathname.startsWith('/apps') && request.method() === 'GET')
      return route.continue()
    evidence.blockedRequests.push(request.url())
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  const reset = async () => {
    await page.goto(`${origin}/tests/fixtures/feed-controls.html`)
    await page.locator('[data-feed-id="42"]').waitFor()
  }
  const row = () => page.locator('[data-feed-id="42"]')
  const rootMenu = () => page.getByRole('menu', { name: 'Actions for Example feed', exact: true })
  const item = (name) => page.getByRole('menuitem', { name, exact: true })
  const openMenu = async (keyboard = true) => {
    await row().scrollIntoViewIfNeeded()
    if (keyboard) {
      await row().focus()
      await page.keyboard.press('Shift+F10')
    } else await row().click({ button: 'right' })
    await rootMenu().waitFor()
  }
  const assertFocus = async (selector) =>
    page.waitForFunction((selector) => document.activeElement.matches(selector), selector, {
      timeout: 3000,
    })
  const waitAbsent = async (locator) => locator.waitFor({ state: 'detached' })
  await reset()
  await page.evaluate(() => fetch('/apps/news/api/v1-3/items/fixture/fulltext').catch(() => {}))
  assert.equal(evidence.blockedRequests.length, 1, 'extraction GET blocked before Vite proxy')

  // Real row trigger, keyboard anchors and managed submenu ownership.
  await openMenu()
  const anchor = await row().boundingBox(),
    menuBox = await rootMenu().boundingBox()
  assert.ok(menuBox.x >= anchor.x && menuBox.y > 0, 'keyboard anchored to row, not origin')
  assert.equal(await row().getAttribute('aria-current'), 'page')
  assert.equal(await row().locator('button').count(), 0, 'no nested button')
  await page.keyboard.press('Home')
  await assertFocus('[role="menuitem"]')
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    'Mark all as read',
  )
  await page.keyboard.press('End')
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    'Copy feed url',
  )
  await page.keyboard.press('m')
  await page.keyboard.press('o')
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    'Move to folder…',
    'typeahead actually moves focus',
  )
  await page.keyboard.press('ArrowRight')
  await page.getByRole('menu', { name: 'Move to folder', exact: true }).waitFor()
  await page.keyboard.press('End')
  assert.ok((await page.evaluate(() => document.activeElement.textContent)).includes('Folder 35'))
  await page.keyboard.press('Escape')
  await waitAbsent(page.getByRole('menu', { name: 'Move to folder', exact: true }))
  assert.equal(await rootMenu().isVisible(), true, 'submenu Escape leaves root open')
  await page.keyboard.press('ArrowRight')
  await page.getByRole('menu', { name: 'Move to folder', exact: true }).waitFor()
  await page.keyboard.press('ArrowLeft')
  await waitAbsent(page.getByRole('menu', { name: 'Move to folder', exact: true }))
  await page.keyboard.press('Escape')
  await waitAbsent(rootMenu())
  await assertFocus('[data-feed-id="42"]')
  assert.equal(await page.evaluate(() => fixtureLog.selected), 0)
  evidence.checks.push(
    'Real persistent row: keyboard anchor, aria-current, no nested button, Home/End/typeahead, submenu Right/Left and single-layer Escape',
  )

  // Outside clicks consume the first press rather than navigating behind the menu.
  await openMenu(false)
  const background = await page.locator('#background').boundingBox()
  await page.mouse.click(background.x + 8, background.y + 8)
  await waitAbsent(rootMenu())
  assert.equal(await page.locator('#background').textContent(), 'Background 0', 'no clickthrough')

  // Deferred mutation: duplicate guards, visible failure, retry, exact payload.
  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  await openMenu()
  await item('Mark all as read').click()
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => fixtureLog.writes.length), 1)
  await page.evaluate(() => fixtureLog.pending.shift()(true))
  await page.getByRole('alert').filter({ hasText: 'Fixture write failed' }).waitFor()
  await page.evaluate(() => (fixtureLog.mode = 'resolve'))
  await item('Mark all as read').click()
  await waitAbsent(rootMenu())
  assert.equal(await page.evaluate(() => fixtureLog.writes.length), 2)
  assert.equal(await page.evaluate(() => fixtureLog.changes), 1)
  assert.equal(await page.evaluate(() => fixtureLog.writes[0].args[1]), 42)

  await openMenu()
  await item('Move to folder…').hover()
  const destination = item('Destination')
  await destination.waitFor()
  await destination.click()
  await waitAbsent(rootMenu())
  assert.equal(await page.evaluate(() => fixtureLog.writes.at(-1).args[2]), 1)
  // Native prompt and confirm remain native and cancellation does not write.
  const beforeCancel = await page.evaluate(() => fixtureLog.writes.length)
  page.once('dialog', (dialog) => dialog.dismiss())
  await openMenu()
  await item('Rename').click()
  assert.equal(await rootMenu().isVisible(), true)
  page.once('dialog', (dialog) => dialog.dismiss())
  await item('Delete').click()
  assert.equal(await page.evaluate(() => fixtureLog.writes.length), beforeCancel)
  await page.keyboard.press('Escape')
  evidence.checks.push(
    'Outside click consumed; deferred mark-read guards/errors/retry; numeric move payload; unchanged native prompt/confirm cancel',
  )

  // Copy acknowledgement and old lifetime isolation, including same-feed reopen.
  await openMenu()
  await item('Copy feed url').click()
  await item('Copied').waitFor()
  await page.waitForTimeout(300)
  assert.equal(await rootMenu().isVisible(), true)
  await waitAbsent(rootMenu())
  await openMenu()
  await item('Copy feed url').click()
  await item('Copied').waitFor()
  await page.keyboard.press('Escape')
  await openMenu()
  await page.waitForTimeout(800)
  assert.equal(await rootMenu().isVisible(), true, 'old timer cannot close new menu')
  await page.keyboard.press('Escape')
  await page.evaluate(() => (fixtureLog.copyMode = 'pending'))
  await openMenu()
  await item('Copy feed url').click()
  await page.keyboard.press('Escape')
  await openMenu()
  await page.evaluate(() => fixtureLog.copies.shift()(false))
  await page.waitForTimeout(800)
  assert.equal(await rootMenu().isVisible(), true, 'old clipboard completion cannot close new menu')
  assert.equal(await item('Copy feed url').isVisible(), true)
  await page.keyboard.press('Escape')
  // Mutation completion from a dismissed instance must not dismiss its replacement.
  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  await openMenu()
  await item('Mark all as read').click()
  await page.keyboard.press('Escape')
  await openMenu()
  await page.evaluate(() => fixtureLog.pending.shift()(false))
  await page.waitForTimeout(100)
  assert.equal(await rootMenu().isVisible(), true)
  await page.keyboard.press('Escape')
  evidence.checks.push(
    '700ms copy acknowledgement; dismissed timers, clipboard and mutation promises cannot dismiss same-feed replacement',
  )

  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  await openMenu()
  await item('Mark all as read').click()
  await page.keyboard.press('Escape')
  const otherRow = page.locator('[data-feed-id="43"]')
  await otherRow.scrollIntoViewIfNeeded()
  await otherRow.click({ button: 'right' })
  const otherMenu = page.getByRole('menu', { name: 'Actions for Other feed', exact: true })
  await otherMenu.waitFor()
  await page.evaluate(() => fixtureLog.pending.shift()(true))
  await page.waitForTimeout(100)
  assert.equal(
    await otherMenu.isVisible(),
    true,
    'late rejection cannot dismiss a different-feed menu',
  )
  assert.equal(
    await otherMenu.getByRole('alert').count(),
    0,
    'old error cannot leak into different-feed menu',
  )
  await page.keyboard.press('Escape')
  evidence.checks.push(
    'Different-feed reopening also isolates late write rejection; no leaked error or stale dismissal',
  )

  // Pointer and keyboard handoffs survive menu disposal and replacement row nodes.
  for (const keyboard of [false, true]) {
    await reset()
    await openMenu(keyboard)
    if (keyboard) {
      await item('Feed settings…').focus()
      await page.keyboard.press('Enter')
    } else await item('Feed settings…').click()
    const dialog = page.getByRole('dialog', { name: 'Feed settings — Example feed' })
    await dialog.waitFor()
    await page.waitForTimeout(100)
    await assertFocus('.app-dialog button')
    await page.evaluate(() => {
      window.oldRow = document.querySelector('[data-feed-id="42"]')
      fixtureReplaceRow()
    })
    assert.equal(await page.evaluate(() => oldRow.isConnected), false)
    await page.keyboard.press('Escape')
    await waitAbsent(dialog)
    await assertFocus('[data-feed-id="42"]')
    assert.equal(await rootMenu().count(), 0)
  }
  await openMenu()
  await item('Feed settings…').click()
  await page.getByRole('dialog').waitFor()
  await page.evaluate(() => fixtureRemoveRow())
  await page.keyboard.press('Escape')
  await waitAbsent(page.getByRole('dialog'))
  await assertFocus('[data-feed-focus-fallback]')
  evidence.checks.push(
    'Pointer/keyboard menu → independent settings → replaced persistent row; removed row returns to connected sidebar fallback; no focus theft or double Escape',
  )

  for (const removal of ['collapse', 'folder']) {
    await reset()
    await page.evaluate(() => fixtureReplaceRow())
    await openMenu()
    await page.evaluate((removal) => {
      if (removal === 'collapse') document.querySelector('.caret-btn').click()
      else fixtureRemoveFolder()
    }, removal)
    await waitAbsent(rootMenu())
    await assertFocus('[data-feed-focus-fallback]')
    assert.equal(await row().count(), 0, 'open grouped trigger really removed')
    await page.evaluate(() => localStorage.removeItem('dripfeed.folders.collapsed'))
  }
  for (const target of ['root', 'submenu']) {
    await reset()
    await openMenu()
    if (target === 'submenu') {
      await item('Move to folder…').focus()
      await page.keyboard.press('ArrowRight')
      await page.getByRole('menu', { name: 'Move to folder', exact: true }).waitFor()
    }
    const prevented = await page.evaluate((target) => {
      const popup =
        target === 'root'
          ? document.querySelector('[aria-label="Actions for Example feed"]')
          : document.querySelector('[aria-label="Move to folder"][role="menu"]')
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      popup.dispatchEvent(event)
      return event.defaultPrevented
    }, target)
    assert.equal(prevented, true, 'native menu suppressed inside managed popup')
    await waitAbsent(rootMenu())
  }
  evidence.checks.push(
    'Open grouped menu panel/folder removal resolves connected fallback after host removal; right-click inside either popup suppresses native menu and dismisses app menu',
  )

  await reset()
  // Typed Select and radio choices (including false/0) and preference Checkboxes.
  const headerSelect = page.getByRole('combobox')
  await headerSelect.focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('option', { name: 'Unread first', exact: true }).click()
  assert.equal(await headerSelect.textContent(), 'Unread first')
  assert.equal(
    await headerSelect.locator('svg.tabler-icon-chevron-down[aria-hidden="true"]').count(),
    1,
  )
  assert.equal(await page.evaluate(() => fixtureLog.values.at(-1)), 'priority')
  for (const [group, first, second, value] of [
    ['Numeric choice', 'Zero', 'One', 0],
    ['Boolean choice', 'False', 'True', false],
  ]) {
    await page
      .getByRole('radiogroup', { name: group })
      .getByRole('radio', { name: second, exact: true })
      .click()
    await page
      .getByRole('radiogroup', { name: group })
      .getByRole('radio', { name: first, exact: true })
      .click()
    assert.equal(await page.evaluate(() => fixtureLog.values.at(-1)), value)
    assert.equal(
      await page
        .getByRole('radiogroup', { name: group })
        .locator('[role="radio"][aria-checked="true"]')
        .count(),
      1,
    )
  }
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })
  await settingsButton.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(700)
  await page.getByRole('tooltip', { name: 'Settings' }).waitFor({ timeout: 1000 })
  assert.equal(await settingsButton.getAttribute('title'), null)
  await page.keyboard.press('Escape')
  await settingsButton.click()
  for (const label of ['Show favicons', 'Mark as read on single click', 'Dim Boilerplate Text']) {
    const checkbox = page.getByRole('checkbox', { name: label })
    await checkbox.focus()
    await page.keyboard.press('Space')
    assert.equal(await checkbox.getAttribute('aria-checked'), 'false')
    assert.equal(await page.evaluate(() => typeof fixtureLog.values.at(-1)), 'boolean')
    await page.getByText(label, { exact: true }).click()
    assert.equal(await checkbox.getAttribute('aria-checked'), 'true')
  }
  await page.keyboard.press('Escape')

  // Destination select must live above Add and consume its own Escape.
  await page.getByRole('button', { name: 'Add feed or folder' }).click()
  const add = page.getByRole('dialog', { name: 'Add', exact: true })
  await add.waitFor()
  const folderSelect = page.getByRole('combobox', { name: 'Destination folder' })
  await folderSelect.focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('option', { name: 'Destination', exact: true }).click()
  await folderSelect.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  assert.equal(await add.isVisible(), true, 'first Escape dismisses listbox only')
  await assertFocus('[role="combobox"]')
  await folderSelect.focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('listbox').waitFor()
  await page.evaluate(() => fixtureCover())
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
  await assertFocus('.app-dialog button[aria-label="close"]')
  assert.equal(
    await page.getByRole('listbox').count(),
    0,
    'covered Add cannot leave an interactive portaled listbox',
  )
  await page.keyboard.press('Escape')
  await add.waitFor()
  await page.getByLabel('URL', { exact: true }).fill('https://fixture.invalid/new')
  await page.getByLabel('Use HTTP Basic Auth').check()
  await page.getByLabel('Feed username', { exact: true }).fill('fixture-user')
  await page.getByLabel('Feed password', { exact: true }).fill('fixture-password')
  await page.getByRole('tab', { name: 'Feed', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.getByLabel('Name', { exact: true }).waitFor()
  await assertFocus('input[type="text"]')
  await page.getByRole('tab', { name: 'Feed', exact: true }).click()
  assert.equal(
    await page.getByLabel('Feed password', { exact: true }).count(),
    0,
    'keyboard Folder cleared credentials',
  )
  await assertFocus('input[type="url"]')
  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  await page.getByRole('button', { name: 'Add feed', exact: true }).click()
  assert.equal(
    await page.getByRole('tab', { name: 'Folder', exact: true }).getAttribute('aria-disabled'),
    'true',
  )
  await page.getByRole('tab', { name: 'Folder', exact: true }).click({ force: true })
  assert.equal(await page.getByLabel('URL', { exact: true }).count(), 1)
  assert.equal(
    await page.evaluate(() => fixtureLog.writes.at(-1).args[2]),
    1,
    'destination stays numeric',
  )
  await page.evaluate(() => fixtureCover())
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await add.waitFor()
  await assertFocus('.app-dialog button[aria-label="close"]')
  await page.evaluate(() => fixtureLog.pending.shift()(true))
  await page.getByText('Fixture write failed', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await waitAbsent(add)
  evidence.checks.push(
    'Typed header/destination Select; modal listbox Escape/layering; typed 0/false mandatory radios; Tooltip label/focus; strict boolean Checkboxes; keyboard Folder auth clearing/focus/busy',
  )

  // External Toast state replaces, persists beyond default timeout, and never steals focus.
  await page.locator('#background').focus()
  await page.evaluate(() => fixtureShowError('First error'))
  await page.getByRole('alert').waitFor()
  await assertFocus('#background')
  await page.waitForTimeout(5200)
  assert.equal(await page.getByRole('alert').count(), 1)
  await page.evaluate(() => fixtureShowError('Replacement error'))
  assert.equal(await page.getByRole('alert').count(), 1)
  assert.equal(await page.getByRole('alert').textContent(), 'Replacement errorDismiss')
  await page.getByRole('button', { name: 'Dismiss error' }).click()
  await waitAbsent(page.getByRole('alert'))
  await page.evaluate(() => fixtureShowError(null))
  await page.waitForTimeout(100)
  assert.equal(await page.getByRole('alert').count(), 0)

  // Folder context menu: persistent trigger, rename retry and Add handoff.
  await reset()
  const folderRow = () => page.locator('[data-folder-id="1"]')
  const folderMenu = () => page.getByRole('menu', { name: 'Actions for folder Destination', exact: true })
  const openFolder = async (keyboard = false) => {
    await folderRow().scrollIntoViewIfNeeded()
    if (keyboard) {
      await folderRow().focus()
      await page.keyboard.press('Shift+F10')
    } else await folderRow().click({ button: 'right' })
    await folderMenu().waitFor()
  }
  await openFolder()
  assert.equal(await page.evaluate(() => fixtureLog.selected), 0, 'folder right-click does not select')
  assert.equal(await folderRow().locator('button').count(), 0)
  page.once('dialog', (dialog) => dialog.dismiss())
  await item('Rename').click()
  assert.equal(await page.evaluate(() => fixtureLog.writes.length), 0)
  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  page.once('dialog', (dialog) => dialog.accept(' Renamed folder '))
  await item('Rename').click()
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => fixtureLog.writes.length), 1)
  await page.evaluate(() => fixtureLog.pending.shift()(true))
  await page.getByRole('alert').filter({ hasText: 'Fixture write failed' }).waitFor()
  await page.evaluate(() => (fixtureLog.mode = 'resolve'))
  page.once('dialog', (dialog) => dialog.accept(' Renamed folder '))
  await item('Rename').click()
  await waitAbsent(folderMenu())
  assert.deepEqual(await page.evaluate(() => fixtureLog.writes.at(-1)), {
    kind: 'renameFolder', args: [{ baseUrl: '', user: 'fixture', appPassword: 'fixture' }, 1, 'Renamed folder'],
  })
  await assertFocus('[data-folder-id="1"]')
  for (const keyboard of [false, true]) {
    await openFolder(keyboard)
    if (keyboard) {
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
    } else await item('Add feed…').click()
    const dialog = page.getByRole('dialog', { name: 'Add', exact: true })
    await dialog.waitFor()
    await waitAbsent(folderMenu())
    await assertFocus('.app-dialog input[type="url"]')
    assert.equal(await dialog.getByRole('combobox', { name: 'Destination folder' }).textContent().then(text => text.includes('Destination')), true)
    await page.keyboard.press('Escape')
    await waitAbsent(dialog)
    await assertFocus('[data-folder-id="1"]')
  }
  await openFolder()
  await item('Add feed…').click()
  await page.locator('.app-dialog input[type="url"]').fill('https://fixture.invalid/new-feed')
  await page.getByRole('button', { name: 'Add feed', exact: true }).click()
  await waitAbsent(page.getByRole('dialog', { name: 'Add', exact: true }))
  assert.deepEqual(await page.evaluate(() => fixtureLog.writes.at(-1).args.slice(1)), ['https://fixture.invalid/new-feed', 1, undefined])
  await assertFocus('[data-folder-id="1"]')
  assert.equal(await page.evaluate(() => fixtureLog.selected), 0)
  await page.evaluate(() => (fixtureLog.mode = 'pending'))
  await openFolder()
  await item('Add feed…').click()
  await page.locator('.app-dialog input[type="url"]').fill('https://fixture.invalid/pending-feed')
  await page.getByRole('button', { name: 'Add feed', exact: true }).click()
  await page.keyboard.press('Escape')
  await waitAbsent(page.getByRole('dialog', { name: 'Add', exact: true }))
  await openFolder()
  await item('Add feed…').click()
  await page.locator('.app-dialog input[type="url"]').fill('https://fixture.invalid/new-form')
  await page.evaluate(() => fixtureLog.pending.shift()(false))
  assert.equal(await page.locator('.app-dialog input[type="url"]').inputValue(), 'https://fixture.invalid/new-form')
  await page.evaluate(() => fixtureRemoveFolder())
  await page.keyboard.press('Escape')
  await waitAbsent(page.getByRole('dialog', { name: 'Add', exact: true }))
  await assertFocus('[data-feed-focus-fallback]')
  evidence.checks.push('Folder right-click/Shift+F10, native rename cancel/retry/trim/duplicate guard; pointer and keyboard Add with preselected destination, URL focus, mocked create, stale completion isolation and removed-folder focus fallback')

  // Both themes, narrow viewport, long scrolling submenu and larger font.
  for (const width of [360, 1000])
    for (const theme of ['dark', 'light']) {
      await reset()
      await page.setViewportSize({ width, height: 640 })
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
        document.documentElement.style.fontSize = '20px'
      }, theme)
      const baselineWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      await openMenu(false)
      await item('Move to folder…').hover()
      const submenu = page.getByRole('menu', { name: 'Move to folder', exact: true })
      await submenu.waitFor()
      await submenu.getByRole('menuitem').last().scrollIntoViewIfNeeded()
      const boxes = await Promise.all([rootMenu().boundingBox(), submenu.boundingBox()])
      evidence.layouts.push({ width, theme, baselineWidth, boxes })
      for (const box of boxes)
        assert.ok(
          box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 641,
          'collision-aware bounded menu',
        )
      assert.ok(
        (await page.evaluate(() => document.documentElement.scrollWidth)) <=
          Math.max(width, baselineWidth),
        'menu does not add page overflow',
      )
      if (artifacts) {
        await mkdir(artifacts, { recursive: true })
        await page.screenshot({ path: resolve(artifacts, `${theme}-${width}.png`) })
      }
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
    }
  assert.deepEqual(evidence.errors, [])
  evidence.checks.push(
    'Persistent/replaced/single Toast alert without focus theft; long menu/submenu bounded at 360/1000px, dark/light, 20px root font',
  )
  evidence.result = 'passed'
} catch (error) {
  evidence.result = 'failed'
  evidence.error = error.stack
  process.exitCode = 1
} finally {
  await browser?.close()
  await server.close()
  console.log(JSON.stringify(evidence, null, 2))
  if (artifacts) {
    await mkdir(artifacts, { recursive: true })
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(evidence, null, 2))
  }
}

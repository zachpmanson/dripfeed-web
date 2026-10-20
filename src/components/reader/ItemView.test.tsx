// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, StrictMode, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsItem } from '../../api/types'
import { dbPutItem } from '../../db'
import { resetLocal } from '../../store'
import { ItemView } from './ItemView'

const actions: ComponentProps<typeof ItemView>['actions'] = {
  extractFulltext: vi.fn(async () => {}),
  setRead: vi.fn(async () => {}),
  setStar: vi.fn(async () => {}),
  ensureFeed: vi.fn(async () => {}),
  ensureUnread: vi.fn(async () => 0),
  refreshMeta: vi.fn(async () => {}),
  syncNow: vi.fn(async () => {}),
  clearError: vi.fn(),
  reset: resetLocal,
}

function item(id = 42): NewsItem {
  return {
    id,
    guid: String(id),
    guidHash: String(id),
    url: 'https://example.com/article',
    title: `Item ${id}`,
    author: null,
    pubDate: null,
    updatedDate: null,
    body: 'Summary',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: 1,
    unread: true,
    starred: false,
    filtered: false,
    lastModified: 0,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

let root: Root
let container: HTMLDivElement

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(actions.extractFulltext).mockReset().mockResolvedValue(undefined)
  await resetLocal()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(items: NewsItem[] = [item()], autoExtract = true, strict = false) {
  const Wrapper = strict ? StrictMode : 'div'
  await act(async () => {
    root.render(
      <Wrapper>
        {items.map((selected, index) => (
          <ItemView
            key={index}
            item={selected}
            actions={actions}
            feedTitle={() => 'Feed'}
            articleCssMode="default"
            articleCss=""
            dimBoilerplate={false}
            recentBodies={[]}
            autoExtract={autoExtract}
            onFeedClick={() => {}}
          />
        ))}
      </Wrapper>,
    )
  })
}

function extractButton() {
  return container.querySelector<HTMLButtonElement>('button[title^="Extract full article"]')!
}

describe('auto extraction session deduplication', () => {
  it('extracts once across recreated item objects, revisits and same-session remounts', async () => {
    await render()
    await dbPutItem({ ...item(), body: 'Refreshed summary' })
    await render([{ ...item(), body: 'Refreshed summary' }])
    await render([item(43)])
    await render()
    await render([])
    await render()
    expect(vi.mocked(actions.extractFulltext).mock.calls.map(([target]) => target.id)).toEqual([
      42, 43,
    ])
  })

  it('single-flights concurrent mounts and retains deduplication after completion', async () => {
    const request = deferred()
    vi.mocked(actions.extractFulltext).mockReturnValue(request.promise)
    await render([item(), item()], true, true)
    expect(actions.extractFulltext).toHaveBeenCalledOnce()
    expect(extractButton().disabled).toBe(true)
    await render([])
    await render()
    expect(actions.extractFulltext).toHaveBeenCalledOnce()
    await act(async () => request.resolve())
    await render([])
    await render()
    expect(actions.extractFulltext).toHaveBeenCalledOnce()
  })

  it('retries the same ID after failed extraction, logout/reset and remount', async () => {
    vi.mocked(actions.extractFulltext).mockRejectedValueOnce(new Error('offline'))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('offline')
    expect(extractButton().disabled).toBe(false)
    await render([])
    await render()
    expect(actions.extractFulltext).toHaveBeenCalledOnce()

    await render([])
    await resetLocal()
    await render()
    expect(actions.extractFulltext).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    'does not let an old pending request %s poison a new session with the same ID',
    async (outcome) => {
      const oldRequest = deferred()
      const newRequest = deferred()
      vi.mocked(actions.extractFulltext)
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise)
      await render()
      expect(extractButton().disabled).toBe(true)
      await render([])
      await resetLocal()
      await render()
      expect(actions.extractFulltext).toHaveBeenCalledTimes(2)
      expect(extractButton().disabled).toBe(true)

      await act(async () => {
        if (outcome === 'resolve') oldRequest.resolve()
        else oldRequest.reject(new Error('old session failure'))
      })
      expect(extractButton().disabled).toBe(true)
      expect(container.querySelector('[role="alert"]')).toBeNull()
      await render([item(), item()])
      expect(actions.extractFulltext).toHaveBeenCalledTimes(2)
      await act(async () => newRequest.resolve())
      expect(extractButton().disabled).toBe(false)
      await render([])
      await render()
      expect(actions.extractFulltext).toHaveBeenCalledTimes(2)
    },
  )

  it('does not adopt a reset generation while stale props stay mounted', async () => {
    const oldRequest = deferred()
    vi.mocked(actions.extractFulltext).mockReturnValueOnce(oldRequest.promise)
    const oldItem = { ...item(), url: 'https://old.example.com/article' }
    const newItem = { ...item(), url: 'https://new.example.com/article' }
    await render([oldItem])
    await act(async () => resetLocal())
    // No new-session props have been presented. Settlement must not spend
    // the next generation's ID entry on the old URL, even via an internal render.
    await act(async () => oldRequest.resolve())
    await render([oldItem])
    expect(actions.extractFulltext).toHaveBeenCalledOnce()
    await render([])
    await render([newItem])
    expect(vi.mocked(actions.extractFulltext).mock.calls.map(([target]) => target.url)).toEqual([
      oldItem.url,
      newItem.url,
    ])
  })

  it('suppresses manual extraction from the stale mounted lifetime after reset', async () => {
    await render([item()], false)
    await act(async () => resetLocal())
    await act(async () => extractButton().click())
    expect(actions.extractFulltext).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('preserves manual extraction spinner and error feedback without auto extraction', async () => {
    const request = deferred()
    vi.mocked(actions.extractFulltext).mockReturnValueOnce(request.promise)
    await render([item()], false)
    expect(actions.extractFulltext).not.toHaveBeenCalled()
    await act(async () => extractButton().click())
    expect(actions.extractFulltext).toHaveBeenCalledOnce()
    expect(extractButton().disabled).toBe(true)
    await act(async () => request.reject(new Error('manual extraction failed')))
    expect(extractButton().disabled).toBe(false)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'manual extraction failed',
    )
  })

  it('keeps current-item spinner and error state when another item fails late', async () => {
    const first = deferred()
    const second = deferred()
    vi.mocked(actions.extractFulltext)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    await render()
    expect(extractButton().disabled).toBe(true)
    await render([item(43)])
    expect(extractButton().disabled).toBe(true)
    await act(async () => first.reject(new Error('previous item failed')))
    expect(extractButton().disabled).toBe(true)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await act(async () => second.reject(new Error('current item failed')))
    expect(extractButton().disabled).toBe(false)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('current item failed')
  })
})

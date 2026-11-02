// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { BaseDialog } from './BaseDialog'

let root: Root
let container: HTMLDivElement
let opener: HTMLButtonElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false
      },
    },
  })
  container = document.createElement('div')
  opener = document.createElement('button')
  document.body.append(opener, container)
  opener.focus()
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  opener.remove()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

it.each(['native', 'base'] as const)(
  'suspends and resumes %s without remounting its form or stealing final focus in StrictMode',
  async (first) => {
    function Harness() {
      const [native, setNative] = useState(first === 'native')
      const [base, setBase] = useState(first === 'base')
      return (
        <>
          {native && (
            <Dialog labelledBy="native-title" onClose={() => setNative(false)}>
              <span id="native-title">Native</span>
              <input id="native-field" data-dialog-autofocus defaultValue="native" />
              <button id="open-base" onClick={() => setBase(true)}>
                Cover with Base
              </button>
              <button id="close-native" onClick={() => setNative(false)}>
                Close native
              </button>
            </Dialog>
          )}
          {base && (
            <BaseDialog labelledBy="base-title" onClose={() => setBase(false)}>
              <span id="base-title">Base</span>
              <input id="base-field" data-dialog-autofocus defaultValue="base" />
              <button id="open-native" onClick={() => setNative(true)}>
                Cover with native
              </button>
              <button id="close-base" onClick={() => setBase(false)}>
                Close Base
              </button>
            </BaseDialog>
          )}
        </>
      )
    }
    await act(async () =>
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      ),
    )
    const field = document.getElementById(`${first}-field`) as HTMLInputElement
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(field))
    })
    field.value = 'unsaved form state'
    const second = first === 'native' ? 'base' : 'native'
    await act(async () => document.getElementById(`open-${second}`)!.click())
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement?.id).toBe(`${second}-field`))
    })
    expect(field.isConnected).toBe(true)
    expect(field.value).toBe('unsaved form state')
    expect(document.querySelector('dialog')!.open).toBe(second === 'native')
    await act(async () => {
      await vi.waitFor(() =>
        expect((document.querySelector('[role="dialog"]') as HTMLElement).hidden).toBe(
          second === 'native',
        ),
      )
    })
    await act(async () => document.getElementById(`close-${second}`)!.click())
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(field))
    })
    expect(field.value).toBe('unsaved form state')
    expect(document.querySelectorAll('.app-dialog')).toHaveLength(1)
    await act(async () => document.getElementById(`close-${first}`)!.click())
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(opener))
    })
    expect(document.querySelector('.app-dialog')).toBeNull()
  },
)

it('transfers the connected opener across an atomic Base-to-native replacement', async () => {
  function Harness() {
    const [mode, setMode] = useState('base')
    return mode === 'base' ? (
      <BaseDialog labelledBy="title" onClose={() => setMode('')}>
        <span id="title">Base</span>
        <button id="replace" onClick={() => setMode('native')}>
          Replace
        </button>
      </BaseDialog>
    ) : mode === 'native' ? (
      <Dialog labelledBy="title" onClose={() => setMode('')}>
        <span id="title">Native</span>
        <button id="dismiss" onClick={() => setMode('')}>
          Dismiss
        </button>
      </Dialog>
    ) : null
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('replace'))
  })
  await act(async () => document.getElementById('replace')!.click())
  expect(document.querySelector('dialog')!.open).toBe(true)
  expect(document.activeElement?.id).toBe('dismiss')
  await act(async () => document.getElementById('dismiss')!.click())
  expect(document.activeElement).toBe(opener)
})

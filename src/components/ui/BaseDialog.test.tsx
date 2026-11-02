// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BaseDialog } from './BaseDialog'

let root: Root
let container: HTMLDivElement
let opener: HTMLButtonElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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
  vi.unstubAllGlobals()
})

it('uses a named library popup, delegates Escape to the parent and restores focus in StrictMode', async () => {
  const closed = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      open && (
        <BaseDialog
          labelledBy="candidate-title"
          onClose={() => {
            closed()
            setOpen(false)
          }}
        >
          <span id="candidate-title">Candidate</span>
          <button>Close</button>
        </BaseDialog>
      )
    )
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  expect(document.querySelector('dialog')).toBeNull()
  const popup = document.querySelector('[role="dialog"]')!
  expect(popup.getAttribute('aria-labelledby')).toBe('candidate-title')
  expect(document.querySelector('.base-dialog-backdrop')).not.toBeNull()
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Close'))
  })
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  expect(closed).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement).toBe(opener))
  })
})

it('resolves the optional restoration selector after its target is replaced', async () => {
  opener.id = 'persistent-opener'
  await act(async () =>
    root.render(
      <BaseDialog labelledBy="title" onClose={vi.fn()} restoreFocusTo="#persistent-opener">
        <span id="title">Settings candidate</span>
        <button data-dialog-autofocus>Initial target</button>
      </BaseDialog>,
    ),
  )
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Initial target'))
  })
  const replacement = document.createElement('button')
  replacement.id = opener.id
  opener.replaceWith(replacement)
  opener = replacement
  await act(async () => root.render(null))
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement).toBe(replacement))
  })
})

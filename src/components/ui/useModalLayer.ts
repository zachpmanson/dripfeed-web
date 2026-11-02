import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

type Layer = {
  id: symbol
  element: RefObject<HTMLElement>
  remembered: HTMLElement | null
  activate: () => void
  suspend: () => void
  returnTo: () => Element | null
}
const layers: Layer[] = []
let pendingReturn: { target: () => Element | null } | undefined
const listeners = new Set<() => void>()
const top = () => layers.at(-1)
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const focusTarget = (layer: Layer) => {
  const remembered = layer.remembered
  if (
    remembered?.isConnected &&
    layer.element.current?.contains(remembered) &&
    !remembered.matches(':disabled')
  )
    return remembered
  return (
    layer.element.current?.querySelector<HTMLElement>('[data-dialog-autofocus]:not(:disabled)') ??
    layer.element.current?.querySelector<HTMLElement>('button:not(:disabled)') ??
    layer.element.current
  )
}

/** Native top-layer dialogs and portaled library dialogs cannot be active at
 * once. Keep parent-owned forms mounted, but give only the newest owner modality. */
export function useModalLayer(
  element: RefObject<HTMLElement>,
  restoreFocusTo?: string,
  callbacks?: { activate: () => void; suspend: () => void },
  restoreFocusFallback?: string,
) {
  const id = useRef(Symbol('modal'))
  const currentCallbacks = useRef(callbacks)
  currentCallbacks.current = callbacks
  const entry = useRef<Layer | null>(null)
  const openerRef = useRef<Element | null>(null)
  const isTop = () => top()?.id === id.current
  const active = useSyncExternalStore(subscribe, isTop, () => false)

  useLayoutEffect(() => {
    // StrictMode replays registration while the first activation still owns focus.
    openerRef.current ??= document.activeElement
    const opener = openerRef.current
    const previous = top()
    // React can remove one owner and mount its replacement in the same commit.
    const handoff = previous ? undefined : pendingReturn
    if (previous) {
      const focused = document.activeElement
      previous.remembered =
        focused instanceof HTMLElement && previous.element.current?.contains(focused)
          ? focused
          : null
      previous.suspend()
    }
    const layer: Layer = {
      id: id.current,
      element,
      remembered: null,
      activate: () => currentCallbacks.current?.activate(),
      suspend: () => currentCallbacks.current?.suspend(),
      returnTo: () => {
        const target = (restoreFocusTo ? document.querySelector(restoreFocusTo) : null) ?? opener
        return target instanceof HTMLElement &&
          target !== document.body &&
          target.isConnected &&
          !target.matches(':disabled')
          ? target
          : ((restoreFocusFallback ? document.querySelector(restoreFocusFallback) : null) ??
              previous?.returnTo() ??
              handoff?.target() ??
              null)
      },
    }
    entry.current = layer
    layers.push(layer)
    layer.activate()
    notify()
    return () => {
      const wasTop = top() === layer
      if (wasTop) layer.suspend()
      layers.splice(layers.indexOf(layer), 1)
      const next = top()
      if (wasTop) next?.activate()
      notify()
      if (!wasTop) return
      const job = { target: layer.returnTo }
      pendingReturn = job
      queueMicrotask(() => {
        if (pendingReturn === job) pendingReturn = undefined
        // StrictMode replay or a newer overlay must not receive stale return focus.
        if (top() !== next || layers.some((item) => item.id === layer.id)) return
        let target = layer.returnTo()
        if (next && (!(target instanceof HTMLElement) || !next.element.current?.contains(target)))
          target = focusTarget(next)
        if (target instanceof HTMLElement && target.isConnected) target.focus()
      })
    }
  }, [element, restoreFocusTo, restoreFocusFallback])

  return { active, isTop, initialFocus: () => (entry.current ? focusTarget(entry.current) : null) }
}

import { describe, expect, it } from 'vitest'
import { attachBrowserZoomGuard, attachContextMenuGuard } from './browserGuards'
import type { GestureEventTarget, GestureListenerOptions } from './pointerGesture'

/** Источник событий, в который можно вручную «прислать» событие. */
function fakeTarget() {
  const listeners = new Map<string, (event: unknown) => void>()
  const options = new Map<string, GestureListenerOptions | undefined>()

  const target: GestureEventTarget = {
    addEventListener: (type, listener, listenerOptions) => {
      listeners.set(type, listener)
      options.set(type, listenerOptions)
    },
    removeEventListener: (type) => {
      listeners.delete(type)
    },
  }

  return {
    target,
    listeners,
    optionsFor: (type: string) => options.get(type),
    send(type: string, event: unknown) {
      listeners.get(type)?.(event)
    },
  }
}

/** Событие, которое помнит, отменили его или нет. */
function cancelableEvent(fields: Record<string, unknown> = {}) {
  const event = {
    ...fields,
    prevented: false,
    preventDefault() {
      event.prevented = true
    },
  }
  return event
}

describe('меню правой кнопки', () => {
  it('браузерное меню поверх игры не открывается', () => {
    const source = fakeTarget()
    attachContextMenuGuard(source.target)

    const event = cancelableEvent()
    source.send('contextmenu', event)

    expect(event.prevented).toBe(true)
  })

  it('запрет ставится на перехвате и снимается отпиской', () => {
    const source = fakeTarget()
    const detach = attachContextMenuGuard(source.target)
    expect(source.optionsFor('contextmenu')?.capture).toBe(true)
    detach()
    expect(source.listeners.size).toBe(0)
  })

  it('событие без preventDefault ничего не ломает', () => {
    const source = fakeTarget()
    attachContextMenuGuard(source.target)
    expect(() => source.send('contextmenu', {})).not.toThrow()
    expect(() => source.send('contextmenu', null)).not.toThrow()
  })
})

describe('масштаб страницы', () => {
  it('щипок на тачпаде не масштабирует страницу', () => {
    const source = fakeTarget()
    attachBrowserZoomGuard(source.target)

    const pinch = cancelableEvent({ ctrlKey: true, deltaY: -12 })
    source.send('wheel', pinch)

    expect(pinch.prevented).toBe(true)
  })

  it('обычное колесо не трогаем: им приближается камера и прокручиваются списки', () => {
    const source = fakeTarget()
    attachBrowserZoomGuard(source.target)

    const wheel = cancelableEvent({ ctrlKey: false, deltaY: 100 })
    source.send('wheel', wheel)

    expect(wheel.prevented).toBe(false)
  })

  it('жесты Safari тоже запрещены', () => {
    const source = fakeTarget()
    attachBrowserZoomGuard(source.target)

    const start = cancelableEvent({ scale: 1 })
    const change = cancelableEvent({ scale: 1.4 })
    source.send('gesturestart', start)
    source.send('gesturechange', change)

    expect(start.prevented).toBe(true)
    expect(change.prevented).toBe(true)
  })

  it('колесо слушается непассивно, иначе запрет игнорируется', () => {
    const source = fakeTarget()
    attachBrowserZoomGuard(source.target)
    expect(source.optionsFor('wheel')?.passive).toBe(false)
    expect(source.optionsFor('wheel')?.capture).toBe(true)
  })

  it('отписка снимает все слушатели', () => {
    const source = fakeTarget()
    const detach = attachBrowserZoomGuard(source.target)
    expect(source.listeners.size).toBe(3)
    detach()
    expect(source.listeners.size).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import {
  attachPointerGestureListeners,
  classifyPointerGesture,
  DRAG_THRESHOLD_PX,
  isSceneClick,
  PointerGestureTracker,
  pointerTravel,
  readPointerSample,
  type GestureEventTarget,
  type GestureListenerOptions,
} from './pointerGesture'

const ORIGIN = { x: 100, y: 100 }

/** Точка, сдвинутая от начальной по горизонтали. */
function shifted(dx: number, dy: number = 0) {
  return { x: ORIGIN.x + dx, y: ORIGIN.y + dy }
}

describe('порог различения', () => {
  it('порог задан и не выродился', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0)
    // Меньше — начнёт съедать щелчки дрожащей рукой, больше — молча
    // проглатывать промахи по мелким предметам.
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(4)
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(6)
  })

  it('смещение меньше порога — это клик', () => {
    expect(classifyPointerGesture(ORIGIN, shifted(DRAG_THRESHOLD_PX - 1))).toBe('click')
    expect(classifyPointerGesture(ORIGIN, ORIGIN)).toBe('click')
    expect(classifyPointerGesture(ORIGIN, shifted(0, -(DRAG_THRESHOLD_PX - 1)))).toBe('click')
  })

  it('смещение больше порога — это протяжка', () => {
    expect(classifyPointerGesture(ORIGIN, shifted(DRAG_THRESHOLD_PX + 1))).toBe('drag')
    expect(classifyPointerGesture(ORIGIN, shifted(-120, 40))).toBe('drag')
  })

  it('ровно порог считается протяжкой', () => {
    expect(classifyPointerGesture(ORIGIN, shifted(DRAG_THRESHOLD_PX))).toBe('drag')
    expect(classifyPointerGesture(ORIGIN, shifted(DRAG_THRESHOLD_PX - 0.001))).toBe('click')
  })

  it('смещение меряется по прямой, а не по осям', () => {
    // 3 и 4 по осям дают ровно 5 по прямой: по каждой оси в отдельности
    // это ещё клик, вместе — уже порог.
    expect(pointerTravel(ORIGIN, shifted(3, 4))).toBeCloseTo(5)
    expect(classifyPointerGesture(ORIGIN, shifted(3, 4), 5)).toBe('drag')
    expect(classifyPointerGesture(ORIGIN, shifted(3, 3), 5)).toBe('click')
  })

  it('порог можно задать свой', () => {
    expect(classifyPointerGesture(ORIGIN, shifted(20), 50)).toBe('click')
    expect(classifyPointerGesture(ORIGIN, shifted(2), 1)).toBe('drag')
  })
})

describe('учёт нажатий', () => {
  it('нажали и отпустили на месте — клик', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    expect(tracker.end(1, ORIGIN)).toBe('click')
    expect(tracker.lastGesture()).toBe('click')
  })

  it('дрожание руки внутри порога клик не ломает', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(1, 1))
    tracker.move(1, shifted(2, -1))
    tracker.move(1, shifted(0, 2))
    expect(tracker.end(1, shifted(1, 1))).toBe('click')
  })

  it('провели по экрану — протяжка, а не клик', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(30))
    tracker.move(1, shifted(80, 20))
    expect(tracker.end(1, shifted(80, 20))).toBe('drag')
    expect(tracker.lastGesture()).toBe('drag')
  })

  it('увели курсор и вернули в точку нажатия — всё равно протяжка', () => {
    // Так выглядит вращение камеры по кругу: отпускают там же, где нажали.
    // По одним концам такое движение неотличимо от щелчка на месте, и
    // персонаж уходил идти посреди поворота вида.
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(0, 60))
    tracker.move(1, shifted(60, 60))
    tracker.move(1, shifted(60, 0))
    expect(tracker.end(1, ORIGIN)).toBe('drag')
  })

  it('нажатие, начатое не на сцене, кликом не станет', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN, false)
    expect(tracker.end(1, ORIGIN)).toBe('drag')
  })

  it('оборванное нажатие кликом не считается', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.cancel(1)
    expect(tracker.lastGesture()).toBe('drag')
  })

  it('нажатие, начала которого не видели, кликом не считается', () => {
    const tracker = new PointerGestureTracker()
    expect(tracker.end(7, ORIGIN)).toBe('drag')
  })

  it('до первого нажатия итог — клик', () => {
    expect(new PointerGestureTracker().lastGesture()).toBe('click')
  })

  it('движение без нажатия ничего не портит', () => {
    const tracker = new PointerGestureTracker()
    tracker.move(1, shifted(300, 300))
    tracker.begin(1, ORIGIN)
    expect(tracker.end(1, ORIGIN)).toBe('click')
  })

  it('нажатия разных указателей не мешают друг другу', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.begin(2, shifted(200))
    tracker.move(2, shifted(400))
    expect(tracker.end(2, shifted(400))).toBe('drag')
    expect(tracker.end(1, ORIGIN)).toBe('click')
  })

  it('следующее нажатие начинается с чистого листа', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(200))
    tracker.end(1, shifted(200))
    tracker.begin(1, ORIGIN)
    expect(tracker.end(1, ORIGIN)).toBe('click')
  })

  it('порог у учёта свой', () => {
    const tracker = new PointerGestureTracker(50)
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(30))
    expect(tracker.end(1, shifted(30))).toBe('click')
  })

  it('сброс забывает и текущие нажатия, и итог последнего', () => {
    const tracker = new PointerGestureTracker()
    tracker.begin(1, ORIGIN)
    tracker.move(1, shifted(200))
    tracker.end(1, shifted(200))
    tracker.reset()
    expect(tracker.lastGesture()).toBe('click')
  })
})

describe('решение о клике по сцене', () => {
  it('клик проходит, когда согласны оба свидетеля', () => {
    expect(isSceneClick('click', 0)).toBe(true)
    expect(isSceneClick('click', DRAG_THRESHOLD_PX - 1)).toBe(true)
  })

  it('протяжка не проходит, даже если отпустили в точке нажатия', () => {
    expect(isSceneClick('drag', 0)).toBe(false)
  })

  it('длинная протяжка не проходит и без нашего учёта', () => {
    // Свидетель react-three-fiber: если глобальные слушатели не поставлены,
    // учёт скажет «клик», а расстояние от точки нажатия всё равно выдаст
    // протяжку.
    expect(isSceneClick('click', 120)).toBe(false)
    expect(isSceneClick('click', DRAG_THRESHOLD_PX)).toBe(false)
  })
})

describe('чтение события указателя', () => {
  it('берёт номер указателя, координаты и цель', () => {
    const target = {}
    expect(readPointerSample({ pointerId: 3, clientX: 12, clientY: 34, target })).toEqual({
      pointerId: 3,
      x: 12,
      y: 34,
      target,
    })
  })

  it('событие без координат или без номера пропускается', () => {
    expect(readPointerSample({ clientX: 1, clientY: 2 })).toBeNull()
    expect(readPointerSample({ pointerId: 1, clientY: 2 })).toBeNull()
    expect(readPointerSample(null)).toBeNull()
    expect(readPointerSample('pointerdown')).toBeNull()
  })
})

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

function pointerEvent(point: { x: number; y: number }, target: unknown = null) {
  return { pointerId: 1, clientX: point.x, clientY: point.y, target }
}

describe('подписка на события окна', () => {
  it('нажатие, движение и отпускание доходят до учёта', () => {
    const source = fakeTarget()
    const tracker = new PointerGestureTracker()
    attachPointerGestureListeners({ target: source.target, tracker })

    source.send('pointerdown', pointerEvent(ORIGIN))
    source.send('pointermove', pointerEvent(shifted(100)))
    source.send('pointerup', pointerEvent(ORIGIN))

    expect(tracker.lastGesture()).toBe('drag')
  })

  it('щелчок на месте остаётся кликом', () => {
    const source = fakeTarget()
    const tracker = new PointerGestureTracker()
    attachPointerGestureListeners({ target: source.target, tracker })

    source.send('pointerdown', pointerEvent(ORIGIN))
    source.send('pointerup', pointerEvent(shifted(1, 1)))

    expect(tracker.lastGesture()).toBe('click')
  })

  it('нажатие на панели интерфейса кликом по сцене не считается', () => {
    const source = fakeTarget()
    const tracker = new PointerGestureTracker()
    const panel = { kind: 'панель' }
    attachPointerGestureListeners({
      target: source.target,
      tracker,
      isSceneTarget: (element) => element !== panel,
    })

    source.send('pointerdown', pointerEvent(ORIGIN, panel))
    source.send('pointerup', pointerEvent(ORIGIN, panel))

    expect(tracker.lastGesture()).toBe('drag')
  })

  it('оборванное системой нажатие доходит до учёта', () => {
    const source = fakeTarget()
    const tracker = new PointerGestureTracker()
    attachPointerGestureListeners({ target: source.target, tracker })

    source.send('pointerdown', pointerEvent(ORIGIN))
    source.send('pointercancel', pointerEvent(ORIGIN))

    expect(tracker.lastGesture()).toBe('drag')
  })

  it('слушатели стоят на перехвате: запись ложится раньше клика по сцене', () => {
    const source = fakeTarget()
    attachPointerGestureListeners({ target: source.target, tracker: new PointerGestureTracker() })
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      expect(source.optionsFor(type)?.capture, type).toBe(true)
    }
  })

  it('отписка снимает все слушатели', () => {
    const source = fakeTarget()
    const detach = attachPointerGestureListeners({
      target: source.target,
      tracker: new PointerGestureTracker(),
    })
    expect(source.listeners.size).toBe(4)
    detach()
    expect(source.listeners.size).toBe(0)
  })
})

/**
 * Клик или протяжка — как отличить одно от другого.
 *
 * Полотно WebGL для браузера — один элемент страницы, поэтому событие
 * `click` он выдаёт на любое нажатие с отпусканием над сценой, сколько бы
 * курсор ни проехал между ними. Вращение камеры зажатой левой кнопкой
 * доходило из-за этого до обработчиков как обычный клик по полу, и вместо
 * поворота вида персонаж уходил идти. Играть было нельзя.
 *
 * Здесь нажатие запоминается и измеряется: уехало дальше порога — это была
 * протяжка, команду миру отдавать нельзя. Мерится не расстояние между
 * началом и концом, а наибольшее удаление за всё нажатие: круговое вращение
 * камеры возвращает курсор почти в точку нажатия, и по одним лишь концам
 * такое движение неотличимо от щелчка на месте.
 *
 * Модуль ничего не знает ни про DOM, ни про three.js, ни про React: ему
 * передают числа и объекты с нужными полями. Поэтому вся логика проверяется
 * обычными юнит-тестами, без браузера.
 */

/** Точка на экране, в пикселях окна. */
export interface PointerPoint {
  readonly x: number
  readonly y: number
}

/** Чем оказалось нажатие к моменту отпускания. */
export type PointerGesture = 'click' | 'drag'

/**
 * Сколько пикселей курсор может проехать за нажатие, чтобы оно всё ещё
 * считалось кликом.
 *
 * Пять — потому что промах руки при щелчке укладывается в один-три пикселя
 * на мыши и в три-четыре на тачпаде, а осмысленное вращение камеры начинается
 * заметно позже: поворот на пять пикселей на экране не виден, терять такой
 * «поворот» не жалко. Брать меньше нельзя — щелчки начнут проглатываться
 * у тех, у кого дрожит рука; брать больше нельзя — на десятке пикселей
 * молча теряются клики по мелким предметам, и игрок не понимает, почему
 * персонаж не реагирует.
 */
export const DRAG_THRESHOLD_PX = 5

/** Расстояние между двумя точками экрана по прямой. */
export function pointerTravel(from: PointerPoint, to: PointerPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Чем считать нажатие, проехавшее от `from` до `to`.
 *
 * Ровно порог — уже протяжка: границу надо было отдать какой-то одной
 * стороне, и отдана она осторожной — лучше не двинуть персонажа лишний раз,
 * чем увести его посреди поворота камеры.
 */
export function classifyPointerGesture(
  from: PointerPoint,
  to: PointerPoint,
  threshold: number = DRAG_THRESHOLD_PX,
): PointerGesture {
  return pointerTravel(from, to) < threshold ? 'click' : 'drag'
}

/**
 * Считать ли нажатие кликом по сцене.
 *
 * Спрашиваются оба свидетеля. Первый — наш собственный учёт нажатия, он
 * помнит весь путь курсора. Второй — `delta` события react-three-fiber,
 * расстояние от точки нажатия до точки отпускания, посчитанное самой
 * библиотекой. Учёт точнее, но живёт на глобальных слушателях окна;
 * если их по какой-то причине не поставили, второй свидетель всё равно
 * отсечёт длинную протяжку. Клик признаётся, только когда согласны оба.
 */
export function isSceneClick(
  gesture: PointerGesture,
  delta: number,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return gesture === 'click' && delta < threshold
}

/** Одно нажатие: откуда началось и как далеко уходил курсор. */
interface PointerTrack {
  readonly origin: PointerPoint
  /** Наибольшее удаление от точки нажатия за всё время нажатия. */
  travel: number
}

/**
 * Учёт нажатий: помнит, откуда началось каждое и как далеко уехало.
 *
 * Указателей может быть несколько сразу (два пальца на тачскрине, палец
 * и мышь), поэтому нажатия считаются по отдельности. Кроме того, помнится
 * последнее завершённое нажатие: событие `click` приходит уже после
 * `pointerup`, и обработчику клика спрашивать надо именно про то нажатие,
 * которое только что закончилось.
 */
export class PointerGestureTracker {
  private readonly threshold: number
  private readonly tracks = new Map<number, PointerTrack>()
  private last: PointerGesture = 'click'

  constructor(threshold: number = DRAG_THRESHOLD_PX) {
    this.threshold = threshold
  }

  /**
   * Нажатие началось.
   *
   * `onScene` — началось ли оно на самой сцене. Нажатие, начатое на панели
   * интерфейса, кликом по миру не станет никогда, сколько бы ни было
   * пройдено: панель перекрывает сцену, и персонаж под ней не при чём.
   */
  begin(pointerId: number, point: PointerPoint, onScene: boolean = true): void {
    this.tracks.set(pointerId, {
      origin: point,
      travel: onScene ? 0 : Number.POSITIVE_INFINITY,
    })
  }

  /** Курсор сдвинулся. Учитывается только рост наибольшего удаления. */
  move(pointerId: number, point: PointerPoint): void {
    const track = this.tracks.get(pointerId)
    if (!track) return
    track.travel = Math.max(track.travel, pointerTravel(track.origin, point))
  }

  /**
   * Нажатие отпущено. Возвращает и запоминает его итог.
   *
   * Нажатие, начала которого мы не видели (слушатели поставлены посреди
   * него, событие пришло дважды), кликом не считается: о таком нажатии
   * ничего не известно, а молчаливый лишний уход персонажа хуже, чем
   * молчаливо потерянный щелчок.
   */
  end(pointerId: number, point?: PointerPoint): PointerGesture {
    if (point) this.move(pointerId, point)
    const track = this.tracks.get(pointerId)
    this.tracks.delete(pointerId)
    this.last = track && track.travel < this.threshold ? 'click' : 'drag'
    return this.last
  }

  /** Нажатие оборвано системой: жест не состоялся, кликом он не был. */
  cancel(pointerId: number): void {
    this.tracks.delete(pointerId)
    this.last = 'drag'
  }

  /**
   * Итог последнего завершённого нажатия. До первого нажатия — «клик»:
   * щелчок, пришедший не от мыши (с клавиатуры, из теста), запрещать
   * не за что.
   */
  lastGesture(): PointerGesture {
    return this.last
  }

  /** Забыть всё. Нужно тестам и перезапуску сцены. */
  reset(): void {
    this.tracks.clear()
    this.last = 'click'
  }
}

/**
 * Минимум, который нужен от события указателя. Свои поля вместо
 * `PointerEvent` — чтобы модуль оставался проверяемым без браузера.
 */
export interface PointerSample extends PointerPoint {
  readonly pointerId: number
  readonly target: unknown
}

interface RawPointerEvent {
  readonly pointerId?: unknown
  readonly clientX?: unknown
  readonly clientY?: unknown
  readonly target?: unknown
}

/**
 * Достаёт из события то, что нужно учёту. Событие без координат или без
 * номера указателя пропускается: такое приходит от программно созданных
 * событий и ломать на нём учёт незачем.
 */
export function readPointerSample(event: unknown): PointerSample | null {
  if (typeof event !== 'object' || event === null) return null
  const raw = event as RawPointerEvent
  if (
    typeof raw.pointerId !== 'number' ||
    typeof raw.clientX !== 'number' ||
    typeof raw.clientY !== 'number'
  ) {
    return null
  }
  return { pointerId: raw.pointerId, x: raw.clientX, y: raw.clientY, target: raw.target ?? null }
}

/** Как ставится слушатель. `passive: false` нужен там, где событие отменяют. */
export interface GestureListenerOptions {
  readonly capture?: boolean
  readonly passive?: boolean
}

/** Минимум, который нужен от источника событий: окно, документ, полотно. */
export interface GestureEventTarget {
  addEventListener(
    type: string,
    listener: (event: unknown) => void,
    options?: GestureListenerOptions,
  ): void
  removeEventListener(
    type: string,
    listener: (event: unknown) => void,
    options?: GestureListenerOptions,
  ): void
}

export interface PointerGestureWatch {
  readonly target: GestureEventTarget
  readonly tracker: PointerGestureTracker
  /**
   * Началось ли нажатие на сцене, а не на панели интерфейса поверх неё.
   * По умолчанию считается, что на сцене.
   */
  readonly isSceneTarget?: (target: unknown) => boolean
}

/**
 * Подписывает учёт нажатий на события источника. Возвращает отписку.
 *
 * Слушатели ставятся на перехвате и на окне: так запись о нажатии ложится
 * раньше, чем событие дойдёт до полотна и превратится там в клик по объекту
 * сцены. Порядок здесь — не мелочь, а условие работы: обработчик клика
 * спрашивает уже готовый итог.
 */
export function attachPointerGestureListeners(watch: PointerGestureWatch): () => void {
  const { target, tracker } = watch
  const isSceneTarget = watch.isSceneTarget ?? (() => true)
  const options = { capture: true }

  const onDown = (event: unknown): void => {
    const sample = readPointerSample(event)
    if (sample) tracker.begin(sample.pointerId, sample, isSceneTarget(sample.target))
  }
  const onMove = (event: unknown): void => {
    const sample = readPointerSample(event)
    if (sample) tracker.move(sample.pointerId, sample)
  }
  const onUp = (event: unknown): void => {
    const sample = readPointerSample(event)
    if (sample) tracker.end(sample.pointerId, sample)
  }
  const onCancel = (event: unknown): void => {
    const sample = readPointerSample(event)
    if (sample) tracker.cancel(sample.pointerId)
  }

  target.addEventListener('pointerdown', onDown, options)
  target.addEventListener('pointermove', onMove, options)
  target.addEventListener('pointerup', onUp, options)
  target.addEventListener('pointercancel', onCancel, options)

  return () => {
    target.removeEventListener('pointerdown', onDown, options)
    target.removeEventListener('pointermove', onMove, options)
    target.removeEventListener('pointerup', onUp, options)
    target.removeEventListener('pointercancel', onCancel, options)
  }
}

/**
 * Что браузер не должен делать поверх игры.
 *
 * Игра занимает всё окно и сама распоряжается мышью: левая кнопка вращает
 * вид, колесо приближает. Браузер про это не знает и по тем же событиям
 * норовит открыть своё меню или отмасштабировать страницу — поверх сцены,
 * посреди начатого движения. Здесь эти привычки отключаются.
 *
 * Как и учёт нажатий, модуль не знает про DOM: ему передают что угодно
 * с `addEventListener`, поэтому проверяется он без браузера.
 */

import type { GestureEventTarget } from './pointerGesture'

/** Событие, которое можно отменить. */
interface CancelableEvent {
  preventDefault(): void
}

interface RawWheelEvent extends Partial<CancelableEvent> {
  readonly ctrlKey?: unknown
}

/** Отменяет событие, если его вообще можно отменить. */
function preventDefault(event: unknown): void {
  if (typeof event !== 'object' || event === null) return
  const raw = event as Partial<CancelableEvent>
  if (typeof raw.preventDefault === 'function') raw.preventDefault()
}

/**
 * Запрещает браузерное меню правой кнопки. Возвращает отписку.
 *
 * Правая кнопка в трёхмерной сцене — часть управления видом, и системное
 * меню здесь только мешает: оно перекрывает происходящее и обрывает начатое
 * движение камеры. Запрет ставится на всё окно, а не на одно полотно:
 * панели интерфейса лежат поверх сцены, и меню над ними так же неуместно.
 */
export function attachContextMenuGuard(target: GestureEventTarget): () => void {
  const options = { capture: true }
  const onContextMenu = (event: unknown): void => preventDefault(event)
  target.addEventListener('contextmenu', onContextMenu, options)
  return () => target.removeEventListener('contextmenu', onContextMenu, options)
}

/**
 * Запрещает браузеру масштабировать страницу. Возвращает отписку.
 *
 * Сведение двух пальцев на тачпаде браузер шлёт как колесо с зажатым Ctrl,
 * а Safari — ещё и своими событиями жеста. Над полотном это перехватывают
 * органы управления камерой, но над панелью интерфейса — никто, и страница
 * уезжает в масштаб 150%: интерфейс разъезжается, сцена обрезается,
 * вернуть обратно можно только с клавиатуры. Обычное колесо не трогаем —
 * оно приближает камеру, а над списком навыков прокручивает список.
 *
 * `passive: false` обязателен: колесо на окне браузер по умолчанию считает
 * пассивным событием и запрет тихо игнорирует.
 */
export function attachBrowserZoomGuard(target: GestureEventTarget): () => void {
  const options = { capture: true, passive: false }

  const onWheel = (event: unknown): void => {
    if (typeof event !== 'object' || event === null) return
    const raw = event as RawWheelEvent
    if (raw.ctrlKey !== true) return
    preventDefault(event)
  }
  const onGesture = (event: unknown): void => preventDefault(event)

  target.addEventListener('wheel', onWheel, options)
  // Нестандартные события Safari: без них масштаб щипком работает мимо колеса.
  target.addEventListener('gesturestart', onGesture, options)
  target.addEventListener('gesturechange', onGesture, options)

  return () => {
    target.removeEventListener('wheel', onWheel, options)
    target.removeEventListener('gesturestart', onGesture, options)
    target.removeEventListener('gesturechange', onGesture, options)
  }
}

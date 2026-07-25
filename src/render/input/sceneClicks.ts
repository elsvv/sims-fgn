import type { ThreeEvent } from '@react-three/fiber'
import { useEffect } from 'react'
import { attachBrowserZoomGuard, attachContextMenuGuard } from './browserGuards'
import {
  attachPointerGestureListeners,
  isSceneClick,
  PointerGestureTracker,
  type GestureEventTarget,
  type GestureListenerOptions,
} from './pointerGesture'

/**
 * Клики по сцене: пол, предметы, люди.
 *
 * Все обработчики кликов в трёхмерной сцене обязаны проходить через
 * `dragAwareClick`. Иначе повторяется тот самый дефект, из-за которого
 * в игру нельзя было играть: зажал левую кнопку, повернул камеру — и
 * персонаж ушёл идти туда, где курсор случайно отпустили.
 *
 * Учёт нажатий один на всё приложение, потому что мышь у человека одна.
 * Событие `click` браузер шлёт уже после `pointerup`, так что к моменту
 * вызова обработчика итог нажатия известен.
 */
const gestures = new PointerGestureTracker()

/** Нажатие на сцене — это нажатие на полотне, а не на панели поверх него. */
function isSceneTarget(target: unknown): boolean {
  return target instanceof HTMLCanvasElement
}

function windowTarget(): GestureEventTarget {
  return {
    addEventListener: (
      type: string,
      listener: (event: unknown) => void,
      options?: GestureListenerOptions,
    ) => window.addEventListener(type, listener, options),
    removeEventListener: (
      type: string,
      listener: (event: unknown) => void,
      options?: GestureListenerOptions,
    ) => window.removeEventListener(type, listener, options),
  }
}

/**
 * Ставит наблюдение за мышью на всё окно. Вызывается один раз, в корне
 * приложения.
 *
 * Слушать надо окно, а не полотно: протяжка часто заканчивается над панелью
 * интерфейса или вовсе за краем окна, и полотно об этом уже не узнает.
 * Заодно ставятся запреты на браузерное меню и масштабирование страницы —
 * всё это одна тема: окно принадлежит игре.
 */
export function usePointerGestures(): void {
  useEffect(() => {
    const target = windowTarget()
    const detach = [
      attachPointerGestureListeners({ target, tracker: gestures, isSceneTarget }),
      attachContextMenuGuard(target),
      attachBrowserZoomGuard(target),
    ]
    gestures.reset()
    return () => {
      for (const off of detach) off()
      gestures.reset()
    }
  }, [])
}

/**
 * Оборачивает обработчик клика по объекту сцены так, чтобы вращение камеры
 * не считалось кликом.
 *
 * Одна обёртка на пол, предметы и людей: правило должно быть общим, иначе
 * очередной кликабельный объект заведут по забытому образцу и дефект
 * вернётся в одном месте из трёх.
 */
export function dragAwareClick(
  handler: (event: ThreeEvent<MouseEvent>) => void,
): (event: ThreeEvent<MouseEvent>) => void {
  return (event) => {
    if (!isSceneClick(gestures.lastGesture(), event.delta)) return
    handler(event)
  }
}

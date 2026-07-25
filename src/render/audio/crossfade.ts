/**
 * Расписание плавной смены источника.
 *
 * Здесь нет ни одного обращения к Web Audio: на входе — что играет и что
 * должно играть, на выходе — расписание громкостей. Такое расписание
 * проверяется тестом, а mixer.ts просто раскладывает его по узлам.
 *
 * Главное правило: если нужен тот же источник, что уже играет, не
 * происходит ничего. Игрок, шагнувший из коридора в дверной проём и
 * обратно, не должен услышать, как атмосфера коридора начинается заново.
 */

/** Точка расписания: к моменту `at` громкость должна прийти к `gain`. */
export interface FadePoint {
  readonly at: number
  readonly gain: number
}

export type CrossfadePlan =
  /** Ничего не делаем: играет ровно то, что нужно. */
  | { readonly kind: 'keep' }
  /** Гасим текущий и останавливаем. */
  | { readonly kind: 'stop'; readonly out: readonly FadePoint[]; readonly stopAt: number }
  /** Пускаем новый с нуля. */
  | { readonly kind: 'start'; readonly in: readonly FadePoint[] }
  /** Один гаснет, другой одновременно набирает: это и есть кроссфейд. */
  | {
      readonly kind: 'swap'
      readonly out: readonly FadePoint[]
      readonly stopAt: number
      readonly in: readonly FadePoint[]
    }

export interface CrossfadeInput {
  /** Текущее время звукового контекста, в секундах. */
  readonly now: number
  /** Что играет сейчас. */
  readonly current: string | null
  /** Что должно играть. */
  readonly next: string | null
  /** Громкость текущего источника прямо сейчас: с неё начинается спад. */
  readonly currentGain: number
  /** До какой громкости вести новый источник. */
  readonly targetGain: number
  /** Сколько гаснет старый, в секундах. */
  readonly fadeOut: number
  /** Сколько разгорается новый, в секундах. */
  readonly fadeIn: number
}

/** Мгновенных рамп в Web Audio не бывает: нулевая длительность даёт щелчок. */
const MIN_FADE = 0.02

function clampFade(seconds: number): number {
  return Number.isFinite(seconds) && seconds > MIN_FADE ? seconds : MIN_FADE
}

export function planCrossfade(input: CrossfadeInput): CrossfadePlan {
  const { now, current, next } = input
  if (current === next) return { kind: 'keep' }

  const fadeOut = clampFade(input.fadeOut)
  const fadeIn = clampFade(input.fadeIn)
  const out: readonly FadePoint[] = [
    { at: now, gain: input.currentGain },
    { at: now + fadeOut, gain: 0 },
  ]
  const enter: readonly FadePoint[] = [
    { at: now, gain: 0 },
    { at: now + fadeIn, gain: input.targetGain },
  ]

  if (current === null) return { kind: 'start', in: enter }
  if (next === null) return { kind: 'stop', out, stopAt: now + fadeOut }
  return { kind: 'swap', out, stopAt: now + fadeOut, in: enter }
}

/**
 * Длительности переходов.
 *
 * Атмосфера длиннее музыки. Причина в том, чем они друг от друга
 * отличаются: смена трека — событие, её слышно и она вправе совпасть
 * с переменой обстановки, а атмосфера — это воздух помещения, и подмена
 * воздуха должна пройти незамеченной. Переход из коридора в аудиторию
 * занимает шаг, но в ушах он тянется три секунды.
 */
export const MUSIC_FADE_OUT = 1.6
export const MUSIC_FADE_IN = 2.2
export const AMBIENCE_FADE_OUT = 2.6
export const AMBIENCE_FADE_IN = 3

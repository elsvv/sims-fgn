import { STEP_SOUNDS, type SampleId } from './catalog'

/**
 * Шаги под ногами.
 *
 * Шаг — не событие мира, а следствие того, что персонаж идёт: сообщать
 * о каждом отдельно симуляция не станет и не должна. Поэтому здесь
 * маленький метроном, который по признаку «идёт» и текущему времени
 * решает, когда ставить ногу.
 *
 * Метроном не «издаёт звук сейчас», а *назначает* шаги на ближайшие
 * доли секунды вперёд. Так сделано нарочно: звуковой слой опрашивается
 * раз в десятую долю секунды, а шаг на обычной скорости приходится раз
 * в полсекунды и на тройной — раз в шестую. Если звучать в момент
 * опроса, ходьба на тройной скорости выродится в дробь по десятым,
 * а на обычной шаги разъедутся на сотню миллисекунд каждый — и это
 * слышно как хромота. Назначенные вперёд, они ложатся точно: Web Audio
 * умеет запускать звук в заданный момент.
 *
 * Всё здесь чистое и проверяется тестом; воспроизведение — в mixer.ts.
 */

/**
 * Секунд между шагами на обычной скорости игры.
 *
 * Считается, а не подбирается: персонаж идёт 1.4 м/с (WALK_SPEED_MPS
 * в sim/actor/Actor.ts), шаг взрослого человека — около 65 см, отсюда
 * 0.46 с. Ошибиться здесь заметно: слишком частые шаги превращают
 * ходьбу в бег, слишком редкие — в шарканье.
 */
export const STEP_INTERVAL_SECONDS = 0.46

/**
 * Потолок числа шагов за один опрос. Защита от арифметики, а не от
 * походки: замерший вкладкой таймер способен принести дельту в минуту,
 * и без потолка сюда прилетело бы двести назначенных шагов разом.
 */
const MAX_STEPS_PER_TICK = 6

export interface StepState {
  /** Момент последнего назначенного шага, секунды звукового контекста. */
  readonly lastAt: number
  /** Какая из трёх записей пойдёт следующей. */
  readonly index: number
  /** Шёл ли персонаж на прошлом опросе. */
  readonly moving: boolean
}

export const IDLE_STEPS: StepState = { lastAt: 0, index: 0, moving: false }

/** Назначенный шаг: чем звучит и в какой момент. */
export interface ScheduledStep {
  readonly id: SampleId
  /** Абсолютное время звукового контекста, секунды. */
  readonly at: number
}

export interface StepTick {
  readonly state: StepState
  readonly steps: readonly ScheduledStep[]
}

const SILENT: readonly ScheduledStep[] = []

/**
 * Назначить шаги на ближайшее время.
 *
 * @param moving идёт ли персонаж прямо сейчас.
 * @param now время звукового контекста, секунды.
 * @param lookahead насколько вперёд назначать. Должно быть не меньше
 *   периода опроса, иначе между опросами останутся дыры.
 * @param gameSpeed множитель скорости игры. На тройной скорости персонаж
 *   и правда переставляет ноги втрое чаще — шаги обязаны за ним поспевать,
 *   иначе фигура едет по коридору беззвучно, как на роликах.
 */
export function advanceSteps(
  state: StepState,
  moving: boolean,
  now: number,
  lookahead: number,
  gameSpeed = 1,
): StepTick {
  if (!moving) {
    return { state: state.moving ? { ...state, moving: false } : state, steps: SILENT }
  }

  const interval = STEP_INTERVAL_SECONDS / Math.max(gameSpeed, 0.25)
  const horizon = now + Math.max(lookahead, 0)
  // Первый шаг после остановки звучит сразу, как только персонаж
  // тронулся: пауза перед ним читается как задержка звука, а не как
  // начало ходьбы.
  let next = state.moving ? state.lastAt + interval : now
  if (next < now) next = now

  const steps: ScheduledStep[] = []
  let index = state.index
  let lastAt = state.lastAt
  while (next < horizon && steps.length < MAX_STEPS_PER_TICK) {
    const id = STEP_SOUNDS[index % STEP_SOUNDS.length]
    if (id === undefined) break
    steps.push({ id, at: next })
    lastAt = next
    index = (index + 1) % STEP_SOUNDS.length
    next += interval
  }

  if (steps.length === 0) {
    return { state: state.moving ? state : { ...state, moving: true }, steps: SILENT }
  }
  return { state: { lastAt, index, moving: true }, steps }
}

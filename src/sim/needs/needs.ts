/**
 * Нужды персонажа. Для всех нужд, кроме stress, 100 = удовлетворена, 0 = критично.
 * Для stress ровно наоборот: 0 = спокоен, 100 = на грани.
 */
export type NeedId =
  | 'energy'
  | 'hunger'
  | 'bladder'
  | 'hygiene'
  | 'social'
  | 'fun'
  | 'stress'

export type Needs = Record<NeedId, number>

export const NEED_IDS: readonly NeedId[] = [
  'energy',
  'hunger',
  'bladder',
  'hygiene',
  'social',
  'fun',
  'stress',
]

/**
 * Подписи в интерфейсе. У стресса подпись «Спокойствие», потому что
 * полоска показывает удовлетворённость: полная полоска всегда означает,
 * что всё хорошо.
 */
export const NEED_LABELS: Record<NeedId, string> = {
  energy: 'Энергия',
  hunger: 'Сытость',
  bladder: 'Мочевой пузырь',
  hygiene: 'Гигиена',
  social: 'Социальность',
  fun: 'Веселье',
  stress: 'Спокойствие',
}

/**
 * На сколько единиц меняется нужда за игровой час сама по себе.
 * Подобрано так, чтобы за учебный день персонаж успел проголодаться
 * дважды и вымотаться к ночи.
 */
const DRIFT_PER_HOUR: Record<NeedId, number> = {
  energy: -6,
  hunger: -9,
  bladder: -12,
  hygiene: -4,
  social: -5,
  fun: -7,
  stress: +3,
}

const MOOD_WEIGHTS: Record<NeedId, number> = {
  energy: 1.4,
  hunger: 1.2,
  bladder: 0.8,
  hygiene: 0.6,
  social: 0.9,
  fun: 0.9,
  stress: 1.5,
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function createNeeds(overrides: Partial<Needs> = {}): Needs {
  return {
    energy: 100,
    hunger: 100,
    bladder: 100,
    hygiene: 100,
    social: 100,
    fun: 100,
    stress: 0,
    ...overrides,
  }
}

/** Возвращает новый объект нужд, состаренный на указанное число игровых минут. */
export function decayNeeds(needs: Needs, gameMinutes: number): Needs {
  const hours = gameMinutes / 60
  const next = {} as Needs
  for (const id of NEED_IDS) {
    next[id] = clamp(needs[id] + DRIFT_PER_HOUR[id] * hours)
  }
  return next
}

/** Возвращает новый объект нужд с применённой дельтой. */
export function applyNeedDelta(needs: Needs, delta: Partial<Needs>): Needs {
  const next = { ...needs }
  for (const id of NEED_IDS) {
    const change = delta[id]
    if (change !== undefined) next[id] = clamp(next[id] + change)
  }
  return next
}

/** Приводит нужду к шкале «насколько хорошо», где 100 всегда лучше 0. */
export function needSatisfaction(id: NeedId, value: number): number {
  return id === 'stress' ? 100 - value : value
}

/**
 * Взвешенное настроение персонажа, 0..100.
 *
 * Усредняются не сами удовлетворённости, а их корни — это взвешенное
 * степенное среднее с показателем 1/2. Простое среднее арифметическое
 * слишком снисходительно: голодный и вымотанный студент с полными
 * второстепенными нуждами получал бы «нормальное» настроение. Корень
 * даёт критичным нуждам тянуть настроение вниз сильнее, при этом
 * полные нужды по-прежнему дают ровно 100.
 */
export function calculateMood(needs: Needs): number {
  let sum = 0
  let weightTotal = 0
  for (const id of NEED_IDS) {
    sum += Math.sqrt(needSatisfaction(id, needs[id])) * MOOD_WEIGHTS[id]
    weightTotal += MOOD_WEIGHTS[id]
  }
  const mean = sum / weightTotal
  return mean * mean
}

import type { NeedId, Needs } from '../needs/needs'

/**
 * Сон — то, чем кончается игровой день.
 *
 * Модуль чистый: он считает, что сон даст нуждам, и ничего не применяет.
 * Место для сна описано данными, а не кодом, — ровно ради того, чтобы
 * кровать в общаге, которой сейчас нет, появилась одной строчкой в каталоге
 * контента и заработала без единой правки здесь.
 */

export interface SleepSpot {
  id: string
  /**
   * Вид предмета, на котором спят: `bed`, `bench`, `sofa`. Пусто у
   * вынужденного сна — он случается там, где персонаж стоял.
   */
  propKind: string | null
  /** Как место называется: «Скамейка в коридоре». */
  label: string
  /**
   * То же место в предложном падеже, как его вставляют в фразу:
   * «на скамейке в коридоре». Отдельным полем, потому что по-русски
   * из названия предлог с падежом не выводятся, а рассказ об утре
   * должен читаться как рассказ.
   */
  where: string
  /** Подпись действия в меню предмета: «Лечь спать». */
  actionLabel: string
  /**
   * Насколько хорошо здесь восстанавливается энергия, 0..1.
   * Единица — нормальная кровать, треть — скамейка в коридоре.
   */
  energyQuality: number
  /** Насколько сон здесь снимает стресс, 0..1. */
  stressRelief: number
  /** Модификатор настроения наутро. null — никакого. */
  moodletId: string | null
  /**
   * Приписка к рассказу об утре: «Спина это запомнит». Живёт в данных,
   * а не в коде, потому что это шутка про конкретное место, а не правило.
   */
  afterword: string | null
  /** Сон не по своей воле: персонаж не лёг, а отключился. */
  forced: boolean
}

export type SleepSpotCatalog = Record<string, SleepSpot>

/**
 * Идентификатор модификатора за ночь, проведённую стоя.
 *
 * Само название и величина живут в каталоге контента: sim объявляет, что
 * ему нужен такой модификатор, но не знает, как он подписан. Тот же приём,
 * что и у выступления на семинаре.
 */
export const COLLAPSE_MOODLET = 'passedOutWhereStanding'

/**
 * Сон, который случается сам.
 *
 * Дизайн-документ, раздел 3: после двух ночи персонаж вырубается где стоит
 * с большим штрафом. Восстановление здесь заведомо слабое, а стресс не
 * снимается вовсе: человек, отключившийся в коридоре, не отдохнул.
 */
export const COLLAPSE_SPOT: SleepSpot = {
  id: 'collapse',
  propKind: null,
  label: 'Там, где стояли',
  where: 'там, где стояли',
  actionLabel: 'Отрубиться',
  energyQuality: 0.3,
  stressRelief: 0,
  moodletId: COLLAPSE_MOODLET,
  afterword: 'Это не сон, это отключение. Утро легче не станет.',
  forced: true,
}

/** Сколько энергии возвращает час идеального сна. */
export const ENERGY_PER_HOUR = 13

/** Сколько стресса снимает час идеального сна. */
export const STRESS_RELIEF_PER_HOUR = 6

/**
 * Как нужды меняются за час сна сами по себе.
 *
 * Гигиена в этом списке не случайно и с минусом: сон её не поднимает,
 * а расходует, — душ в общаге появится вместе с общагой. Социальность
 * и веселье во сне не убывают: спящий не скучает по людям.
 */
const NIGHT_DRIFT_PER_HOUR: Partial<Record<NeedId, number>> = {
  hunger: -5,
  bladder: -7,
  hygiene: -3,
}

/**
 * Что сон сделает с нуждами.
 *
 * Восстановление пропорционально длительности и качеству места. Ночной
 * износ считается отдельно и в полном размере: проснуться сытым нельзя,
 * и первое, что делает выспавшийся студент, — идёт в туалет.
 */
export function sleepNeedDelta(minutes: number, spot: SleepSpot): Partial<Needs> {
  const hours = Math.max(0, minutes) / 60
  const delta: Partial<Needs> = {
    energy: ENERGY_PER_HOUR * hours * spot.energyQuality,
    stress: -STRESS_RELIEF_PER_HOUR * hours * spot.stressRelief,
  }
  for (const [id, drift] of Object.entries(NIGHT_DRIFT_PER_HOUR)) {
    delta[id as NeedId] = (delta[id as NeedId] ?? 0) + drift * hours
  }
  return delta
}

/** Ночь целиком: сколько проспали, где и что из этого вышло. */
export interface SleepOutcome {
  spotId: string
  /** Где спали, словами: «Скамейка в коридоре». */
  label: string
  /** Оно же в предложном падеже: «на скамейке в коридоре». */
  where: string
  /** Приписка об этом месте или null. */
  afterword: string | null
  /** Сколько игровых минут длился сон. */
  minutes: number
  /** Минута суток, в которую легли. */
  bedtimeMinutes: number
  forced: boolean
  needDelta: Partial<Needs>
  moodletId: string | null
}

/**
 * Считает ночь. Ничего не применяет — это делает мир.
 *
 * @param bedtimeMinutes минута суток, в которую легли.
 * @param minutes сколько минут продлится сон, до самого утра.
 */
export function sleepThroughNight(
  spot: SleepSpot,
  bedtimeMinutes: number,
  minutes: number,
): SleepOutcome {
  return {
    spotId: spot.id,
    label: spot.label,
    where: spot.where,
    afterword: spot.afterword,
    minutes,
    bedtimeMinutes,
    forced: spot.forced,
    needDelta: sleepNeedDelta(minutes, spot),
    moodletId: spot.moodletId,
  }
}

/** Возвращает список ошибок места для сна. Пустой список означает, что оно корректно. */
export function validateSleepSpot(spot: SleepSpot): string[] {
  const errors: string[] = []
  const where = `Место для сна «${spot.id}»`

  if (spot.label.trim() === '') errors.push(`${where}: нет названия`)
  if (spot.where.trim() === '') errors.push(`${where}: нет фразы «где спали»`)
  if (spot.actionLabel.trim() === '') errors.push(`${where}: нет подписи действия`)

  for (const [name, value] of [
    ['восстановление энергии', spot.energyQuality],
    ['снятие стресса', spot.stressRelief],
  ] as const) {
    if (value < 0 || value > 1) {
      errors.push(`${where}: ${name} ${value} вне шкалы 0..1`)
    }
  }

  return errors
}

/**
 * Проверяет каталог мест для сна целиком.
 *
 * Ключ каталога — вид предмета, и он обязан совпадать с propKind записи:
 * иначе «лечь спать» на кровати молча уложило бы персонажа на скамейку.
 */
export function validateSleepSpots(catalog: SleepSpotCatalog): string[] {
  const errors: string[] = []
  for (const [kind, spot] of Object.entries(catalog)) {
    errors.push(...validateSleepSpot(spot))
    if (spot.propKind !== kind) {
      errors.push(`Место для сна «${spot.id}» лежит под ключом «${kind}», а ссылается на «${spot.propKind}»`)
    }
    if (spot.forced) {
      errors.push(`Место для сна «${spot.id}»: вынужденный сон не выбирают в меню предмета`)
    }
  }
  return errors
}

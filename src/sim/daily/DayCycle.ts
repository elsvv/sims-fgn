import { MINUTES_PER_DAY } from '../time/GameClock'

/**
 * Границы игровых суток.
 *
 * Дизайн-документ, раздел 3: «Идёт с 07:00 до 02:00. После 02:00 персонаж
 * вырубается где стоит (с большим штрафом)».
 *
 * Отсюда единственная неочевидность всего модуля: прожитые сутки не совпадают
 * с календарными. Понедельник как день жизни — это отрезок от семи утра
 * понедельника до двух ночи вторника, и час ночи вторника принадлежит ещё
 * понедельнику. Часы при этом остаются обычными, с полуночью посередине:
 * расписание, сроки эссе и журнал посещаемости считают дни календарно,
 * и ломать им арифметику ради одного ночного часа было бы дорого.
 * Вместо этого есть livingDay — единственное место, где эти два счёта
 * расходятся.
 */

/** Во сколько персонаж просыпается. */
export const WAKE_MINUTES = 7 * 60

/** После этой минуты персонаж засыпает где стоит, хочет он того или нет. */
export const CURFEW_MINUTES = 2 * 60

/**
 * Игровой день, который персонаж проживает прямо сейчас.
 *
 * До семи утра это ещё вчерашний день: тот, кто сидит над эссе в час ночи,
 * не начал новый день, а не закончил прошлый. Итоги дня подводятся именно
 * по этому счёту, иначе ночная половина понедельника попала бы во вторник.
 */
export function livingDay(day: number, minutes: number): number {
  return minutes < WAKE_MINUTES ? day - 1 : day
}

/** Сколько минут осталось до ближайшего утра. */
export function minutesUntilMorning(minutes: number): number {
  if (minutes < WAKE_MINUTES) return WAKE_MINUTES - minutes
  return MINUTES_PER_DAY - minutes + WAKE_MINUTES
}

/** Календарный день, к утру которого приведёт сон. */
export function morningDay(day: number, minutes: number): number {
  return minutes < WAKE_MINUTES ? day : day + 1
}

/**
 * Пора ли вырубаться.
 *
 * Промежуток между двумя ночи и семью утра непроходим для бодрствующего
 * персонажа: в него нельзя войти иначе как через принудительный сон.
 */
export function isPastCurfew(minutes: number): boolean {
  return minutes >= CURFEW_MINUTES && minutes < WAKE_MINUTES
}

/**
 * Сколько минут осталось до отбоя. Ноль означает, что он уже наступил.
 *
 * Нужно интерфейсу: после полуночи в углу экрана появляется предупреждение,
 * и появиться оно должно заранее, а не в ту секунду, когда персонаж уже
 * лежит на полу коридора.
 */
export function minutesUntilCurfew(minutes: number): number {
  if (isPastCurfew(minutes)) return 0
  if (minutes < CURFEW_MINUTES) return CURFEW_MINUTES - minutes
  return MINUTES_PER_DAY - minutes + CURFEW_MINUTES
}

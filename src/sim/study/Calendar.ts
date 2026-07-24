/** Учебных недель в модуле. */
export const STUDY_WEEKS = 6

/** Номер сессионной недели (нумерация с нуля). */
export const SESSION_WEEK = 6

export const DAYS_PER_WEEK = 7

/** Всего дней в модуле вместе с сессией. */
export const TOTAL_DAYS = (STUDY_WEEKS + 1) * DAYS_PER_WEEK

export type DayKind = 'study' | 'weekend' | 'session' | 'over'

const WEEKDAY_NAMES = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const

/** Номер недели с нуля. */
export function weekOf(day: number): number {
  return Math.floor(day / DAYS_PER_WEEK)
}

/** День недели: 0 — понедельник, 5 — суббота, 6 — воскресенье. */
export function weekdayOf(day: number): number {
  return day % DAYS_PER_WEEK
}

/**
 * Учебная неделя в ВШЭ шестидневная: занятия идут с понедельника
 * по субботу, выходной один.
 */
export function dayKind(day: number): DayKind {
  if (day >= TOTAL_DAYS) return 'over'
  if (weekdayOf(day) === 6) return 'weekend'
  return weekOf(day) >= SESSION_WEEK ? 'session' : 'study'
}

export function isStudyDay(day: number): boolean {
  return dayKind(day) === 'study'
}

export function describeDay(day: number): string {
  const kind = dayKind(day)
  if (kind === 'over') return 'Модуль окончен'

  const weekday = WEEKDAY_NAMES[weekdayOf(day)] ?? 'понедельник'
  if (kind === 'session' || (kind === 'weekend' && weekOf(day) >= SESSION_WEEK)) {
    return `Сессия, ${weekday}`
  }
  return `Неделя ${weekOf(day) + 1}, ${weekday}`
}

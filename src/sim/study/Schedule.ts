import { formatClock } from '../time/GameClock'
import { isStudyDay, weekdayOf } from './Calendar'

/** Длительность пары: два академических часа. */
export const LESSON_MINUTES = 80

export interface Period {
  index: number
  startMinutes: number
  endMinutes: number
  /** Подпись вида «09:00–10:20». */
  label: string
}

function makePeriod(index: number, startMinutes: number): Period {
  const endMinutes = startMinutes + LESSON_MINUTES
  return {
    index,
    startMinutes,
    endMinutes,
    label: `${formatClock(startMinutes)}–${formatClock(endMinutes)}`,
  }
}

/**
 * Сетка звонков. Точное московское расписание ВШЭ в открытых источниках
 * не публикуется — оно живёт в закрытой системе расписаний. Эта сетка
 * достоверна по духу: пара 80 минут, короткие перемены, длинный
 * обеденный перерыв после второй пары.
 */
export const PERIODS: readonly Period[] = [
  makePeriod(0, 9 * 60),
  makePeriod(1, 10 * 60 + 30),
  makePeriod(2, 12 * 60 + 20),
  makePeriod(3, 13 * 60 + 50),
  makePeriod(4, 15 * 60 + 20),
  makePeriod(5, 16 * 60 + 50),
  makePeriod(6, 18 * 60 + 20),
]

export interface Lesson {
  id: string
  courseId: string
  kind: 'lecture' | 'seminar'
  /** 0 — понедельник, 5 — суббота. */
  weekday: number
  /** Индекс пары в PERIODS. */
  period: number
  /** Номер аудитории, например «А-204». */
  room: string
}

export type Schedule = readonly Lesson[]

export function periodOf(index: number): Period | undefined {
  return PERIODS[index]
}

/**
 * Идентификатор состоявшейся пары: день плюс слот расписания.
 *
 * Расписание описывает недельный ритм — «греческий по понедельникам, первой
 * парой». Слот повторяется каждую неделю, и lessonAt всякий понедельник
 * возвращает тот же объект с тем же id. Журналы же ведут счёт конкретным
 * состоявшимся парам, а не строкам расписания: отметка о присутствии стоит
 * на дне, и выступают на каждом семинаре, а не один раз за модуль.
 */
export function occurrenceId(day: number, lessonId: string): string {
  return `${day}:${lessonId}`
}

/**
 * Возвращает список ошибок расписания. Пустой список означает, что оно корректно.
 *
 * Повторённый идентификатор проверяется наравне с накладкой по времени,
 * и это не занудство: из него собирается occurrenceId, а значит два занятия
 * с одним id в один день — это одна пара в журналах. Отметка о присутствии
 * на первом закрывала бы второе, а выступление на первом отнимало бы слово
 * на втором. Опечатка в данных не должна выглядеть как поломка механики.
 */
export function validateSchedule(schedule: Schedule): string[] {
  const errors: string[] = []
  const occupied = new Map<string, string>()
  const ids = new Set<string>()

  for (const lesson of schedule) {
    if (lesson.weekday === 6) {
      errors.push(`Занятие ${lesson.id} поставлено в воскресенье`)
    }
    if (!periodOf(lesson.period)) {
      errors.push(`Занятие ${lesson.id} ссылается на несуществующую пару ${lesson.period}`)
    }

    if (ids.has(lesson.id)) {
      errors.push(`Идентификатор занятия ${lesson.id} повторяется`)
    } else {
      ids.add(lesson.id)
    }

    const slot = `${lesson.weekday}:${lesson.period}`
    const taken = occupied.get(slot)
    if (taken) {
      errors.push(`Занятия ${taken} и ${lesson.id} стоят одновременно`)
    } else {
      occupied.set(slot, lesson.id)
    }
  }

  return errors
}

export function lessonsOnDay(schedule: Schedule, day: number): Lesson[] {
  if (!isStudyDay(day)) return []
  const weekday = weekdayOf(day)
  return schedule
    .filter((lesson) => lesson.weekday === weekday)
    .sort((a, b) => a.period - b.period)
}

/** Занятие, идущее прямо сейчас, или null. */
export function lessonAt(schedule: Schedule, day: number, minutes: number): Lesson | null {
  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (minutes >= period.startMinutes && minutes < period.endMinutes) return lesson
  }
  return null
}

/** Ближайшее занятие сегодня, которое ещё не началось. */
export function nextLessonOnDay(
  schedule: Schedule,
  day: number,
  minutes: number,
): Lesson | null {
  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (period.startMinutes > minutes) return lesson
  }
  return null
}

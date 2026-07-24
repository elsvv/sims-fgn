import { classifyArrival, type AttendanceMark } from './Attendance'
import { lessonAt, lessonsOnDay, periodOf, type Schedule } from './Schedule'

/** Что нужно проставить в журнал посещаемости. */
export interface AttendanceDecision {
  lessonId: string
  courseId: string
  mark: AttendanceMark
}

/** Снимок мира, которого достаточно, чтобы решить вопрос о посещаемости. */
export interface AttendanceContext {
  schedule: Schedule
  /** Номер игрового дня с начала модуля. */
  day: number
  /** Минут с полуночи. */
  minutes: number
  /** Помещение, где стоит игрок: «А-204», «коридор». null — нигде конкретно. */
  room: string | null
  /** Уже проставленная отметка за занятие или null, если её ещё нет. */
  markFor: (lessonId: string) => AttendanceMark | null
}

/**
 * Решает, что записать в журнал посещаемости прямо сейчас.
 *
 * Правило простое и целиком выводится из положения персонажа: пришёл
 * в нужную аудиторию, пока пара идёт, — отметка по времени прихода
 * (вовремя, с опозданием); пара кончилась, а отметки нет — прогул.
 * Стоять в коридоре под дверью недостаточно: аудитория считается
 * по клетке, на которой стоит персонаж.
 *
 * Функция чистая: она ничего не меняет, а возвращает список решений.
 * Повторный вызов не перезапишет уже проставленную отметку — занятия
 * с отметкой в решения не попадают.
 */
export function decideAttendance(context: AttendanceContext): AttendanceDecision[] {
  const { schedule, day, minutes, room, markFor } = context
  const decisions: AttendanceDecision[] = []

  const current = lessonAt(schedule, day, minutes)
  if (current && room !== null && room === current.room && markFor(current.id) === null) {
    const period = periodOf(current.period)
    if (period) {
      decisions.push({
        lessonId: current.id,
        courseId: current.courseId,
        mark: classifyArrival(period, minutes),
      })
    }
  }

  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (minutes < period.endMinutes) continue
    if (markFor(lesson.id) !== null) continue
    decisions.push({ lessonId: lesson.id, courseId: lesson.courseId, mark: 'absent' })
  }

  return decisions
}

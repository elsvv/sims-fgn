import { classifyArrival, type AttendanceMark } from './Attendance'
import { lessonAt, lessonsOnDay, occurrenceId, periodOf, type Schedule } from './Schedule'

/** Что нужно проставить в журнал посещаемости. */
export interface AttendanceDecision {
  /** Конкретная состоявшаяся пара: день плюс слот расписания. */
  occurrenceId: string
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
  /** Уже проставленная отметка за эту пару или null, если её ещё нет. */
  markFor: (occurrenceId: string) => AttendanceMark | null
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
 * Отметки ключуются днём, а не строкой расписания: понедельничная пара
 * бывает каждую неделю, и присутствие на первой не закрывает остальные.
 *
 * Функция чистая: она ничего не меняет, а возвращает список решений.
 * Повторный вызов не перезапишет уже проставленную отметку — пары
 * с отметкой в решения не попадают.
 */
export function decideAttendance(context: AttendanceContext): AttendanceDecision[] {
  const { schedule, day, minutes, room, markFor } = context
  const decisions: AttendanceDecision[] = []

  const current = lessonAt(schedule, day, minutes)
  const currentId = current ? occurrenceId(day, current.id) : null
  if (current && currentId && room !== null && room === current.room && markFor(currentId) === null) {
    const period = periodOf(current.period)
    if (period) {
      decisions.push({
        occurrenceId: currentId,
        courseId: current.courseId,
        mark: classifyArrival(period, minutes),
      })
    }
  }

  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (minutes < period.endMinutes) continue
    const id = occurrenceId(day, lesson.id)
    if (markFor(id) !== null) continue
    decisions.push({ occurrenceId: id, courseId: lesson.courseId, mark: 'absent' })
  }

  return decisions
}

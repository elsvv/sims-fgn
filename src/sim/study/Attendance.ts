import { MAX_GRADE } from './Course'
import type { Period } from './Schedule'

/** Сколько минут опоздания ещё считается приходом вовремя. */
export const LATE_THRESHOLD_MINUTES = 10

export type AttendanceMark = 'present' | 'late' | 'absent'

export interface AttendanceCounts {
  present: number
  late: number
  absent: number
}

interface AttendanceEntry {
  courseId: string
  mark: AttendanceMark
}

/** Насколько опоздание засчитывается в посещаемость. */
const LATE_CREDIT = 0.5

export function classifyArrival(period: Period, arrivalMinutes: number): AttendanceMark {
  if (arrivalMinutes >= period.endMinutes) return 'absent'
  if (arrivalMinutes <= period.startMinutes + LATE_THRESHOLD_MINUTES) return 'present'
  return 'late'
}

/**
 * Журнал посещаемости.
 *
 * Ключ — идентификатор состоявшейся пары (occurrenceId в Schedule), а не слот
 * расписания: «греческий по понедельникам» бывает шесть раз за модуль, и
 * каждый понедельник заслуживает своей отметки.
 */
export class AttendanceLog {
  private entries: Record<string, AttendanceEntry> = {}

  mark(occurrenceId: string, courseId: string, mark: AttendanceMark): void {
    this.entries[occurrenceId] = { courseId, mark }
  }

  markFor(occurrenceId: string): AttendanceMark | null {
    return this.entries[occurrenceId]?.mark ?? null
  }

  countByCourse(courseId: string): AttendanceCounts {
    const counts: AttendanceCounts = { present: 0, late: 0, absent: 0 }
    for (const entry of Object.values(this.entries)) {
      if (entry.courseId !== courseId) continue
      counts[entry.mark]++
    }
    return counts
  }

  /**
   * Посещаемость как оценка 0..10. Опоздание засчитывается вполовину.
   * Пока занятий не было, посещаемость считается идеальной — иначе
   * первого сентября студент начинал бы с нуля.
   */
  attendanceGrade(courseId: string): number {
    const { present, late, absent } = this.countByCourse(courseId)
    const total = present + late + absent
    if (total === 0) return MAX_GRADE
    return (present + late * LATE_CREDIT) / total * MAX_GRADE
  }

  toJSON(): Record<string, AttendanceEntry> {
    return JSON.parse(JSON.stringify(this.entries)) as Record<string, AttendanceEntry>
  }

  static fromJSON(entries: Record<string, AttendanceEntry>): AttendanceLog {
    const log = new AttendanceLog()
    log.entries = JSON.parse(JSON.stringify(entries)) as Record<string, AttendanceEntry>
    return log
  }
}

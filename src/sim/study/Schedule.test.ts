import { describe, expect, it } from 'vitest'
import {
  lessonAt,
  lessonsOnDay,
  nextLessonOnDay,
  occurrenceId,
  PERIODS,
  periodOf,
  validateSchedule,
  type Schedule,
} from './Schedule'

const SCHEDULE: Schedule = [
  { id: 'l1', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'l2', courseId: 'logic', kind: 'lecture', weekday: 0, period: 2, room: 'А-308' },
  { id: 'l3', courseId: 'greek', kind: 'seminar', weekday: 3, period: 1, room: 'А-204' },
]

describe('сетка звонков', () => {
  it('пары идут по 80 минут', () => {
    for (const period of PERIODS) {
      expect(period.endMinutes - period.startMinutes).toBe(80)
    }
  })

  it('пары не накладываются и идут по возрастанию', () => {
    for (let i = 1; i < PERIODS.length; i++) {
      expect(PERIODS[i]!.startMinutes).toBeGreaterThanOrEqual(PERIODS[i - 1]!.endMinutes)
    }
  })

  it('подписаны как ЧЧ:ММ–ЧЧ:ММ', () => {
    expect(PERIODS[0]!.label).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/)
  })

  it('отдаёт пару по индексу', () => {
    expect(periodOf(0)).toBe(PERIODS[0])
    expect(periodOf(99)).toBeUndefined()
  })
})

describe('расписание', () => {
  it('принимает корректное расписание', () => {
    expect(validateSchedule(SCHEDULE)).toEqual([])
  })

  it('ругается на два занятия в одно время', () => {
    const clash: Schedule = [
      ...SCHEDULE,
      { id: 'l4', courseId: 'history', kind: 'lecture', weekday: 0, period: 0, room: 'А-312' },
    ]
    expect(validateSchedule(clash).join(' ')).toContain('одновременно')
  })

  it('ругается на занятие в воскресенье', () => {
    const sunday: Schedule = [
      { id: 'l5', courseId: 'greek', kind: 'seminar', weekday: 6, period: 0, room: 'А-204' },
    ]
    expect(validateSchedule(sunday).join(' ')).toContain('воскресень')
  })

  it('отдаёт занятия дня', () => {
    // День 0 — понедельник
    expect(lessonsOnDay(SCHEDULE, 0).map((l) => l.id)).toEqual(['l1', 'l2'])
    // День 3 — четверг
    expect(lessonsOnDay(SCHEDULE, 3).map((l) => l.id)).toEqual(['l3'])
    // День 1 — вторник, пусто
    expect(lessonsOnDay(SCHEDULE, 1)).toEqual([])
  })

  it('в воскресенье занятий нет', () => {
    expect(lessonsOnDay(SCHEDULE, 6)).toEqual([])
  })

  it('находит идущее сейчас занятие', () => {
    const first = PERIODS[0]!
    expect(lessonAt(SCHEDULE, 0, first.startMinutes + 10)?.id).toBe('l1')
    expect(lessonAt(SCHEDULE, 0, first.endMinutes + 5)).toBeNull()
  })

  it('находит следующее занятие дня', () => {
    expect(nextLessonOnDay(SCHEDULE, 0, 0)?.id).toBe('l1')
    expect(nextLessonOnDay(SCHEDULE, 0, PERIODS[0]!.endMinutes)?.id).toBe('l2')
    expect(nextLessonOnDay(SCHEDULE, 0, 23 * 60)).toBeNull()
  })

  it('каждый понедельник отдаёт один и тот же слот расписания', () => {
    // Ровно из-за этого журналы не могут ключеваться идентификатором слота.
    expect(lessonAt(SCHEDULE, 0, PERIODS[0]!.startMinutes + 10)?.id).toBe('l1')
    expect(lessonAt(SCHEDULE, 7, PERIODS[0]!.startMinutes + 10)?.id).toBe('l1')
  })
})

describe('идентификатор состоявшейся пары', () => {
  it('различает один и тот же слот в разные дни', () => {
    expect(occurrenceId(0, 'l1')).not.toBe(occurrenceId(7, 'l1'))
  })

  it('в один день различает разные слоты', () => {
    expect(occurrenceId(0, 'l1')).not.toBe(occurrenceId(0, 'l2'))
  })

  it('на одну и ту же пару отвечает одинаково', () => {
    expect(occurrenceId(0, 'l1')).toBe(occurrenceId(0, 'l1'))
  })
})

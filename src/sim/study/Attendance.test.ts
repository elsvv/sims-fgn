import { describe, expect, it } from 'vitest'
import { AttendanceLog, classifyArrival, LATE_THRESHOLD_MINUTES } from './Attendance'
import { PERIODS } from './Schedule'

const PERIOD = PERIODS[0]!

describe('classifyArrival', () => {
  it('пришёл вовремя', () => {
    expect(classifyArrival(PERIOD, PERIOD.startMinutes)).toBe('present')
    expect(classifyArrival(PERIOD, PERIOD.startMinutes - 5)).toBe('present')
  })

  it('опоздал в пределах порога', () => {
    expect(classifyArrival(PERIOD, PERIOD.startMinutes + LATE_THRESHOLD_MINUTES - 1)).toBe('present')
    expect(classifyArrival(PERIOD, PERIOD.startMinutes + LATE_THRESHOLD_MINUTES + 1)).toBe('late')
  })

  it('пришёл под конец — это прогул', () => {
    expect(classifyArrival(PERIOD, PERIOD.endMinutes - 1)).toBe('late')
    expect(classifyArrival(PERIOD, PERIOD.endMinutes + 1)).toBe('absent')
  })
})

describe('AttendanceLog', () => {
  it('пустой журнал не знает отметок', () => {
    expect(new AttendanceLog().markFor('l1')).toBeNull()
  })

  it('запоминает отметку', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'present')
    expect(log.markFor('l1')).toBe('present')
  })

  it('считает отметки по курсу', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'present')
    log.mark('l2', 'greek', 'late')
    log.mark('l3', 'greek', 'absent')
    log.mark('l4', 'logic', 'present')

    expect(log.countByCourse('greek')).toEqual({ present: 1, late: 1, absent: 1 })
    expect(log.countByCourse('logic')).toEqual({ present: 1, late: 0, absent: 0 })
    expect(log.countByCourse('нет')).toEqual({ present: 0, late: 0, absent: 0 })
  })

  it('переводит посещаемость в оценку', () => {
    const perfect = new AttendanceLog()
    for (let i = 0; i < 10; i++) perfect.mark(`l${i}`, 'greek', 'present')
    expect(perfect.attendanceGrade('greek')).toBe(10)

    const awful = new AttendanceLog()
    for (let i = 0; i < 10; i++) awful.mark(`l${i}`, 'greek', 'absent')
    expect(awful.attendanceGrade('greek')).toBe(0)
  })

  it('опоздание засчитывается вполовину', () => {
    const log = new AttendanceLog()
    for (let i = 0; i < 10; i++) log.mark(`l${i}`, 'greek', 'late')
    expect(log.attendanceGrade('greek')).toBe(5)
  })

  it('без занятий посещаемость считается идеальной', () => {
    expect(new AttendanceLog().attendanceGrade('greek')).toBe(10)
  })

  it('переживает сохранение и загрузку', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'late')
    const restored = AttendanceLog.fromJSON(JSON.parse(JSON.stringify(log.toJSON())))
    expect(restored.markFor('l1')).toBe('late')
    expect(restored.countByCourse('greek').late).toBe(1)
  })
})

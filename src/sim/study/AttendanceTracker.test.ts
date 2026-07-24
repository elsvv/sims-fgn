import { describe, expect, it } from 'vitest'
import { AttendanceLog, LATE_THRESHOLD_MINUTES } from './Attendance'
import { decideAttendance, type AttendanceDecision } from './AttendanceTracker'
import { PERIODS, type Schedule } from './Schedule'

const FIRST = PERIODS[0]!
const SECOND = PERIODS[1]!

/** Понедельник — первый учебный день модуля. */
const MONDAY = 0
/** Воскресенье первой недели: занятий нет. */
const SUNDAY = 6

const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'logic-mon', courseId: 'logic', kind: 'lecture', weekday: 0, period: 1, room: 'А-206' },
]

function decide(
  minutes: number,
  room: string | null,
  log = new AttendanceLog(),
): AttendanceDecision[] {
  return decideAttendance({
    schedule: SCHEDULE,
    day: MONDAY,
    minutes,
    room,
    markFor: (lessonId) => log.markFor(lessonId),
  })
}

/** Проставляет решения в журнал, как это делает World. */
function apply(log: AttendanceLog, decisions: AttendanceDecision[]): void {
  for (const decision of decisions) log.mark(decision.lessonId, decision.courseId, decision.mark)
}

describe('отслеживание посещения', () => {
  it('засчитывает приход вовремя', () => {
    expect(decide(FIRST.startMinutes, 'А-204')).toEqual([
      { lessonId: 'greek-mon', courseId: 'greek', mark: 'present' },
    ])
  })

  it('засчитывает приход впритык к порогу опоздания', () => {
    const at = FIRST.startMinutes + LATE_THRESHOLD_MINUTES
    expect(decide(at, 'А-204')[0]?.mark).toBe('present')
  })

  it('отмечает опоздание', () => {
    const at = FIRST.startMinutes + LATE_THRESHOLD_MINUTES + 1
    expect(decide(at, 'А-204')[0]?.mark).toBe('late')
  })

  it('считает опозданием и приход под самый конец пары', () => {
    expect(decide(FIRST.endMinutes - 1, 'А-204')[0]?.mark).toBe('late')
  })

  it('ничего не решает, пока пара идёт, а игрок в соседней аудитории', () => {
    expect(decide(FIRST.startMinutes + 5, 'А-206')).toEqual([])
  })

  it('ничего не решает, пока пара идёт, а игрок в коридоре', () => {
    expect(decide(FIRST.startMinutes + 5, 'коридор')).toEqual([])
  })

  it('ничего не решает, если игрок не в помещении вовсе', () => {
    expect(decide(FIRST.startMinutes + 5, null)).toEqual([])
  })

  it('ставит прогул, когда пара кончилась, а отметки нет', () => {
    expect(decide(FIRST.endMinutes, 'коридор')).toEqual([
      { lessonId: 'greek-mon', courseId: 'greek', mark: 'absent' },
    ])
  })

  it('не ставит прогул за пару, которая ещё не началась', () => {
    expect(decide(FIRST.startMinutes - 1, 'коридор')).toEqual([])
  })

  it('приход в нужную аудиторию после звонка уже не спасает', () => {
    expect(decide(FIRST.endMinutes, 'А-204')).toEqual([
      { lessonId: 'greek-mon', courseId: 'greek', mark: 'absent' },
    ])
  })

  it('ставит прогулы за все пропущенные пары дня разом', () => {
    const decisions = decide(SECOND.endMinutes + 30, 'коридор')
    expect(decisions.map((d) => d.lessonId)).toEqual(['greek-mon', 'logic-mon'])
    expect(decisions.every((d) => d.mark === 'absent')).toBe(true)
  })

  it('не перезаписывает уже проставленную отметку', () => {
    const log = new AttendanceLog()
    apply(log, decide(FIRST.startMinutes, 'А-204', log))
    expect(log.markFor('greek-mon')).toBe('present')

    // Игрок остался в аудитории до конца пары — отметка не должна поплыть.
    apply(log, decide(FIRST.startMinutes + 40, 'А-204', log))
    expect(log.markFor('greek-mon')).toBe('present')

    apply(log, decide(FIRST.endMinutes + 5, 'коридор', log))
    expect(log.markFor('greek-mon')).toBe('present')
  })

  it('не ставит прогул за пару, где отметка уже есть', () => {
    const log = new AttendanceLog()
    log.mark('greek-mon', 'greek', 'late')
    expect(decide(FIRST.endMinutes + 60, 'коридор', log)).toEqual([])
  })

  it('присуждает отметку тому занятию, что идёт сейчас, а не первому в дне', () => {
    const log = new AttendanceLog()
    log.mark('greek-mon', 'greek', 'present')
    expect(decide(SECOND.startMinutes + 2, 'А-206', log)).toEqual([
      { lessonId: 'logic-mon', courseId: 'logic', mark: 'present' },
    ])
  })

  it('за один вызов ставит прогул за прошлую пару и присутствие на текущей', () => {
    const decisions = decide(SECOND.startMinutes, 'А-206')
    expect(decisions).toEqual([
      { lessonId: 'logic-mon', courseId: 'logic', mark: 'present' },
      { lessonId: 'greek-mon', courseId: 'greek', mark: 'absent' },
    ])
  })

  it('молчит в день без занятий', () => {
    const decisions = decideAttendance({
      schedule: SCHEDULE,
      day: SUNDAY,
      minutes: FIRST.startMinutes,
      room: 'А-204',
      markFor: () => null,
    })
    expect(decisions).toEqual([])
  })

  it('молчит при пустом расписании', () => {
    const decisions = decideAttendance({
      schedule: [],
      day: MONDAY,
      minutes: FIRST.startMinutes,
      room: 'А-204',
      markFor: () => null,
    })
    expect(decisions).toEqual([])
  })

  it('ничего не меняет сам по себе: журнал остаётся пустым без применения решений', () => {
    const log = new AttendanceLog()
    decide(FIRST.startMinutes, 'А-204', log)
    expect(log.markFor('greek-mon')).toBeNull()
  })
})

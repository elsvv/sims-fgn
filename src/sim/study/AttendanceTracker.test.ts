import { describe, expect, it } from 'vitest'
import { AttendanceLog, LATE_THRESHOLD_MINUTES } from './Attendance'
import { decideAttendance, type AttendanceDecision } from './AttendanceTracker'
import { occurrenceId, PERIODS, type Schedule } from './Schedule'

const FIRST = PERIODS[0]!
const SECOND = PERIODS[1]!

/** Понедельник — первый учебный день модуля. */
const MONDAY = 0
/** Тот же понедельник неделей позже. */
const NEXT_MONDAY = 7
/** Воскресенье первой недели: занятий нет. */
const SUNDAY = 6

const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'logic-mon', courseId: 'logic', kind: 'lecture', weekday: 0, period: 1, room: 'А-206' },
]

/** Ключ пары в журнале: тот же, что складывает сам трекер. */
const GREEK_MON = occurrenceId(MONDAY, 'greek-mon')
const LOGIC_MON = occurrenceId(MONDAY, 'logic-mon')

function decideOn(
  day: number,
  minutes: number,
  room: string | null,
  log = new AttendanceLog(),
): AttendanceDecision[] {
  return decideAttendance({
    schedule: SCHEDULE,
    day,
    minutes,
    room,
    markFor: (id) => log.markFor(id),
  })
}

function decide(
  minutes: number,
  room: string | null,
  log = new AttendanceLog(),
): AttendanceDecision[] {
  return decideOn(MONDAY, minutes, room, log)
}

/** Проставляет решения в журнал, как это делает World. */
function apply(log: AttendanceLog, decisions: AttendanceDecision[]): void {
  for (const decision of decisions) {
    log.mark(decision.occurrenceId, decision.courseId, decision.mark)
  }
}

describe('отслеживание посещения', () => {
  it('засчитывает приход вовремя', () => {
    expect(decide(FIRST.startMinutes, 'А-204')).toEqual([
      { occurrenceId: GREEK_MON, courseId: 'greek', mark: 'present' },
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
      { occurrenceId: GREEK_MON, courseId: 'greek', mark: 'absent' },
    ])
  })

  it('не ставит прогул за пару, которая ещё не началась', () => {
    expect(decide(FIRST.startMinutes - 1, 'коридор')).toEqual([])
  })

  it('приход в нужную аудиторию после звонка уже не спасает', () => {
    expect(decide(FIRST.endMinutes, 'А-204')).toEqual([
      { occurrenceId: GREEK_MON, courseId: 'greek', mark: 'absent' },
    ])
  })

  it('ставит прогулы за все пропущенные пары дня разом', () => {
    const decisions = decide(SECOND.endMinutes + 30, 'коридор')
    expect(decisions.map((d) => d.occurrenceId)).toEqual([GREEK_MON, LOGIC_MON])
    expect(decisions.every((d) => d.mark === 'absent')).toBe(true)
  })

  it('не перезаписывает уже проставленную отметку', () => {
    const log = new AttendanceLog()
    apply(log, decide(FIRST.startMinutes, 'А-204', log))
    expect(log.markFor(GREEK_MON)).toBe('present')

    // Игрок остался в аудитории до конца пары — отметка не должна поплыть.
    apply(log, decide(FIRST.startMinutes + 40, 'А-204', log))
    expect(log.markFor(GREEK_MON)).toBe('present')

    apply(log, decide(FIRST.endMinutes + 5, 'коридор', log))
    expect(log.markFor(GREEK_MON)).toBe('present')
  })

  it('не ставит прогул за пару, где отметка уже есть', () => {
    const log = new AttendanceLog()
    log.mark(GREEK_MON, 'greek', 'late')
    expect(decide(FIRST.endMinutes + 60, 'коридор', log)).toEqual([])
  })

  it('присуждает отметку тому занятию, что идёт сейчас, а не первому в дне', () => {
    const log = new AttendanceLog()
    log.mark(GREEK_MON, 'greek', 'present')
    expect(decide(SECOND.startMinutes + 2, 'А-206', log)).toEqual([
      { occurrenceId: LOGIC_MON, courseId: 'logic', mark: 'present' },
    ])
  })

  it('за один вызов ставит прогул за прошлую пару и присутствие на текущей', () => {
    const decisions = decide(SECOND.startMinutes, 'А-206')
    expect(decisions).toEqual([
      { occurrenceId: LOGIC_MON, courseId: 'logic', mark: 'present' },
      { occurrenceId: GREEK_MON, courseId: 'greek', mark: 'absent' },
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
    expect(log.markFor(GREEK_MON)).toBeNull()
  })
})

/**
 * Расписание задаёт недельный ритм, а журнал считает состоявшиеся пары.
 * Понедельничный семинар бывает шесть раз за модуль, и присутствие на первом
 * не должно закрывать остальные пять.
 */
describe('отметки на разных неделях', () => {
  it('отмечает ту же пару неделей позже отдельно', () => {
    const log = new AttendanceLog()
    apply(log, decideOn(MONDAY, FIRST.startMinutes, 'А-204', log))
    apply(log, decideOn(NEXT_MONDAY, FIRST.startMinutes, 'А-204', log))

    expect(log.markFor(GREEK_MON)).toBe('present')
    expect(log.markFor(occurrenceId(NEXT_MONDAY, 'greek-mon'))).toBe('present')
    expect(log.countByCourse('greek').present).toBe(2)
  })

  it('прошлая отметка не закрывает пару на следующей неделе', () => {
    const log = new AttendanceLog()
    apply(log, decideOn(MONDAY, FIRST.startMinutes, 'А-204', log))

    // На следующей неделе игрок просидел ту же пару в коридоре — это прогул,
    // а не «отметка уже стоит».
    apply(log, decideOn(NEXT_MONDAY, FIRST.endMinutes + 5, 'коридор', log))
    expect(log.markFor(occurrenceId(NEXT_MONDAY, 'greek-mon'))).toBe('absent')
    expect(log.countByCourse('greek')).toEqual({ present: 1, late: 0, absent: 1 })
  })
})

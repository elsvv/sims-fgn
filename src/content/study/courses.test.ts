import { describe, expect, it } from 'vitest'
import { validateCourse } from '../../sim/study/Course'
import { lessonsOnDay, periodOf, validateSchedule, type Lesson } from '../../sim/study/Schedule'
import { FLOOR_A2 } from '../floors/floorA2'
import { COURSES, ESSAYS, SCHEDULE, STUDY_CONFIG } from './courses'

/** Учебные дни недели: понедельник — суббота. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5]

/** Дни первой учебной недели: 0 — понедельник, 5 — суббота. */
const FIRST_WEEK = WEEKDAYS

function lessonsOfWeekday(weekday: number): Lesson[] {
  return lessonsOnDay(SCHEDULE, weekday)
}

/** Минуты начала и конца пары. Расписание без сетки звонков бессмысленно. */
function span(lesson: Lesson): { start: number; end: number } {
  const period = periodOf(lesson.period)
  expect(period, `у занятия ${lesson.id} нет пары ${lesson.period}`).toBeDefined()
  return { start: period!.startMinutes, end: period!.endMinutes }
}

describe('курсы первого курса', () => {
  it('все формулы корректны', () => {
    for (const course of Object.values(COURSES)) {
      expect(validateCourse(course), course.title).toEqual([])
    }
  })

  it('идентификатор курса совпадает с ключом каталога', () => {
    for (const [key, course] of Object.entries(COURSES)) {
      expect(course.id).toBe(key)
    }
  })

  it('у каждого курса есть преподаватель', () => {
    for (const course of Object.values(COURSES)) {
      expect(course.teacherId.length, course.title).toBeGreaterThan(0)
    }
  })

  it('расписание корректно', () => {
    expect(validateSchedule(SCHEDULE)).toEqual([])
  })

  it('каждое занятие ссылается на существующий курс', () => {
    for (const lesson of SCHEDULE) {
      expect(COURSES[lesson.courseId], lesson.id).toBeDefined()
    }
  })

  it('у каждого курса есть хотя бы одно занятие в расписании', () => {
    for (const id of Object.keys(COURSES)) {
      expect(SCHEDULE.some((lesson) => lesson.courseId === id), id).toBe(true)
    }
  })

  it('номера аудиторий выглядят как настоящие', () => {
    for (const lesson of SCHEDULE) {
      expect(lesson.room, lesson.id).toMatch(/^[А-Я]-\d{3}$/)
    }
  })

  /*
   * Аудитория, которой нет на этаже, — это не опечатка, а автоматический
   * прогул: посещаемость считается по тому, где стоит персонаж, и дойти
   * до несуществующей комнаты он не может никогда. Формат номера тут
   * ничего не гарантирует: «А-308» выглядит как настоящий и существует
   * в жизни, но на построенном этаже его нет.
   */
  it('каждая пара стоит в аудитории, которая есть на этаже', () => {
    const rooms = new Set(FLOOR_A2.rooms.map((room) => room.id))
    for (const lesson of SCHEDULE) {
      expect(rooms.has(lesson.room), `${lesson.id} стоит в ${lesson.room}`).toBe(true)
    }
  })
})

/**
 * Расписание как ритм дня.
 *
 * Пункт 4 списка проблем: «в первый день всего две пары, между ними
 * и после них заняться нечем». День проверяется здесь целиком — сколько
 * пар, где окна, не забит ли он подряд, — потому что пустой день ломает
 * игру не хуже сломанной механики: делать в нём нечего, и модуль
 * проматывается сном.
 */
describe('ритм учебной недели', () => {
  it('в каждом учебном дне от трёх до пяти пар', () => {
    for (const weekday of WEEKDAYS) {
      const count = lessonsOfWeekday(weekday).length
      expect(count, `день недели ${weekday}`).toBeGreaterThanOrEqual(3)
      expect(count, `день недели ${weekday}`).toBeLessThanOrEqual(5)
    }
  })

  it('в воскресенье пар нет', () => {
    expect(SCHEDULE.filter((lesson) => lesson.weekday === 6)).toEqual([])
  })

  /*
   * Окно — главный ресурс игрока (дизайн-документ, §3). День, в котором
   * пары стоят вплотную, отнимает его целиком: сходить в столовую,
   * посидеть над эссе, застать преподавателя в коридоре будет негде.
   */
  it('в каждом дне есть окно не меньше полутора часов', () => {
    for (const weekday of WEEKDAYS) {
      const lessons = lessonsOfWeekday(weekday)
      const gaps = lessons.slice(1).map((lesson, index) => {
        const previous = lessons[index]!
        return span(lesson).start - span(previous).end
      })
      expect(Math.max(...gaps), `день недели ${weekday}`).toBeGreaterThanOrEqual(90)
    }
  })

  it('подряд, через одну перемену, стоят не больше двух пар', () => {
    for (const weekday of WEEKDAYS) {
      const lessons = lessonsOfWeekday(weekday)
      let run = 1
      let longest = 1
      for (let i = 1; i < lessons.length; i++) {
        const gap = span(lessons[i]!).start - span(lessons[i - 1]!).end
        run = gap <= 15 ? run + 1 : 1
        longest = Math.max(longest, run)
      }
      expect(longest, `день недели ${weekday}`).toBeLessThanOrEqual(2)
    }
  })

  /*
   * Перемена — десять минут, а по коридору идти двадцать. Пара подряд
   * в другом конце этажа означала бы опоздание, записанное в расписание.
   */
  it('пары через перемену стоят в одной аудитории', () => {
    for (const weekday of WEEKDAYS) {
      const lessons = lessonsOfWeekday(weekday)
      for (let i = 1; i < lessons.length; i++) {
        const gap = span(lessons[i]!).start - span(lessons[i - 1]!).end
        if (gap > 15) continue
        expect(lessons[i]!.room, `${lessons[i - 1]!.id} → ${lessons[i]!.id}`).toBe(
          lessons[i - 1]!.room,
        )
      }
    }
  })

  it('у каждого курса два-три занятия в неделю', () => {
    for (const id of Object.keys(COURSES)) {
      const count = SCHEDULE.filter((lesson) => lesson.courseId === id).length
      expect(count, id).toBeGreaterThanOrEqual(2)
      expect(count, id).toBeLessThanOrEqual(3)
    }
  })

  it('ни один курс не собран в один день', () => {
    for (const id of Object.keys(COURSES)) {
      const days = SCHEDULE.filter((lesson) => lesson.courseId === id).map((l) => l.weekday)
      expect(new Set(days).size, id).toBe(days.length)
    }
  })

  /*
   * Сначала слушают, потом обсуждают. Семинар раньше первой лекции курса —
   * это не строгость ради строгости: обсуждать первокурснику нечего,
   * пока он не услышал, о чём речь.
   */
  it('лекция курса стоит раньше его первого семинара', () => {
    for (const id of Object.keys(COURSES)) {
      const own = SCHEDULE.filter((lesson) => lesson.courseId === id)
      const lectures = own.filter((lesson) => lesson.kind === 'lecture')
      if (lectures.length === 0) continue

      const at = (lesson: Lesson): number => lesson.weekday * 100 + lesson.period
      const firstLecture = Math.min(...lectures.map(at))
      const firstSeminar = Math.min(
        ...own.filter((lesson) => lesson.kind === 'seminar').map(at),
      )
      expect(firstLecture, id).toBeLessThan(firstSeminar)
    }
  })

  /*
   * Выступление — главное учебное действие игры. Учебный день, в котором
   * не на чем выступить, оставляет игрока зрителем на весь день.
   */
  it('в каждом учебном дне есть хотя бы один семинар', () => {
    for (const day of FIRST_WEEK) {
      const seminars = lessonsOnDay(SCHEDULE, day).filter((l) => l.kind === 'seminar')
      expect(seminars.length, `день ${day}`).toBeGreaterThan(0)
    }
  })

  it('преподаватель не ведёт две пары подряд в разных концах этажа', () => {
    for (const weekday of WEEKDAYS) {
      const lessons = lessonsOfWeekday(weekday)
      for (let i = 1; i < lessons.length; i++) {
        const gap = span(lessons[i]!).start - span(lessons[i - 1]!).end
        if (gap > 15) continue
        const before = COURSES[lessons[i - 1]!.courseId]?.teacherId
        const after = COURSES[lessons[i]!.courseId]?.teacherId
        if (before !== after) continue
        expect(lessons[i]!.room, `${before} подряд`).toBe(lessons[i - 1]!.room)
      }
    }
  })

})

describe('эссе и сборка конфигурации', () => {
  it('каждое эссе ссылается на существующий элемент контроля', () => {
    for (const task of ESSAYS) {
      const course = COURSES[task.courseId]
      expect(course, task.id).toBeDefined()
      expect(course!.assessments.some((a) => a.id === task.assessmentId), task.id).toBe(true)
    }
  })

  it('дедлайны эссе попадают внутрь модуля', () => {
    for (const task of ESSAYS) {
      expect(task.dueDay, task.id).toBeGreaterThan(0)
      expect(task.dueDay, task.id).toBeLessThan(42)
    }
  })

  it('конфигурация собрана целиком', () => {
    expect(STUDY_CONFIG.courses).toBe(COURSES)
    expect(STUDY_CONFIG.schedule).toBe(SCHEDULE)
    expect(STUDY_CONFIG.essays).toBe(ESSAYS)
  })
})

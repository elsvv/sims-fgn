import { describe, expect, it } from 'vitest'
import { COURSES } from '../study/courses'
import { TEACHERS } from './teachers'

describe('преподаватели', () => {
  it('в игре шестеро', () => {
    expect(Object.keys(TEACHERS).length).toBe(6)
  })

  it('идентификатор совпадает с ключом каталога', () => {
    for (const [key, teacher] of Object.entries(TEACHERS)) {
      expect(teacher.id).toBe(key)
    }
  })

  it('все шестеро на месте', () => {
    for (const id of ['mikhailovsky', 'marey', 'pavlov', 'dolgorukov', 'alieva', 'krechetova']) {
      expect(TEACHERS[id], id).toBeDefined()
    }
  })

  it('у каждого есть имя с отчеством', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(teacher.name.split(' ').length, teacher.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('фамилия для плашки — часть полного имени', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(teacher.name.startsWith(teacher.short), teacher.id).toBe(true)
    }
  })

  it('позиция на шкале традиций в допустимых пределах', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(teacher.factionPosition, teacher.id).toBeGreaterThanOrEqual(-100)
      expect(teacher.factionPosition, teacher.id).toBeLessThanOrEqual(100)
      expect(teacher.factionTolerance, teacher.id).toBeGreaterThan(0)
    }
  })

  it('преподаватели занимают разные позиции — иначе шкала бессмысленна', () => {
    const positions = Object.values(TEACHERS).map((t) => t.factionPosition)
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(80)
  })

  it('ни у кого нет одинаковой позиции на шкале', () => {
    const positions = Object.values(TEACHERS).map((t) => t.factionPosition)
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('оба полюса шкалы заняты', () => {
    const positions = Object.values(TEACHERS).map((t) => t.factionPosition)
    expect(Math.min(...positions)).toBeLessThan(-50)
    expect(Math.max(...positions)).toBeGreaterThan(50)
  })

  it('каждый курс с преподавателем-персонажем закреплён за ним', () => {
    for (const course of Object.values(COURSES)) {
      const teacher = TEACHERS[course.teacherId]
      expect(teacher, `курс ${course.id} ссылается на ${course.teacherId}`).toBeDefined()
      expect(teacher!.courseIds, teacher!.id).toContain(course.id)
    }
  })

  it('преподаватель не ведёт несуществующий курс', () => {
    for (const teacher of Object.values(TEACHERS)) {
      for (const courseId of teacher.courseIds) {
        expect(COURSES[courseId], `${teacher.id} ведёт ${courseId}`).toBeDefined()
      }
    }
  })

  it('у каждого заполнены все наборы реплик', () => {
    for (const teacher of Object.values(TEACHERS)) {
      const { greeting, praise, rebuke, lateArrival, examPass, examFail } = teacher.lines
      for (const [name, lines] of Object.entries({
        greeting,
        praise,
        rebuke,
        lateArrival,
        examPass,
        examFail,
      })) {
        expect(lines.length, `${teacher.id}.${name}`).toBeGreaterThan(0)
        for (const line of lines) {
          expect(line.trim().length, `${teacher.id}.${name}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('в каждом наборе не меньше двух реплик — иначе персонаж заедает', () => {
    for (const teacher of Object.values(TEACHERS)) {
      for (const [name, lines] of Object.entries(teacher.lines)) {
        expect(lines.length, `${teacher.id}.${name}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('реплики не повторяются дословно у разных преподавателей', () => {
    const seen = new Map<string, string>()
    for (const teacher of Object.values(TEACHERS)) {
      for (const line of Object.values(teacher.lines).flat()) {
        const owner = seen.get(line)
        expect(owner, `«${line}» есть и у ${owner}, и у ${teacher.id}`).toBeUndefined()
        seen.set(line, teacher.id)
      }
    }
  })

  it('в репликах нет служебных пометок — они живут в комментариях', () => {
    for (const teacher of Object.values(TEACHERS)) {
      for (const line of Object.values(teacher.lines).flat()) {
        expect(line, teacher.id).not.toMatch(/\[[^\]]*\]/)
        expect(line, teacher.id).not.toMatch(/допущение|источник|research\//i)
      }
    }
  })

  it('реплики — законченные фразы, а не заготовки', () => {
    for (const teacher of Object.values(TEACHERS)) {
      for (const line of Object.values(teacher.lines).flat()) {
        expect(line.trim(), teacher.id).toBe(line)
        expect(line.length, `${teacher.id}: «${line}»`).toBeGreaterThan(10)
        expect(line, `${teacher.id}: «${line}»`).toMatch(/[.!?:)…»]$/)
      }
    }
  })
})

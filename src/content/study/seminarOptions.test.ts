import { describe, expect, it } from 'vitest'
import { isSkillId, SKILL_IDS, type SkillId } from '../../sim/player/Skills'
import { MAX_GRADE, PASSING_GRADE } from '../../sim/study/Course'
import { periodOf } from '../../sim/study/Schedule'
import {
  isUnconditionalOption,
  validateSeminarOptions,
  SEMINAR_FAILURE_MOODLET,
  SEMINAR_SUCCESS_MOODLET,
} from '../../sim/study/Seminar'
import { StudyState } from '../../sim/study/StudyState'
import type { GridPos } from '../../sim/types'
import { World } from '../../sim/World'
import { DIALOGUE_NODES } from '../dialogue/nodes'
import { FLOOR_A2 } from '../floors/floorA2'
import { MOODLETS } from '../moodlets'
import { TEACHER_NPCS } from '../people/npcs'
import { TEACHERS } from '../people/teachers'
import { PROP_CATALOG } from '../props/propCatalog'
import { COURSES, SCHEDULE, STUDY_CONFIG } from './courses'
import { SEMINAR_OPTIONS } from './seminarOptions'

describe('способы выступить на семинаре', () => {
  it('проходят проверку данных', () => {
    expect(validateSeminarOptions(SEMINAR_OPTIONS)).toEqual([])
  })

  it('их не меньше четырёх — иначе выбирать не из чего', () => {
    expect(SEMINAR_OPTIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('идентификаторы не повторяются', () => {
    const ids = SEMINAR_OPTIONS.map((option) => option.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('первокурснику с нулевыми навыками есть чем открыть рот', () => {
    const free = SEMINAR_OPTIONS.filter(isUnconditionalOption)
    expect(free.length).toBeGreaterThanOrEqual(2)
  })

  it('способы держатся на разных навыках', () => {
    const used = new Set(SEMINAR_OPTIONS.flatMap((option) => option.skills))
    expect(used.size).toBeGreaterThanOrEqual(3)
  })

  it('все упомянутые навыки существуют', () => {
    for (const option of SEMINAR_OPTIONS) {
      for (const id of option.skills as readonly string[]) {
        expect(isSkillId(id), `${option.id}: ${id}`).toBe(true)
      }
      const required = option.requires?.skillId
      if (required !== undefined) {
        expect(isSkillId(required), `${option.id}: ${required}`).toBe(true)
      }
    }
  })

  it('требования выполнимы: порог внутри шкалы навыков', () => {
    for (const option of SEMINAR_OPTIONS) {
      const min = option.requires?.skillMin
      if (min === undefined) continue
      expect(min, option.id).toBeGreaterThan(0)
      expect(min, option.id).toBeLessThanOrEqual(10)
    }
  })

  it('способ, который что-то требует, держится ровно на том, что требует', () => {
    for (const option of SEMINAR_OPTIONS) {
      const required = option.requires?.skillId
      if (required === undefined) continue
      expect(option.skills as readonly string[], option.id).toContain(required)
    }
  })

  it('есть осторожный способ: не проваливается, но и не взлетает', () => {
    const safe = SEMINAR_OPTIONS.filter(
      (option) => option.floor >= PASSING_GRADE - 1 && option.ceiling < MAX_GRADE,
    )
    expect(safe.length).toBeGreaterThanOrEqual(1)
  })

  it('есть рискованный способ: вся шкала целиком', () => {
    const risky = SEMINAR_OPTIONS.filter(
      (option) => option.floor === 0 && option.ceiling === MAX_GRADE,
    )
    expect(risky.length).toBeGreaterThanOrEqual(1)
  })

  it('десятку дают не за всякое выступление', () => {
    const topped = SEMINAR_OPTIONS.filter((option) => option.ceiling >= MAX_GRADE)
    expect(topped.length).toBeLessThan(SEMINAR_OPTIONS.length)
    for (const option of topped) {
      expect(option.requires, option.id).toBeDefined()
    }
  })

  it('чем выше потолок, тем ниже пол: за риск платят', () => {
    for (const option of SEMINAR_OPTIONS) {
      if (option.ceiling < MAX_GRADE) continue
      expect(option.floor, option.id).toBeLessThan(PASSING_GRADE)
    }
  })

  it('шкалу традиций двигают в обе стороны', () => {
    const shifts = SEMINAR_OPTIONS.map((option) => option.factionShift)
    expect(shifts.some((shift) => shift > 0)).toBe(true)
    expect(shifts.some((shift) => shift < 0)).toBe(true)
  })

  it('сдвиги не двигают игрока рывками', () => {
    for (const option of SEMINAR_OPTIONS) {
      expect(Math.abs(option.factionShift), option.id).toBeLessThanOrEqual(12)
    }
  })

  it('есть способ, у которого направление считается от преподавателя', () => {
    expect(SEMINAR_OPTIONS.some((option) => option.opposeTeacher === true)).toBe(true)
  })

  it('есть способ, который по шкале не двигает вовсе', () => {
    expect(SEMINAR_OPTIONS.some((option) => option.factionShift === 0)).toBe(true)
  })

  it('подписи и пояснения — законченные русские фразы', () => {
    for (const option of SEMINAR_OPTIONS) {
      for (const line of [option.label, option.hint]) {
        expect(line.trim(), option.id).toBe(line)
        expect(line.length, `${option.id}: «${line}»`).toBeGreaterThan(10)
        expect(line, option.id).toMatch(/[А-Яа-яЁё]/)
        expect(line[0], option.id).toBe(line[0]?.toUpperCase())
      }
      // Пояснение — это ставка, а не название: оно кончается точкой.
      expect(option.hint, option.id).toMatch(/[.!?…]$/)
    }
  })

  it('в подписях нет служебных пометок — они живут в комментариях', () => {
    for (const option of SEMINAR_OPTIONS) {
      for (const line of [option.label, option.hint]) {
        expect(line, option.id).not.toMatch(/\[[^\]]*\]/)
        expect(line, option.id).not.toMatch(/допущение|источник|research\//i)
      }
    }
  })

  it('подписи не повторяются', () => {
    const labels = SEMINAR_OPTIONS.map((option) => option.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('каждый навык, кроме выносливости, хоть где-то отвечает за выступление', () => {
    // Выносливость качается через страдание, а не через слово, — она здесь
    // только подпоркой к спору. Всем остальным навыкам семинар должен
    // давать применение, иначе половина шкалы навыков ни на что не влияет.
    const used = new Set<SkillId>(SEMINAR_OPTIONS.flatMap((option) => option.skills))
    for (const id of SKILL_IDS) {
      if (id === 'endurance' || id === 'eloquence') continue
      expect(used.has(id), id).toBe(true)
    }
  })

  it('модификаторы настроения, которых ждёт механика, есть в каталоге', () => {
    expect(MOODLETS[SEMINAR_SUCCESS_MOODLET], SEMINAR_SUCCESS_MOODLET).toBeDefined()
    expect(MOODLETS[SEMINAR_FAILURE_MOODLET], SEMINAR_FAILURE_MOODLET).toBeDefined()
    expect(MOODLETS[SEMINAR_SUCCESS_MOODLET]!.mood).toBeGreaterThan(0)
    expect(MOODLETS[SEMINAR_FAILURE_MOODLET]!.mood).toBeLessThan(0)
  })
})

/* ------------------------------------------------------------------ */
/* Семинар в собранной игре                                            */
/* ------------------------------------------------------------------ */

/** Место в А-204 на настоящем этаже: не в стене, не в парте, не в дверях. */
const DESK_IN_A204: GridPos = { col: 7, row: 4 }

/** Понедельник, первая пара — греческий у Алиевой в А-204. */
const GREEK_SEMINAR = SCHEDULE.find((lesson) => lesson.id === 'greek-mon')!

function makeGameWorld(): World {
  return new World(
    FLOOR_A2,
    DESK_IN_A204,
    PROP_CATALOG,
    new StudyState(STUDY_CONFIG),
    MOODLETS,
    TEACHER_NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUE_NODES },
  )
}

/** Досиживает до середины первой пары. */
function runToSeminar(world: World): void {
  const start = periodOf(GREEK_SEMINAR.period)!.startMinutes
  world.clock.speed = 3
  for (let i = 0; i < 20000 && world.clock.time.minutes < start + 5; i++) world.tick(0.25)
}

describe('семинар в собранной игре', () => {
  it('в расписании есть семинары, а не одни лекции', () => {
    expect(SCHEDULE.filter((lesson) => lesson.kind === 'seminar').length).toBeGreaterThan(0)
  })

  it('у каждой дисциплины объявлены навыки, на которых она держится', () => {
    for (const course of Object.values(COURSES)) {
      expect(course.skillIds?.length, course.title).toBeGreaterThan(0)
      for (const id of (course.skillIds ?? []) as readonly string[]) {
        expect(isSkillId(id), `${course.id}: ${id}`).toBe(true)
      }
    }
  })

  it('способы выступить собраны в конфигурацию учёбы', () => {
    expect(STUDY_CONFIG.seminarOptions).toBe(SEMINAR_OPTIONS)
  })

  it('у каждого семинара в расписании есть преподаватель с репликами', () => {
    for (const lesson of SCHEDULE.filter((item) => item.kind === 'seminar')) {
      const teacher = TEACHERS[COURSES[lesson.courseId]!.teacherId]
      expect(teacher, lesson.id).toBeDefined()
      expect(teacher!.lines.praise.length, lesson.id).toBeGreaterThan(0)
      expect(teacher!.lines.rebuke.length, lesson.id).toBeGreaterThan(0)
    }
  })

  it('студент, досидевший до пары в А-204, видит панель выступления', () => {
    const world = makeGameWorld()
    expect(world.currentRoom).toBe('А-204')

    runToSeminar(world)
    const snapshot = world.snapshot()
    expect(snapshot.currentRoom).toBe('А-204')
    expect(snapshot.canSpeakAtSeminar).toBe(true)
    expect(snapshot.seminar?.courseId).toBe('greek')
    expect(snapshot.seminar?.teacherId).toBe('alieva')
    expect(snapshot.seminar?.options.length).toBeGreaterThan(0)
  })

  it('и Алиева отвечает ему своими словами', () => {
    const world = makeGameWorld()
    runToSeminar(world)

    const outcome = world.commandSpeakAtSeminar('retell')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const lines = outcome.speech.success
      ? TEACHERS.alieva!.lines.praise
      : TEACHERS.alieva!.lines.rebuke
    expect(lines).toContain(outcome.speech.reply)
    expect(world.study?.gradebook.gradeFor('greek', 'classwork')).toBe(outcome.speech.grade)
  })
})

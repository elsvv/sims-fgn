import { describe, expect, it } from 'vitest'
import { stopActor } from '../../sim/actor/Actor'
import { createSkills } from '../../sim/player/Skills'
import { lessonsOnDay, occurrenceId, periodOf, type Lesson } from '../../sim/study/Schedule'
import { StudyState } from '../../sim/study/StudyState'
import { MINUTES_PER_DAY } from '../../sim/time/GameClock'
import { World } from '../../sim/World'
import { SLEEP_SPOTS } from '../daily/sleepSpots'
import { WEEKEND_OPTIONS } from '../daily/weekendOptions'
import { DIALOGUE_CHAINS } from '../dialogue/chains'
import { DIALOGUE_NODES } from '../dialogue/nodes'
import { EPILOGUE_ENDINGS } from '../epilogue/endings'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../floors/floorA2'
import { MOODLETS } from '../moodlets'
import { TEACHER_NPCS } from '../people/npcs'
import { TEACHERS } from '../people/teachers'
import { PROP_CATALOG } from '../props/propCatalog'
import { COHORT_GPA } from './cohort'
import { STUDY_CONFIG } from './courses'

/**
 * Настоящее расписание на настоящем этаже, прожитое миром.
 *
 * Проверки в courses.test.ts читают данные, а этот файл их играет:
 * каталог может быть безупречен на бумаге и всё равно не работать, если
 * до аудитории нельзя дойти, отметка не встаёт или пара идёт не в ту
 * минуту, в которую написано. Пункты 3 и 4 списка проблем нашлись именно
 * так — живой игрой, а не чтением данных.
 */
function createWorld(): World {
  return new World(
    FLOOR_A2,
    FLOOR_A2_SPAWN,
    PROP_CATALOG,
    new StudyState(STUDY_CONFIG),
    MOODLETS,
    TEACHER_NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUE_NODES, chains: DIALOGUE_CHAINS },
    {
      sleepSpots: SLEEP_SPOTS,
      weekendOptions: WEEKEND_OPTIONS,
      epilogueRules: EPILOGUE_ENDINGS,
      cohort: COHORT_GPA,
    },
  )
}

/** Клетка внутри аудитории: свободное место у окна, не занятое партами. */
const SEAT: Record<string, { col: number; row: number }> = {
  'А-204': { col: 1, row: 2 },
  'А-206': { col: 15, row: 2 },
}

/**
 * Сажает игрока на место в аудитории.
 *
 * Дорогу по коридору проверяет навигация, а здесь проверяется расписание:
 * пешком по этажу студент ходит быстрее, чем идут игровые минуты только
 * в одну сторону, и гонять его через всю карту ради каждой пары значило бы
 * мерить не то.
 */
function sit(world: World, room: string): void {
  const cell = SEAT[room]
  expect(cell, `для ${room} не задано место`).toBeDefined()
  world.player.position = { x: cell!.col + 0.5, z: cell!.row + 0.5 }
  stopActor(world.player)
  expect(world.currentRoom).toBe(room)
}

function runTo(world: World, day: number, minutes: number): void {
  world.clock.speed = 3
  const target = day * MINUTES_PER_DAY + minutes
  for (let i = 0; i < 400000 && world.clock.totalMinutes < target; i++) {
    world.tick(0.25)
    world.dismissDaySummary()
    if (world.weekendPending) world.chooseWeekendOption(WEEKEND_OPTIONS[0]!.id)
    world.dismissWeekendReport()
  }
  expect(world.clock.totalMinutes).toBeGreaterThanOrEqual(target)
}

function startOf(lesson: Lesson): number {
  const period = periodOf(lesson.period)
  expect(period, lesson.id).toBeDefined()
  return period!.startMinutes
}

/** Все пары первой учебной недели по дням, в порядке звонков. */
const WEEK: { day: number; lesson: Lesson }[] = [0, 1, 2, 3, 4, 5].flatMap((day) =>
  lessonsOnDay(STUDY_CONFIG.schedule, day).map((lesson) => ({ day, lesson })),
)

describe('неделя по настоящему расписанию', () => {
  it('на каждую пару можно прийти вовремя и получить отметку', () => {
    const world = createWorld()

    for (const { day, lesson } of WEEK) {
      runTo(world, day, startOf(lesson) - 10)
      sit(world, lesson.room)
      runTo(world, day, startOf(lesson) + 5)

      expect(world.snapshot().currentLesson?.courseId, lesson.id).toBe(lesson.courseId)
      expect(world.study?.attendance.markFor(occurrenceId(day, lesson.id)), lesson.id).toBe(
        'present',
      )
    }
  })

  it('на каждом семинаре недели дают слово, и ровно один раз', () => {
    const world = createWorld()
    world.skills = createSkills({ ancientLanguages: 6, logic: 6, germanClassics: 6 })
    const seminars = WEEK.filter(({ lesson }) => lesson.kind === 'seminar')
    expect(seminars.length).toBeGreaterThanOrEqual(6)

    for (const { day, lesson } of seminars) {
      runTo(world, day, startOf(lesson) - 10)
      sit(world, lesson.room)
      runTo(world, day, startOf(lesson) + 5)

      const first = world.commandSpeakAtSeminar('retell')
      expect(first.ok, `${lesson.id}: ${first.ok ? '' : first.reason}`).toBe(true)
      expect(world.commandSpeakAtSeminar('retell')).toEqual({
        ok: false,
        reason: 'Вы уже выступали — слово дают раз за пару',
      })
      world.dismissSeminarSpeech()
    }

    // Каждое проведение записано отдельно: слово не отняли ни на одном.
    expect(world.study?.spokenCount).toBe(seminars.length)
  })

  it('на лекции панель остаётся и объясняет, почему выступать не с чем', () => {
    const world = createWorld()
    const lecture = WEEK.find(({ lesson }) => lesson.kind === 'lecture')
    expect(lecture).toBeDefined()

    runTo(world, lecture!.day, startOf(lecture!.lesson) - 10)
    sit(world, lecture!.lesson.room)
    runTo(world, lecture!.day, startOf(lecture!.lesson) + 5)

    const seminar = world.snapshot().seminar
    expect(seminar?.kind).toBe('lecture')
    expect(seminar?.canSpeak).toBe(false)
    expect(seminar?.reason).toContain('лекция')
  })

  it('в каждом дне есть окно, в котором пар нет больше часа', () => {
    for (const day of [0, 1, 2, 3, 4, 5]) {
      const world = createWorld()
      const lessons = lessonsOnDay(STUDY_CONFIG.schedule, day)
      expect(lessons.length, `день ${day}`).toBeGreaterThanOrEqual(3)

      // Мир согласен с данными: между парами он не считает, что пара идёт.
      const gaps = lessons.slice(1).map((lesson, index) => {
        const previous = lessons[index]!
        const previousEnd = periodOf(previous.period)!.endMinutes
        return { from: previousEnd, to: startOf(lesson) }
      })
      const window = gaps.find((gap) => gap.to - gap.from >= 60)
      expect(window, `день ${day}`).toBeDefined()

      runTo(world, day, window!.from + 15)
      expect(world.snapshot().currentLesson, `день ${day}`).toBeNull()
      expect(world.snapshot().nextLesson, `день ${day}`).not.toBeNull()
    }
  })
})

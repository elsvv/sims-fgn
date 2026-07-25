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

/**
 * Окно, прожитое миром.
 *
 * Пункт 4 списка проблем состоит из двух половин, и вторая — вот эта:
 * «между ними и после них заняться нечем». Расписание может быть каким
 * угодно плотным, но если полтора часа между парами нечем занять, день
 * всё равно проматывается сном. Проверки каталога (props/propCatalog.test.ts)
 * читают данные; здесь игрок идёт по настоящему этажу к настоящим
 * предметам и укладывается в настоящее окно.
 */
function finishInteraction(world: World, propId: string, interactionId: string): void {
  const what = `${propId}.${interactionId}`
  expect(world.commandInteract(propId, interactionId), what).toBe(true)
  world.clock.speed = 3
  for (let i = 0; i < 40000 && world.activeInteraction !== null; i++) {
    world.tick(0.25)
    world.dismissDaySummary()
  }
  expect(world.activeInteraction, what).toBeNull()
}

/** Понедельничное окно: между второй парой и третьей, с 11:50 до 13:50. */
const MONDAY_WINDOW_START = 11 * 60 + 55

describe('окно между парами — ресурс, а не пустота', () => {
  it('в окне можно поесть, поговорить и умыться, и всё это в него влезает', () => {
    const world = createWorld()
    runTo(world, 0, MONDAY_WINDOW_START)
    expect(world.snapshot().currentLesson).toBeNull()
    world.applyNeeds({ hunger: -70, social: -70, hygiene: -70 })

    const hungry = world.needs.hunger
    finishInteraction(world, 'vending-1', 'vendingLunch')
    expect(world.needs.hunger).toBeGreaterThan(hungry + 30)

    const lonely = world.needs.social
    finishInteraction(world, 'bench-1', 'chatWithClassmates')
    expect(world.needs.social).toBeGreaterThan(lonely + 20)

    const grubby = world.needs.hygiene
    finishInteraction(world, 'toilet-1', 'washUp')
    expect(world.needs.hygiene).toBeGreaterThan(grubby + 20)

    // Всё это вместе с дорогой уместилось в окно: третья пара ещё впереди.
    expect(world.snapshot().currentLesson).toBeNull()
    expect(world.snapshot().nextLesson).not.toBeNull()
  })

  it('час за партой в пустой аудитории уходит в эссе и в письмо', () => {
    const world = createWorld()
    runTo(world, 0, MONDAY_WINDOW_START)
    const task = world.study?.pendingEssays(0)[0]
    expect(task, 'к первому дню не назначено ни одного эссе').toBeDefined()

    finishInteraction(world, 'a204-desk-1', 'writeEssay')

    expect(world.skills.academicWriting).toBeGreaterThan(0)
    expect(world.study?.essays.progressFor(task!.id)?.effort).toBe(60)
    expect(world.snapshot().activeMoodlets.map((m) => m.label)).toContain(
      'Эссе сдвинулось с мёртвой точки',
    )
  })
})

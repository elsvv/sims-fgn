import { describe, expect, it } from 'vitest'
import { COLLAPSE_MOODLET, type SleepSpotCatalog } from './daily/Sleep'
import type { WeekendOption } from './daily/Weekend'
import type { EpilogueRule } from './epilogue/Epilogue'
import type { MoodletCatalog } from './needs/Moodlets'
import type { NpcSpec } from './npc/Npc'
import type { TeacherCatalog } from './social/Teacher'
import type { CourseCatalog } from './study/Course'
import type { EssayTask } from './study/Essay'
import { PERIODS, occurrenceId, type Schedule } from './study/Schedule'
import { StudyState } from './study/StudyState'
import { MINUTES_PER_DAY } from './time/GameClock'
import { World } from './World'
import type { FloorPlan } from './world/FloorPlan'
import type { PropCatalog } from './world/PropDefinition'

/**
 * Суточный цикл целиком: сон, итоги дня, воскресенье, эпилог.
 *
 * Отдельным файлом от World.test.ts нарочно: здесь проверяется не отдельное
 * действие, а то, как игра кончает день и как кончается модуль, — и обвязка
 * для этого нужна своя, с местом для сна, выходными и концовками.
 */

const PLAN: FloorPlan = {
  id: 'daily',
  name: 'Этаж с сутками',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['....#....', '....#....', '.........'],
  props: [{ id: 'bench-1', kind: 'bench', col: 8, row: 2, rotation: 0, blocks: true }],
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 0, row0: 0, col1: 3, row1: 1 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 5, row0: 0, col1: 8, row1: 1 },
    { id: 'коридор', name: 'Коридор', col0: 0, row0: 2, col1: 8, row1: 2 },
  ],
}

const CATALOG: PropCatalog = {
  bench: {
    kind: 'bench',
    label: 'Скамейка',
    size: { w: 0.9, d: 0.5, h: 0.45 },
    color: '#8a6f4d',
    blocks: true,
    interactions: [],
  },
}

const SLEEP_SPOTS: SleepSpotCatalog = {
  bench: {
    id: 'bench',
    propKind: 'bench',
    label: 'Скамейка в коридоре',
    where: 'на скамейке в коридоре',
    actionLabel: 'Лечь спать прямо здесь',
    energyQuality: 0.35,
    stressRelief: 0.2,
    moodletId: 'sleptOnABench',
    afterword: 'Спина это запомнит.',
    forced: false,
  },
}

const MOODLETS: MoodletCatalog = {
  sleptOnABench: {
    id: 'sleptOnABench',
    label: 'Ночевал на скамейке',
    mood: -30,
    durationMinutes: 480,
  },
  [COLLAPSE_MOODLET]: {
    id: COLLAPSE_MOODLET,
    label: 'Отрубился где стоял',
    mood: -45,
    durationMinutes: 600,
  },
  wineAtSymposy: {
    id: 'wineAtSymposy',
    label: 'Пил вино на Арме',
    mood: 26,
    durationMinutes: 600,
  },
}

const COURSES: CourseCatalog = {
  greek: {
    id: 'greek',
    title: 'Древнегреческий язык',
    short: 'Греческий',
    teacherId: 'alieva',
    assessments: [
      { id: 'classwork', label: 'Работа на занятиях', weight: 1, kind: 'seminar', blocking: false },
    ],
  },
  logic: {
    id: 'logic',
    title: 'Логика',
    short: 'Логика',
    teacherId: 'dolgorukov',
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.6, kind: 'seminar', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },
}

/** Греческий первой парой, логика третьей: между ними целый день. */
const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'logic-mon', courseId: 'logic', kind: 'seminar', weekday: 0, period: 4, room: 'А-206' },
]

const ESSAYS: EssayTask[] = [
  {
    id: 'greek-essay',
    courseId: 'greek',
    assessmentId: 'classwork',
    title: 'Эссе по греческому',
    dueDay: 40,
    requiredEffort: 600,
  },
]

const TEACHERS: TeacherCatalog = {
  alieva: {
    id: 'alieva',
    short: 'Алиева',
    name: 'Алиева Ольга Валерьевна',
    courseIds: ['greek'],
    factionPosition: -10,
    factionTolerance: 90,
    lines: {
      greeting: [],
      praise: [],
      rebuke: [],
      lateArrival: [],
      examPass: [],
      examFail: [],
    },
  },
}

const NPCS: NpcSpec[] = [
  { id: 'teacher-alieva', teacherId: 'alieva', courseIds: ['greek'], homeRoom: 'коридор' },
]

const WEEKEND_OPTIONS: readonly WeekendOption[] = [
  {
    id: 'sleep',
    title: 'Отсыпаться',
    description: 'Проспать до трёх часов дня.',
    needDelta: { energy: 55, social: -25 },
    outcome: 'Вы проснулись в третьем часу дня и снова заснули.',
  },
  {
    id: 'read',
    title: 'Читать',
    description: 'Просидеть день с текстом.',
    needDelta: { social: -30 },
    skills: [{ id: 'germanClassics', amount: 0.9 }],
    factionShift: 6,
    outcome: 'К вечеру вы прочли тридцать страниц.',
  },
  {
    id: 'essay',
    title: 'Работать над эссе',
    description: 'Сесть за текст с утра.',
    needDelta: { stress: 20 },
    essayMinutes: 300,
    outcome: 'Пять часов за текстом.',
  },
  {
    id: 'bar',
    title: 'Пойти в бар',
    description: 'Арма, «Symposy».',
    needDelta: { fun: 45, social: 40 },
    moodletId: 'wineAtSymposy',
    outcome: 'Бар называется «Пир», и весь вечер об этом напоминали.',
  },
]

const ENDINGS: readonly EpilogueRule[] = [
  {
    id: 'silent',
    title: 'Просидел модуль молча',
    story: 'Вы не подняли руку ни разу.',
    priority: 88,
    when: { seminars: { max: 0 } },
  },
  {
    id: 'survivor',
    title: 'Дожил до конца модуля',
    story: 'Шесть недель кончились.',
    priority: 0,
    when: {},
  },
]

const COHORT = [9, 8, 7, 6, 5, 4, 3, 2]

const NEXT_TO_BENCH = { col: 7, row: 2 }
const IN_CLASS = { col: 1, row: 0 }

function makeWorld(spawn = NEXT_TO_BENCH): World {
  const study = new StudyState({ courses: COURSES, schedule: SCHEDULE, essays: ESSAYS })
  return new World(
    PLAN,
    spawn,
    CATALOG,
    study,
    MOODLETS,
    NPCS,
    { teachers: TEACHERS, dialogues: {} },
    {
      sleepSpots: SLEEP_SPOTS,
      weekendOptions: WEEKEND_OPTIONS,
      epilogueRules: ENDINGS,
      cohort: COHORT,
    },
  )
}

/** Прокручивает время, не трогая экраны: игрок ещё ничего не нажал. */
function run(world: World, ticks: number): void {
  world.clock.speed = 3
  for (let i = 0; i < ticks; i++) world.tick(0.25)
}

/** Доводит мир до указанной минуты того же дня. */
function runUntil(world: World, minutes: number): void {
  world.clock.speed = 3
  for (let i = 0; i < 20000 && world.clock.time.minutes < minutes; i++) world.tick(0.25)
}

/** Укладывает игрока спать и доводит действие до конца. */
function sleepOnBench(world: World): void {
  expect(world.commandSleep('bench-1')).toBe(true)
  run(world, 40)
}

describe('World: лечь спать', () => {
  it('на скамейке спать можно, а на пустом месте — нет', () => {
    const world = makeWorld()
    expect(world.sleepSpotFor('bench-1')?.id).toBe('bench')
    expect(world.sleepSpotFor('нет-такого')).toBeNull()
    expect(world.commandSleep('нет-такого')).toBe(false)
  })

  it('в мире без мест для сна лечь негде', () => {
    const study = new StudyState({ courses: COURSES, schedule: SCHEDULE, essays: [] })
    const world = new World(PLAN, NEXT_TO_BENCH, CATALOG, study)
    expect(world.commandSleep('bench-1')).toBe(false)
  })

  it('переводит время на семь утра следующего дня', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    expect(world.clock.time.day).toBe(1)
    expect(world.clock.time.minutes).toBeCloseTo(7 * 60, 0)
  })

  it('восстанавливает энергию', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    const before = world.needs.energy
    sleepOnBench(world)
    expect(world.needs.energy).toBeGreaterThan(before)
  })

  it('гигиену сон не поднимает', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    const before = world.needs.hygiene
    sleepOnBench(world)
    expect(world.needs.hygiene).toBeLessThan(before)
  })

  it('вешает модификатор места, и он живёт с утра, а не со вчера', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    expect(world.snapshot().activeMoodlets.map((m) => m.id)).toContain('sleptOnABench')
  })

  it('показывает итоги дня и останавливает время', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    sleepOnBench(world)

    const screen = world.snapshot().dayScreen
    expect(screen?.kind).toBe('summary')
    expect(screen?.summary?.title).toBe('Неделя 1, понедельник')

    const frozen = world.clock.totalMinutes
    run(world, 50)
    expect(world.clock.totalMinutes).toBe(frozen)
  })

  it('после «Дальше» мир снова идёт', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    world.dismissDaySummary()

    expect(world.snapshot().dayScreen).toBeNull()
    const before = world.clock.totalMinutes
    run(world, 10)
    expect(world.clock.totalMinutes).toBeGreaterThan(before)
  })

  it('закрывает посещаемость прожитого дня: уснувший днём пропустил вечерние пары', () => {
    const world = makeWorld()
    // Ложимся до третьей пары — на неё уже не попасть ни при каких условиях.
    runUntil(world, PERIODS[1]!.startMinutes)
    sleepOnBench(world)

    const study = world.study
    expect(study?.attendance.markFor(occurrenceId(0, 'logic-mon'))).toBe('absent')
  })
})

describe('World: принудительный сон', () => {
  it('после двух ночи персонаж вырубается где стоял', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    // Дальше — через полночь. Игрок ничего не нажимает.
    for (let i = 0; i < 20000 && world.snapshot().dayScreen === null; i++) world.tick(0.25)

    expect(world.clock.time.day).toBe(1)
    expect(world.clock.time.minutes).toBeCloseTo(7 * 60, 0)
    expect(world.snapshot().activeMoodlets.map((m) => m.id)).toContain(COLLAPSE_MOODLET)
  })

  it('восстанавливает хуже, чем сон на скамейке', () => {
    const collapsed = makeWorld()
    runUntil(collapsed, 23 * 60)
    for (let i = 0; i < 20000 && collapsed.snapshot().dayScreen === null; i++) {
      collapsed.tick(0.25)
    }

    const rested = makeWorld()
    runUntil(rested, 23 * 60)
    sleepOnBench(rested)

    // Отрубившийся спал пять часов вместо восьми, и хуже: разница обязана
    // быть заметной, иначе штраф за ночь на ногах ничего не значит.
    expect(collapsed.needs.energy).toBeLessThan(rested.needs.energy)
  })

  it('рассказывает об этом словами, а не одним модификатором', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    for (let i = 0; i < 20000 && world.snapshot().dayScreen === null; i++) world.tick(0.25)

    const story = world.daySummary?.paragraphs.join(' ') ?? ''
    expect(story).toContain('отключились там, где стояли')
  })

  it('обрывает начатый разговор и незаконченное действие', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    for (let i = 0; i < 20000 && world.snapshot().dayScreen === null; i++) world.tick(0.25)

    expect(world.activeInteraction).toBeNull()
    expect(world.activeDialogue).toBeNull()
    expect(world.activeChain).toBeNull()
  })
})

describe('World: подпись дня', () => {
  it('в учебную неделю называет неделю и день', () => {
    expect(makeWorld().snapshot().dayLabel).toBe('Неделя 1, понедельник')
  })

  it('в сессионную неделю называет сессию', () => {
    const world = makeWorld()
    world.clock.jump(43 * MINUTES_PER_DAY)
    expect(world.snapshot().dayLabel).toBe('Сессия, вторник')
  })

  it('за концом календаря не считает восьмую неделю', () => {
    const world = makeWorld()
    world.clock.jump(49 * MINUTES_PER_DAY)
    expect(world.snapshot().dayLabel).toBe('Модуль окончен')
  })
})

describe('World: сутки без учёбы', () => {
  it('мир без расписания тоже кончает день и не падает', () => {
    const world = new World(PLAN, NEXT_TO_BENCH, CATALOG, null, MOODLETS, [], undefined, {
      sleepSpots: SLEEP_SPOTS,
    })
    runUntil(world, 23 * 60)
    expect(world.commandSleep('bench-1')).toBe(true)
    run(world, 40)

    expect(world.clock.time.day).toBe(1)
    expect(world.daySummary?.paragraphs.join(' ')).toContain('Пар сегодня не было')
  })

  it('без концовок эпилог всё равно не оказывается пустым', () => {
    const world = new World(PLAN, NEXT_TO_BENCH, CATALOG, null, MOODLETS, [], undefined, {
      sleepSpots: SLEEP_SPOTS,
    })
    world.clock.jump(48 * MINUTES_PER_DAY + 16 * 60)
    runUntil(world, 23 * 60)
    world.commandSleep('bench-1')
    run(world, 40)
    world.dismissDaySummary()

    expect(world.epilogue?.title.length).toBeGreaterThan(0)
    expect(world.epilogue?.paragraphs.length).toBeGreaterThan(0)
  })
})

describe('World: итоги дня', () => {
  it('рассказывают о посещаемости прожитого дня', () => {
    const world = makeWorld(IN_CLASS)
    runUntil(world, PERIODS[0]!.startMinutes + 5)
    runUntil(world, 23 * 60)
    sleepOnBench(world)

    const story = world.daySummary?.paragraphs.join(' ') ?? ''
    expect(story).toContain('Без вас прошли: Логика')
  })

  it('сравнивают с утром, а не с началом модуля', () => {
    const world = makeWorld()
    world.trainSkill('logic', 2)
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    expect(world.daySummary?.paragraphs.join(' ')).toContain('«Логика»')

    world.dismissDaySummary()
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    // Вчерашний навык сегодня не растёт заново.
    expect(world.daySummary?.paragraphs.join(' ')).not.toContain('«Логика»')
  })
})

describe('World: воскресенье', () => {
  /** Доводит мир до утра воскресенья с открытой карточкой. */
  function worldAtSunday(): World {
    const world = makeWorld()
    // Суббота — шестой день модуля: 0 — понедельник, 5 — суббота.
    world.clock.jump(5 * MINUTES_PER_DAY + 16 * 60)
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    world.dismissDaySummary()
    return world
  }

  it('вместо воскресенья показывает карточку выбора', () => {
    const world = worldAtSunday()
    const screen = world.snapshot().dayScreen
    expect(screen?.kind).toBe('weekend')
    expect(screen?.weekendOptions).toHaveLength(4)
    expect(screen?.weekendOptions.map((o) => o.title)).toContain('Отсыпаться')
  })

  it('в будни карточки нет', () => {
    const world = makeWorld()
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    world.dismissDaySummary()
    expect(world.snapshot().dayScreen).toBeNull()
  })

  it('выбор применяет нужды, навыки и взгляды', () => {
    const world = worldAtSunday()
    const skillBefore = world.skills.germanClassics
    const factionBefore = world.faction

    expect(world.chooseWeekendOption('read')).not.toBeNull()
    expect(world.skills.germanClassics).toBeGreaterThan(skillBefore)
    expect(world.faction).toBeGreaterThan(factionBefore)
  })

  it('выбор вешает модификатор настроения', () => {
    const world = worldAtSunday()
    world.chooseWeekendOption('bar')
    expect(world.moodlets.has('wineAtSymposy')).toBe(true)
  })

  it('работа над эссе продвигает ближайшее несданное', () => {
    const world = worldAtSunday()
    world.chooseWeekendOption('essay')

    expect(world.study?.essays.progressFor('greek-essay')?.effort).toBe(300)
    expect(world.weekendReport?.notes.join(' ')).toContain('Эссе «Эссе по греческому» продвинулось')
  })

  it('показывает рассказ о выходном, а не сводку чисел', () => {
    const world = worldAtSunday()
    const report = world.chooseWeekendOption('sleep')
    expect(report?.outcome).toContain('в третьем часу дня')
    expect(world.snapshot().dayScreen?.weekendOptions).toEqual([])
  })

  it('несуществующий вариант ничего не меняет', () => {
    const world = worldAtSunday()
    expect(world.chooseWeekendOption('поехать-в-крым')).toBeNull()
    expect(world.weekendPending).toBe(true)
  })

  it('без открытой карточки выбирать нечего', () => {
    const world = makeWorld()
    expect(world.chooseWeekendOption('read')).toBeNull()
  })

  it('после карточки наступает понедельник', () => {
    const world = worldAtSunday()
    const sunday = world.clock.time.day
    world.chooseWeekendOption('read')
    world.dismissWeekendReport()

    expect(world.clock.time.day).toBe(sunday + 1)
    expect(world.clock.time.minutes).toBeCloseTo(7 * 60, 0)
    expect(world.snapshot().dayScreen).toBeNull()
  })
})

describe('World: эпилог', () => {
  /** Доводит мир до конца календаря. */
  function worldAtTheEnd(): World {
    const world = makeWorld()
    // 47-й день — суббота сессионной недели, последний отыгрываемый день.
    world.clock.jump(47 * MINUTES_PER_DAY + 16 * 60)
    runUntil(world, 23 * 60)
    sleepOnBench(world)
    world.dismissDaySummary()
    world.chooseWeekendOption('sleep')
    world.dismissWeekendReport()
    return world
  }

  it('на конце календаря показывает эпилог', () => {
    const world = worldAtTheEnd()
    const screen = world.snapshot().dayScreen
    expect(screen?.kind).toBe('epilogue')
    expect(screen?.epilogue?.title.length).toBeGreaterThan(0)
  })

  it('эпилог не кончается: дальше ничего нет', () => {
    const world = worldAtTheEnd()
    const frozen = world.clock.totalMinutes
    run(world, 100)
    expect(world.clock.totalMinutes).toBe(frozen)
    expect(world.snapshot().dayScreen?.kind).toBe('epilogue')
  })

  it('концовка выбирается по прожитому, а не наугад', () => {
    const world = worldAtTheEnd()
    // За модуль игрок не сказал ни слова — и концовка именно об этом.
    expect(world.epilogue?.endingId).toBe('silent')
  })

  it('несданный семинар честно стоит ноль и уходит в задолженность', () => {
    const facts = makeWorld().epilogueFacts()
    expect(facts.courses.find((c) => c.id === 'greek')?.grade).toBe(0)
    expect(facts.debts).toContain('Греческий')
  })

  it('непроведённый экзамен не считается несданным', () => {
    const world = makeWorld()
    world.study?.recordSeminar('logic', 8)
    // У логики экзамен весит 0.4, и его в игре пока нет: если бы он шёл
    // в формулу нулём, восьмёрка за семинары превратилась бы в пятёрку.
    expect(world.epilogueFacts().courses.find((c) => c.id === 'logic')?.grade).toBe(8)
  })

  it('считает место в рейтинге по потоку', () => {
    const world = makeWorld()
    world.study?.recordSeminar('greek', 8)
    world.study?.recordSeminar('logic', 8)

    const rating = world.epilogueFacts().rating
    expect(rating?.gpa).toBe(8)
    expect(rating?.place).toBe(2)
    expect(rating?.cohortSize).toBe(COHORT.length + 1)
  })

  it('без потока рейтинга нет, а эпилог всё равно есть', () => {
    const study = new StudyState({ courses: COURSES, schedule: SCHEDULE, essays: [] })
    const world = new World(PLAN, NEXT_TO_BENCH, CATALOG, study, MOODLETS, NPCS, {
      teachers: TEACHERS,
      dialogues: {},
    })
    expect(world.epilogueFacts().rating).toBeNull()
  })

  it('помнит отношения с каждым преподавателем', () => {
    const world = makeWorld()
    world.relationships.adjust('teacher-alieva', { respect: 30 })

    const person = world.epilogueFacts().people.find((p) => p.id === 'alieva')
    expect(person?.name).toBe('Алиева Ольга Валерьевна')
    expect(person?.respect).toBe(30)
    expect(person?.level).toBe('Знакомы')
  })

  it('копит стресс за модуль, а не берёт вечерний', () => {
    const world = makeWorld()
    runUntil(world, 12 * 60)
    // Стресс растёт весь день, поэтому средний за прожитое обязан быть
    // ниже текущего — иначе агрегат считается по последнему кадру.
    expect(world.averageStress).toBeLessThan(world.needs.stress)
    expect(world.averageStress).toBeGreaterThan(0)
  })

  it('считает посещаемость по всем дисциплинам сразу', () => {
    const world = makeWorld(IN_CLASS)
    runUntil(world, PERIODS[0]!.startMinutes + 5)
    runUntil(world, 23 * 60)
    sleepOnBench(world)

    const attendance = world.epilogueFacts().attendance
    expect(attendance.present).toBe(1)
    expect(attendance.absent).toBe(1)
  })
})

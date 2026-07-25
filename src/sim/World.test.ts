import { describe, expect, it } from 'vitest'
import { isMoving } from './actor/Actor'
import type { DialogueCatalog, DialogueNode } from './dialogue/Dialogue'
import type { MoodletCatalog } from './needs/Moodlets'
import { npcRoom, type NpcSpec } from './npc/Npc'
import { createSkills, SKILL_IDS } from './player/Skills'
import type { Teacher, TeacherCatalog } from './social/Teacher'
import type { AttendanceMark } from './study/Attendance'
import type { CourseCatalog } from './study/Course'
import { roundGrade } from './study/Gradebook'
import { occurrenceId, PERIODS, type Schedule } from './study/Schedule'
import type { SeminarOption } from './study/Seminar'
import { StudyState } from './study/StudyState'
import { World } from './World'
import type { FloorPlan } from './world/FloorPlan'
import type { PropCatalog } from './world/PropDefinition'

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Тест',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['.....', '.....', '.....'],
  props: [
    { id: 'coffee-1', kind: 'coffeeMachine', col: 4, row: 1, rotation: 0, blocks: true },
  ],
  rooms: [],
}

const CATALOG: PropCatalog = {
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28, bladder: -12 },
      },
    ],
  },
}

function makeWorld(): World {
  return new World(PLAN, { col: 0, row: 0 }, CATALOG)
}

describe('World: время и нужды', () => {
  it('ставит игрока в центр стартовой клетки', () => {
    expect(makeWorld().player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('продвигает часы при тике', () => {
    const world = makeWorld()
    const before = world.clock.totalMinutes
    world.tick(0.1)
    expect(world.clock.totalMinutes).toBeGreaterThan(before)
  })

  it('изнашивает нужды при тике', () => {
    const world = makeWorld()
    world.clock.speed = 3
    for (let i = 0; i < 100; i++) world.tick(0.1)
    expect(world.needs.energy).toBeLessThan(100)
    expect(world.needs.stress).toBeGreaterThan(0)
  })

  it('на паузе ничего не меняется', () => {
    const world = makeWorld()
    world.clock.speed = 0
    const before = world.snapshot()
    world.tick(0.2)
    const after = world.snapshot()
    expect(after.minutes).toBe(before.minutes)
    expect(after.needs.energy).toBe(before.needs.energy)
  })

  it('ограничивает длину одного тика, чтобы не проваливаться после сворачивания вкладки', () => {
    const world = makeWorld()
    world.clock.speed = 1
    world.tick(3600)
    expect(world.clock.totalMinutes - 7 * 60).toBeLessThanOrEqual(30)
  })

  it('применяет дельту нужд', () => {
    const world = makeWorld()
    world.applyNeeds({ hunger: -60 })
    expect(world.needs.hunger).toBe(40)
  })

  it('отдаёт снимок состояния с подписями на русском', () => {
    const snap = makeWorld().snapshot()
    expect(snap.timeLabel).toBe('07:00')
    expect(snap.dayLabel).toBe('Неделя 1, понедельник')
    expect(snap.mood).toBeGreaterThan(90)
    expect(snap.activity).toBeNull()
  })

  it('мир без учёбы работает и молчит о занятиях', () => {
    const world = makeWorld()
    world.tick(0.1)
    const snap = world.snapshot()
    expect(world.study).toBeNull()
    expect(snap.currentRoom).toBeNull()
    expect(snap.currentLesson).toBeNull()
    expect(snap.nextLesson).toBeNull()
  })
})

describe('World: движение', () => {
  it('на паузе игрок не двигается', () => {
    const world = makeWorld()
    world.commandMoveTo({ col: 4, row: 0 })
    world.clock.speed = 0
    world.tick(0.2)
    expect(world.player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('исполняет команду перемещения', () => {
    const world = makeWorld()
    expect(world.commandMoveTo({ col: 4, row: 2 })).toBe(true)
    for (let i = 0; i < 600; i++) world.tick(0.05)
    expect(world.player.position.x).toBeCloseTo(4.5, 2)
    expect(world.player.position.z).toBeCloseTo(2.5, 2)
  })

  it('отвергает команду в непроходимую клетку', () => {
    expect(makeWorld().commandMoveTo({ col: 50, row: 50 })).toBe(false)
  })
})

describe('World: взаимодействия', () => {
  it('отвергает взаимодействие с несуществующим предметом', () => {
    expect(makeWorld().commandInteract('нет-такого', 'drinkCoffee')).toBe(false)
  })

  it('отвергает неизвестное действие', () => {
    expect(makeWorld().commandInteract('coffee-1', 'нет-такого')).toBe(false)
  })

  it('принимает известное действие и ставит его в очередь', () => {
    const world = makeWorld()
    expect(world.commandInteract('coffee-1', 'drinkCoffee')).toBe(true)
    expect(world.activeInteraction?.interactionId).toBe('drinkCoffee')
  })

  it('не применяет эффект, пока персонаж идёт', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.tick(0.05)
    expect(world.needs.energy).toBeLessThanOrEqual(40)
    expect(world.activeInteraction).not.toBeNull()
  })

  it('применяет эффект после того, как персонаж дошёл и отработал время', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.clock.speed = 3
    world.commandInteract('coffee-1', 'drinkCoffee')
    for (let i = 0; i < 200; i++) world.tick(0.05)
    expect(world.activeInteraction).toBeNull()
    expect(world.needs.energy).toBeGreaterThan(40)
  })

  it('показывает текущее занятие в снимке состояния', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    expect(world.snapshot().activity).toBe('Взять кофе')
  })

  it('новая команда движения отменяет взаимодействие', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.commandMoveTo({ col: 0, row: 2 })
    expect(world.activeInteraction).toBeNull()
  })
})

const STUDY_PLAN: FloorPlan = {
  id: 'study',
  name: 'Учебный этаж',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: [
    '....#....',
    '....#....',
    '.........',
  ],
  props: [],
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 0, row0: 0, col1: 3, row1: 1 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 5, row0: 0, col1: 8, row1: 1 },
    { id: 'коридор', name: 'Коридор', col0: 0, row0: 2, col1: 8, row1: 2 },
  ],
}

const STUDY_COURSES: CourseCatalog = {
  greek: {
    id: 'greek',
    title: 'Древнегреческий язык',
    short: 'Греческий',
    teacherId: 'alieva',
    assessments: [
      { id: 'classwork', label: 'Работа на занятиях', weight: 1, kind: 'seminar', blocking: false },
    ],
  },
}

const STUDY_SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
]

const FIRST = PERIODS[0]!

const IN_CLASS = { col: 1, row: 0 }
const IN_CORRIDOR = { col: 1, row: 2 }
const IN_OTHER_CLASS = { col: 6, row: 0 }

function makeStudyWorld(spawn: { col: number; row: number }): World {
  const study = new StudyState({
    courses: STUDY_COURSES,
    schedule: STUDY_SCHEDULE,
    essays: [],
  })
  return new World(STUDY_PLAN, spawn, {}, study)
}

/** Прокручивает игровое время до указанной минуты суток. */
function runUntil(world: World, minutes: number): void {
  world.clock.speed = 3
  for (let i = 0; i < 20000 && world.clock.time.minutes < minutes; i++) world.tick(0.25)
  expect(world.clock.time.minutes).toBeGreaterThanOrEqual(minutes)
}

/**
 * Прокручивает время до той же минуты через неделю. Нужно, чтобы проверять
 * повторяющиеся пары: расписание недельное, а журналы ведут счёт дням.
 */
function runUntilNextWeek(world: World, minutes: number): void {
  world.clock.speed = 3
  const target = world.clock.time.day + 7
  for (let i = 0; i < 200000; i++) {
    const { day, minutes: now } = world.clock.time
    if (day > target || (day === target && now >= minutes)) break
    world.tick(0.25)
  }
  expect(world.clock.time.day).toBe(target)
  expect(world.clock.time.minutes).toBeGreaterThanOrEqual(minutes)
}

/** Отметка за сегодняшнюю пару: в журнале лежит день плюс слот расписания. */
function markOf(world: World, lessonId: string): AttendanceMark | null {
  return world.study?.attendance.markFor(occurrenceId(world.clock.time.day, lessonId)) ?? null
}

describe('World: учёба', () => {
  it('засчитывает присутствие, если персонаж стоит в нужной аудитории', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBe('present')
  })

  it('ставит прогул, если персонаж простоял пару в коридоре', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBeNull()

    runUntil(world, FIRST.endMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBe('absent')
  })

  it('ставит прогул, если персонаж просидел пару в соседней аудитории', () => {
    const world = makeStudyWorld(IN_OTHER_CLASS)
    runUntil(world, FIRST.endMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBe('absent')
  })

  it('засчитывает опоздание тому, кто дошёл до аудитории к середине пары', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 30)
    world.commandMoveTo(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 40)
    expect(markOf(world, 'greek-mon')).toBe('late')
  })

  it('не перезаписывает отметку, если персонаж досидел пару до звонка', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.endMinutes + 30)
    expect(markOf(world, 'greek-mon')).toBe('present')
  })

  it('на паузе посещаемость не меняется', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    world.clock.speed = 0
    world.tick(1)
    expect(markOf(world, 'greek-mon')).toBeNull()
  })

  it('отмечает ту же понедельничную пару и на следующей неделе', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBe('present')

    // Отметка первой недели не должна закрывать пару навсегда: расписание
    // недельное, а журнал ведёт счёт состоявшимся парам.
    runUntilNextWeek(world, FIRST.startMinutes + 5)
    expect(world.clock.formatDay()).toBe('Неделя 2, понедельник')
    expect(markOf(world, 'greek-mon')).toBe('present')
    expect(world.study?.attendance.countByCourse('greek').present).toBe(2)
  })

  it('прогул на второй неделе ставится, хотя первая была посещена', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 5)

    world.commandMoveTo(IN_CORRIDOR)
    runUntilNextWeek(world, FIRST.endMinutes + 5)
    expect(markOf(world, 'greek-mon')).toBe('absent')
    expect(world.study?.attendance.countByCourse('greek')).toEqual({
      present: 1,
      late: 0,
      absent: 1,
    })
  })

  it('показывает в снимке помещение, где стоит персонаж', () => {
    expect(makeStudyWorld(IN_CLASS).snapshot().currentRoom).toBe('А-204')
    expect(makeStudyWorld(IN_CORRIDOR).snapshot().currentRoom).toBe('коридор')
  })

  it('показывает ближайшую пару и время до звонка', () => {
    const snap = makeStudyWorld(IN_CORRIDOR).snapshot()
    expect(snap.currentLesson).toBeNull()
    expect(snap.nextLesson).toEqual({
      courseId: 'greek',
      room: 'А-204',
      startsInMinutes: FIRST.startMinutes - 7 * 60,
    })
  })

  it('показывает идущую пару, пока она идёт', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.snapshot().currentLesson).toEqual({
      courseId: 'greek',
      room: 'А-204',
      kind: 'seminar',
    })
  })

  it('после последней пары дня не обещает следующую', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.endMinutes + 5)
    const snap = world.snapshot()
    expect(snap.currentLesson).toBeNull()
    expect(snap.nextLesson).toBeNull()
  })
})

const MOODLET_CATALOG: MoodletCatalog = {
  praised: {
    id: 'praised',
    label: 'Похвалил Михайловский',
    mood: 40,
    durationMinutes: 360,
  },
  elevator: {
    id: 'elevator',
    label: 'Ждал лифт восемь минут',
    mood: -12,
    durationMinutes: 60,
  },
  coffee: {
    id: 'coffee',
    label: 'Кофе из автомата на втором этаже',
    mood: 16,
    durationMinutes: 120,
  },
}

/** Тот же кофейный автомат, но действие оставляет след в настроении. */
const MOOD_PROPS: PropCatalog = {
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28 },
        moodletId: 'coffee',
      },
      {
        id: 'stareAtIt',
        label: 'Просто посмотреть на него',
        durationMinutes: 1,
        needDelta: {},
      },
    ],
  },
}

function makeMoodWorld(): World {
  return new World(PLAN, { col: 0, row: 0 }, MOOD_PROPS, null, MOODLET_CATALOG)
}

describe('World: навыки', () => {
  it('начинаются с нуля', () => {
    const world = makeWorld()
    for (const id of SKILL_IDS) expect(world.skills[id], id).toBe(0)
  })

  it('прокачиваются и попадают в снимок', () => {
    const world = makeWorld()
    world.trainSkill('logic', 3)
    expect(world.skills.logic).toBeGreaterThan(0)
    expect(world.snapshot().skills.logic).toBe(world.skills.logic)
  })

  it('прирост замедляется на высоких уровнях', () => {
    const low = makeWorld()
    const high = makeWorld()
    high.skills = { ...high.skills, eloquence: 8 }

    low.trainSkill('eloquence', 1)
    high.trainSkill('eloquence', 1)

    expect(high.skills.eloquence - 8).toBeLessThan(low.skills.eloquence)
  })

  it('не выходят за десятку', () => {
    const world = makeWorld()
    for (let i = 0; i < 2000; i++) world.trainSkill('endurance', 5)
    expect(world.skills.endurance).toBe(10)
  })
})

describe('World: модификаторы настроения', () => {
  it('в новом мире их нет и настроение равно базовому', () => {
    const world = makeWorld()
    expect(world.snapshot().activeMoodlets).toEqual([])
    expect(world.mood).toBe(world.baseMood)
  })

  it('поднимают настроение выше базового', () => {
    const world = makeMoodWorld()
    world.applyNeeds({ hunger: -50, energy: -50 })
    const before = world.mood
    world.addMoodletById('praised')
    expect(world.mood).toBeGreaterThan(before)
  })

  it('опускают настроение ниже базового', () => {
    const world = makeMoodWorld()
    world.applyNeeds({ hunger: -30 })
    const before = world.mood
    world.addMoodletById('elevator')
    expect(world.mood).toBeLessThan(before)
  })

  it('итог зажимается в 0..100', () => {
    const world = makeMoodWorld()
    world.addMoodletById('praised')
    expect(world.mood).toBeLessThanOrEqual(100)

    world.needs = { ...world.needs, energy: 0, hunger: 0, stress: 100 }
    world.moodlets.clear()
    for (let i = 0; i < 5; i++) {
      world.moodlets.add({
        id: `beda-${i}`,
        label: 'Всё плохо',
        mood: -40,
        expiresAtMinute: 100000,
      })
    }
    expect(world.mood).toBeGreaterThanOrEqual(0)
  })

  it('неизвестный идентификатор игнорируется, а не роняет мир', () => {
    const world = makeMoodWorld()
    expect(world.addMoodletById('нет-такого')).toBe(false)
    expect(world.snapshot().activeMoodlets).toEqual([])
  })

  it('мир без каталога модификаторов работает', () => {
    const world = makeWorld()
    expect(world.addMoodletById('praised')).toBe(false)
  })

  it('попадают в снимок с текстом и знаком влияния', () => {
    const world = makeMoodWorld()
    world.addMoodletById('elevator')
    expect(world.snapshot().activeMoodlets).toEqual([
      { id: 'elevator', label: 'Ждал лифт восемь минут', mood: -12 },
    ])
  })

  it('истекают со временем и вычищаются в тике', () => {
    const world = makeMoodWorld()
    world.addMoodletById('elevator')
    expect(world.moodlets.has('elevator')).toBe(true)

    world.clock.speed = 3
    for (let i = 0; i < 2000 && world.moodlets.has('elevator'); i++) world.tick(0.25)

    expect(world.moodlets.has('elevator')).toBe(false)
    expect(world.snapshot().activeMoodlets).toEqual([])
  })

  it('истёкший модификатор перестаёт влиять на настроение', () => {
    const world = makeMoodWorld()
    world.moodlets.add({
      id: 'elevator',
      label: 'Ждал лифт восемь минут',
      mood: -12,
      expiresAtMinute: world.clock.totalMinutes + 1,
    })
    const spoiled = world.mood
    world.moodlets.prune(world.clock.totalMinutes + 2)
    expect(world.mood).toBeGreaterThan(spoiled)
  })

  it('взаимодействие с предметом вешает свой модификатор', () => {
    const world = makeMoodWorld()
    world.clock.speed = 3
    world.commandInteract('coffee-1', 'drinkCoffee')
    for (let i = 0; i < 200; i++) world.tick(0.05)

    expect(world.activeInteraction).toBeNull()
    expect(world.moodlets.has('coffee')).toBe(true)
    expect(world.snapshot().activeMoodlets.map((m) => m.label)).toEqual([
      'Кофе из автомата на втором этаже',
    ])
  })

  it('модификатор не вешается, пока действие не доведено до конца', () => {
    const world = makeMoodWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.tick(0.05)
    expect(world.moodlets.has('coffee')).toBe(false)
  })

  it('действие без модификатора ничего не вешает', () => {
    const world = makeMoodWorld()
    world.clock.speed = 3
    world.commandInteract('coffee-1', 'stareAtIt')
    for (let i = 0; i < 200; i++) world.tick(0.05)
    expect(world.activeInteraction).toBeNull()
    expect(world.snapshot().activeMoodlets).toEqual([])
  })

  it('повторное действие не плодит дубли, а продлевает срок', () => {
    const world = makeMoodWorld()
    world.clock.speed = 3
    for (let round = 0; round < 2; round++) {
      world.commandInteract('coffee-1', 'drinkCoffee')
      for (let i = 0; i < 200; i++) world.tick(0.05)
    }
    expect(world.snapshot().activeMoodlets.length).toBe(1)
  })
})

const TEACHER_NPC: NpcSpec = {
  id: 'teacher-alieva',
  teacherId: 'alieva',
  courseIds: ['greek'],
  homeRoom: 'коридор',
}

function makeNpcWorld(): World {
  const study = new StudyState({
    courses: STUDY_COURSES,
    schedule: STUDY_SCHEDULE,
    essays: [],
  })
  return new World(STUDY_PLAN, IN_CORRIDOR, {}, study, {}, [TEACHER_NPC])
}

describe('World: жители этажа', () => {
  it('мир без NPC отдаёт пустой список', () => {
    expect(makeWorld().snapshot().npcs).toEqual([])
  })

  it('создаёт NPC и показывает их в снимке', () => {
    const snap = makeNpcWorld().snapshot()
    expect(snap.npcs.length).toBe(1)
    expect(snap.npcs[0]?.teacherId).toBe('alieva')
    expect(snap.npcs[0]?.isMoving).toBe(false)
    expect(Number.isFinite(snap.npcs[0]?.position.x)).toBe(true)
  })

  it('преподаватель начинает день в коридоре, а к паре стоит в аудитории', () => {
    const world = makeNpcWorld()
    const npc = world.npcs[0]!
    expect(npcRoom(world.grid, npc)).toBe('коридор')

    runUntil(world, FIRST.startMinutes)
    expect(npcRoom(world.grid, npc)).toBe('А-204')
  })

  it('после пары преподаватель возвращается в коридор', () => {
    const world = makeNpcWorld()
    runUntil(world, FIRST.endMinutes + 40)
    expect(npcRoom(world.grid, world.npcs[0]!)).toBe('коридор')
  })

  it('на паузе NPC стоят на месте', () => {
    const world = makeNpcWorld()
    const before = { ...world.npcs[0]!.actor.position }
    world.clock.speed = 0
    world.tick(1)
    expect(world.npcs[0]!.actor.position).toEqual(before)
  })

  it('NPC не мешает игроку ходить', () => {
    const world = makeNpcWorld()
    expect(world.commandMoveTo({ col: 8, row: 2 })).toBe(true)
    for (let i = 0; i < 600; i++) world.tick(0.05)
    expect(world.player.position.x).toBeCloseTo(8.5, 2)
  })
})

/* ------------------------------------------------------------------ */
/* Разговоры                                                           */
/* ------------------------------------------------------------------ */

function teacher(id: string, position: number, tolerance: number): Teacher {
  return {
    id,
    short: id,
    name: `${id} Имя Отчество`,
    courseIds: [],
    factionPosition: position,
    factionTolerance: tolerance,
    lines: {
      greeting: [],
      praise: [],
      rebuke: [],
      lateArrival: [],
      examPass: [],
      examFail: [],
    },
  }
}

/** Два полюса шкалы традиций: континентальный и аналитический. */
const TALK_TEACHERS: TeacherCatalog = {
  continental: teacher('continental', 85, 45),
  analytic: teacher('analytic', -85, 50),
}

/** Одинаковые узлы у двух разных людей: разницу даёт только шкала. */
function talkNode(speakerId: string): DialogueNode {
  return {
    id: `${speakerId}-hall`,
    speakerId,
    prompt: 'И что вы об этом думаете?',
    options: [
      { id: 'safe', text: 'Промолчать', effects: {}, reply: 'Понятно.' },
      {
        id: 'smart',
        text: 'Ответить по существу',
        effects: { respect: 10, faction: 4, skill: { id: 'logic', amount: 0.5 } },
        reply: 'Уже лучше.',
      },
      {
        id: 'bold',
        text: 'Надерзить',
        effects: { respect: -6, affection: 5, faction: -4 },
        reply: 'Смело.',
      },
      {
        id: 'locked',
        text: 'Сослаться на прочитанное',
        requires: { book: 'phaedo' },
        effects: { respect: 12 },
        reply: 'Читали, вижу.',
      },
      {
        id: 'nonsense-skill',
        text: 'Спросить про латынь',
        effects: { skill: { id: 'латынь', amount: 5 } },
        reply: 'Латынь у нас со второго курса.',
      },
    ],
  }
}

const TALK_DIALOGUES: DialogueCatalog = {
  'continental-hall': talkNode('continental'),
  'analytic-hall': talkNode('analytic'),
}

const TALK_NPCS: NpcSpec[] = [
  { id: 'teacher-continental', teacherId: 'continental', courseIds: [], homeRoom: 'коридор' },
  { id: 'teacher-analytic', teacherId: 'analytic', courseIds: [], homeRoom: 'коридор' },
]

function makeTalkWorld(spawn = IN_CORRIDOR): World {
  return new World(STUDY_PLAN, spawn, {}, null, {}, TALK_NPCS, {
    teachers: TALK_TEACHERS,
    dialogues: TALK_DIALOGUES,
  })
}

describe('World: начало разговора', () => {
  it('мир без каталога разговоров молча отказывает', () => {
    expect(makeWorld().startDialogue('continental-hall')).toBe(false)
    expect(makeWorld().activeDialogue).toBeNull()
  })

  it('несуществующий узел не начинает разговор', () => {
    const world = makeTalkWorld()
    expect(world.startDialogue('нет-такого')).toBe(false)
    expect(world.activeDialogue).toBeNull()
  })

  it('в одном помещении с собеседником разговор начинается', () => {
    const world = makeTalkWorld()
    expect(world.startDialogue('continental-hall')).toBe(true)
    expect(world.activeDialogue?.npcId).toBe('teacher-continental')
  })

  it('разговор останавливает шаг: на ходу не разговаривают', () => {
    const world = makeTalkWorld()
    expect(world.commandMoveTo({ col: 8, row: 2 })).toBe(true)
    world.startDialogue('continental-hall')
    expect(isMoving(world.player)).toBe(false)
  })

  it('из другой аудитории заговорить нельзя', () => {
    const world = makeTalkWorld(IN_CLASS)
    expect(world.startDialogue('continental-hall')).toBe(false)
    expect(world.activeDialogue).toBeNull()
  })

  it('в разговоре видны только доступные реплики', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    expect(world.activeDialogue?.options.map((option) => option.id)).toEqual([
      'safe',
      'smart',
      'bold',
      'nonsense-skill',
    ])
  })

  it('прочитанная книга открывает реплику', () => {
    const world = makeTalkWorld()
    world.markBookRead('phaedo')
    world.startDialogue('continental-hall')
    expect(world.activeDialogue?.options.map((o) => o.id)).toContain('locked')
  })

  it('перечитывание книги ничего не меняет', () => {
    const world = makeTalkWorld()
    world.markBookRead('phaedo')
    world.markBookRead('phaedo')
    expect(world.readBooks).toEqual(['phaedo'])
  })
})

describe('World: выбор реплики', () => {
  it('возвращает ответ собеседника', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    expect(world.chooseOption('smart')).toBe('Уже лучше.')
    expect(world.activeDialogue?.reply).toBe('Уже лучше.')
  })

  it('второй раз в том же разговоре ответить нельзя', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('smart')
    const before = world.relationships.get('teacher-continental').respect
    expect(world.chooseOption('smart')).toBeNull()
    expect(world.relationships.get('teacher-continental').respect).toBe(before)
  })

  it('без начатого разговора выбирать нечего', () => {
    expect(makeTalkWorld().chooseOption('smart')).toBeNull()
  })

  it('недоступную реплику выбрать нельзя', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    expect(world.chooseOption('locked')).toBeNull()
    expect(world.relationships.get('teacher-continental').respect).toBe(0)
  })

  it('симпатия и уважение уходят в карту отношений', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('bold')
    const relationship = world.relationships.get('teacher-continental')
    expect(relationship.affection).toBe(5)
    expect(relationship.respect).toBe(-6)
  })

  it('сдвигает игрока по шкале традиций', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('smart')
    expect(world.faction).toBe(4)
  })

  it('шкала традиций не выходит за пределы', () => {
    const world = makeTalkWorld()
    world.faction = 99
    world.startDialogue('continental-hall')
    world.chooseOption('smart')
    expect(world.faction).toBe(100)
  })

  it('качает навык через общий замедлитель прокачки', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('smart')
    expect(world.skills.logic).toBeGreaterThan(0)
    expect(world.skills.logic).toBeLessThanOrEqual(0.5)
  })

  it('несуществующий навык в данных не роняет разговор', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    expect(world.chooseOption('nonsense-skill')).toBe('Латынь у нас со второго курса.')
    for (const id of SKILL_IDS) expect(world.skills[id], id).toBe(0)
  })

  it('закрытие разговора не отменяет уже применённых эффектов', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('bold')
    world.endDialogue()
    expect(world.activeDialogue).toBeNull()
    expect(world.relationships.get('teacher-continental').affection).toBe(5)
  })
})

describe('World: шкала традиций управляет уважением', () => {
  /** Уважение, заработанное одним и тем же ответом у одного из двоих. */
  function respectFrom(npcId: string, nodeId: string, faction: number): number {
    const world = makeTalkWorld()
    world.faction = faction
    world.startDialogue(nodeId)
    world.chooseOption('smart')
    return world.relationships.get(npcId).respect
  }

  it('один и тот же ответ у разных преподавателей стоит по-разному', () => {
    const toContinental = respectFrom('teacher-continental', 'continental-hall', 0)
    const toAnalytic = respectFrom('teacher-analytic', 'analytic-hall', 0)
    expect(toContinental).toBeGreaterThan(0)
    expect(toAnalytic).toBeGreaterThan(0)
    expect(toContinental).not.toBeCloseTo(toAnalytic, 3)
  })

  it('своему тот же ответ приносит больше, чем чужому', () => {
    const asOwn = respectFrom('teacher-continental', 'continental-hall', 81)
    const asStranger = respectFrom('teacher-continental', 'continental-hall', -100)
    expect(asOwn).toBeGreaterThan(asStranger)
    expect(asStranger).toBeGreaterThan(0)
  })

  it('всеобщим любимцем стать нельзя: приблизившись к одному, теряешь у другого', () => {
    const nearContinental = respectFrom('teacher-continental', 'continental-hall', 81)
    const farAnalytic = respectFrom('teacher-analytic', 'analytic-hall', 81)
    expect(nearContinental).toBeGreaterThan(farAnalytic)
  })

  it('потеря уважения одинакова у своих и у чужих', () => {
    function penalty(faction: number): number {
      const world = makeTalkWorld()
      world.faction = faction
      world.startDialogue('continental-hall')
      world.chooseOption('bold')
      return world.relationships.get('teacher-continental').respect
    }
    expect(penalty(85)).toBe(penalty(-85))
  })
})

describe('World: подход к собеседнику', () => {
  it('отправляет игрока к человеку с другого конца коридора', () => {
    const world = makeTalkWorld({ col: 8, row: 2 })
    expect(world.commandApproachNpc('teacher-continental')).toBe(true)

    world.clock.speed = 3
    for (let i = 0; i < 600 && isMoving(world.player); i++) world.tick(0.05)

    const npc = world.npcManager.find('teacher-continental')!
    const player = world.grid.worldToGrid(world.player.position)
    const target = world.grid.worldToGrid(npc.actor.position)
    const distance = Math.abs(player.col - target.col) + Math.abs(player.row - target.row)
    expect(distance).toBe(1)
    expect(world.currentRoom).toBe('коридор')
  })

  it('дойдя из аудитории, игрок наконец может заговорить', () => {
    const world = makeTalkWorld(IN_CLASS)
    expect(world.startDialogue('continental-hall')).toBe(false)

    world.commandApproachNpc('teacher-continental')
    world.clock.speed = 3
    for (let i = 0; i < 600 && isMoving(world.player); i++) world.tick(0.05)

    expect(world.startDialogue('continental-hall')).toBe(true)
  })

  it('подходит по коридору, а не через стену в соседнюю аудиторию', () => {
    const world = makeTalkWorld({ col: 8, row: 2 })
    world.commandApproachNpc('teacher-continental')
    world.clock.speed = 3
    for (let i = 0; i < 600 && isMoving(world.player); i++) world.tick(0.05)
    expect(world.currentRoom).toBe('коридор')
  })

  it('к несуществующему человеку не идут', () => {
    expect(makeTalkWorld().commandApproachNpc('нет-такого')).toBe(false)
  })

  it('стоящий вплотную никуда не идёт', () => {
    const world = makeTalkWorld({ col: 3, row: 2 })
    expect(world.commandApproachNpc('teacher-continental')).toBe(true)
    expect(isMoving(world.player)).toBe(false)
  })

  it('подход отменяет начатое действие с предметом', () => {
    const world = makeTalkWorld({ col: 8, row: 2 })
    world.activeInteraction = {
      propId: 'x',
      interactionId: 'y',
      label: 'Занят',
      remainingMinutes: 10,
      needDelta: {},
      moodletId: null,
    }
    world.commandApproachNpc('teacher-continental')
    expect(world.activeInteraction).toBeNull()
  })
})

describe('World: снимок социального состояния', () => {
  it('показывает позицию на шкале традиций словами', () => {
    const world = makeTalkWorld()
    world.faction = -80
    expect(world.snapshot().factionLabel).toBe('Убеждённый аналитик')
  })

  it('отдаёт отношения по каждому жителю этажа', () => {
    const snapshot = makeTalkWorld().snapshot()
    expect(snapshot.relationships.map((item) => item.npcId)).toEqual([
      'teacher-continental',
      'teacher-analytic',
    ])
    expect(snapshot.relationships[0]?.label).toBe('Незнакомы')
  })

  it('отношения в снимке меняются после разговора', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('bold')
    const record = world.snapshot().relationships.find((r) => r.npcId === 'teacher-continental')
    expect(record?.affection).toBe(5)
    expect(record?.teacherId).toBe('continental')
  })

  it('без разговора активного диалога в снимке нет', () => {
    expect(makeTalkWorld().snapshot().activeDialogue).toBeNull()
  })

  it('показывает реплику собеседника и доступные ответы', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    const dialogue = world.snapshot().activeDialogue
    expect(dialogue?.nodeId).toBe('continental-hall')
    expect(dialogue?.speakerId).toBe('continental')
    expect(dialogue?.prompt).toBe('И что вы об этом думаете?')
    expect(dialogue?.options.map((option) => option.id)).toContain('smart')
    expect(dialogue?.reply).toBeNull()
  })

  it('после выбора в снимке появляется ответ собеседника', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.chooseOption('smart')
    expect(world.snapshot().activeDialogue?.reply).toBe('Уже лучше.')
  })

  it('мир без людей отдаёт пустой список отношений', () => {
    const snapshot = makeWorld().snapshot()
    expect(snapshot.relationships).toEqual([])
    expect(snapshot.faction).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/* Семинар                                                             */
/* ------------------------------------------------------------------ */

/** Тот же преподаватель, но с готовыми репликами на выступление. */
function speakingTeacher(id: string, position: number, tolerance: number): Teacher {
  return {
    ...teacher(id, position, tolerance),
    lines: {
      greeting: [],
      praise: ['Вот. Именно это место и важно.', 'Хорошо. Теперь объясните, почему.'],
      rebuke: ['Это пересказ комментария.', 'Не угадывайте. Разбирайте.'],
      lateArrival: [],
      examPass: [],
      examFail: [],
    },
  }
}

const SEMINAR_TEACHERS: TeacherCatalog = {
  continental: speakingTeacher('continental', 85, 45),
}

const SEMINAR_OPTIONS: SeminarOption[] = [
  {
    id: 'retell',
    label: 'Пересказать прочитанное',
    hint: 'Безопасно и невысоко.',
    skills: [],
    factionShift: 0,
    floor: 3,
    ceiling: 7,
  },
  {
    id: 'challenge',
    label: 'Поспорить с преподавателем',
    hint: 'И десятка, и ноль.',
    skills: ['eloquence'],
    factionShift: 8,
    opposeTeacher: true,
    floor: 0,
    ceiling: 10,
    requires: { skillId: 'eloquence', skillMin: 3 },
  },
]

const SEMINAR_COURSES: CourseCatalog = {
  greek: {
    id: 'greek',
    title: 'Древнегреческий язык',
    short: 'Греческий',
    teacherId: 'continental',
    skillIds: ['ancientLanguages'],
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 1, kind: 'seminar', blocking: false },
    ],
  },
  histphil: {
    id: 'histphil',
    title: 'История философии',
    short: 'История философии',
    teacherId: 'continental',
    skillIds: ['germanClassics'],
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 1, kind: 'seminar', blocking: false },
    ],
  },
}

/** Семинар первой парой в А-204 и лекция второй в А-206 — чтобы было с чем сравнить. */
const SEMINAR_SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'histphil-mon', courseId: 'histphil', kind: 'lecture', weekday: 0, period: 1, room: 'А-206' },
]

const SEMINAR_MOODLETS: MoodletCatalog = {
  spokeAtSeminar: {
    id: 'spokeAtSeminar',
    label: 'Выступил на семинаре',
    mood: 22,
    durationMinutes: 240,
  },
  failedAtSeminar: {
    id: 'failedAtSeminar',
    label: 'Провалился на семинаре',
    mood: -28,
    durationMinutes: 300,
  },
}

const SEMINAR_NPCS: NpcSpec[] = [
  {
    id: 'teacher-continental',
    teacherId: 'continental',
    courseIds: ['greek', 'histphil'],
    homeRoom: 'коридор',
  },
]

const IN_LECTURE_ROOM = IN_OTHER_CLASS

function makeSeminarWorld(spawn = IN_CLASS): World {
  const study = new StudyState({
    courses: SEMINAR_COURSES,
    schedule: SEMINAR_SCHEDULE,
    essays: [],
    seminarOptions: SEMINAR_OPTIONS,
  })
  return new World(STUDY_PLAN, spawn, {}, study, SEMINAR_MOODLETS, SEMINAR_NPCS, {
    teachers: SEMINAR_TEACHERS,
    dialogues: {},
  })
}

/** Готовый ко всему студент: начитан, в духе преподавателя, в хорошем настроении. */
function preparedWorld(): World {
  const world = makeSeminarWorld()
  world.skills = createSkills({ ancientLanguages: 9, eloquence: 9, endurance: 9 })
  world.faction = 85
  runUntil(world, FIRST.startMinutes + 5)
  return world
}

/** Пришёл, не открыв текста, чужой преподавателю и в разбитом настроении. */
function hopelessWorld(): World {
  const world = makeSeminarWorld()
  world.faction = -100
  runUntil(world, FIRST.startMinutes + 5)
  world.addMoodlet({ id: 'ужас', label: 'Всё плохо', mood: -100, durationMinutes: 600 })
  return world
}

describe('World: право выступить на семинаре', () => {
  it('мир без учёбы молча отказывает', () => {
    const outcome = makeWorld().commandSpeakAtSeminar('retell')
    expect(outcome.ok).toBe(false)
    expect(outcome).toEqual({ ok: false, reason: 'Сейчас не семинар' })
  })

  it('до звонка выступать негде', () => {
    const world = makeSeminarWorld()
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Сейчас не семинар',
    })
  })

  it('из коридора выступать нельзя', () => {
    const world = makeSeminarWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы не в той аудитории',
    })
  })

  it('на лекции не выступают', () => {
    const world = makeSeminarWorld(IN_LECTURE_ROOM)
    runUntil(world, PERIODS[1]!.startMinutes + 5)
    expect(markOf(world, 'histphil-mon')).toBe('present')
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Сейчас не семинар',
    })
  })

  it('дважды за одну пару слова не дают', () => {
    const world = preparedWorld()
    expect(world.commandSpeakAtSeminar('retell').ok).toBe(true)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы уже выступали',
    })
  })

  it('несуществующий вариант выступления отвергается с причиной', () => {
    const world = preparedWorld()
    expect(world.commandSpeakAtSeminar('нет-такого')).toEqual({
      ok: false,
      reason: 'Такого выступления нет',
    })
  })

  it('вариант, до которого не дорос, отвергается с причиной', () => {
    const world = makeSeminarWorld()
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.commandSpeakAtSeminar('challenge')).toEqual({
      ok: false,
      reason: 'Для этого не хватает подготовки',
    })
  })

  it('отказ ничего не тратит: после него можно выступить', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('нет-такого')
    expect(world.commandSpeakAtSeminar('retell').ok).toBe(true)
  })
})

describe('World: выступление на семинаре', () => {
  it('подготовленный у своего преподавателя получает высокую оценку', () => {
    const outcome = preparedWorld().commandSpeakAtSeminar('challenge')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.speech.grade).toBeGreaterThanOrEqual(8)
    expect(outcome.speech.success).toBe(true)
  })

  it('неподготовленный у чужого проваливается', () => {
    const outcome = hopelessWorld().commandSpeakAtSeminar('retell')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.speech.success).toBe(false)
    expect(outcome.speech.grade).toBeLessThan(4)
  })

  it('оценка уходит в ведомость', () => {
    const world = preparedWorld()
    const outcome = world.commandSpeakAtSeminar('retell')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(world.study?.gradebook.gradeFor('greek', 'seminars')).toBe(outcome.speech.grade)
  })

  it('удачное выступление приносит уважение преподавателя', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('challenge')
    expect(world.relationships.get('teacher-continental').respect).toBeGreaterThan(0)
  })

  it('провал стоит уважения', () => {
    const world = hopelessWorld()
    world.commandSpeakAtSeminar('retell')
    expect(world.relationships.get('teacher-continental').respect).toBeLessThan(0)
  })

  it('удачное выступление вешает свой модификатор настроения', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')
    expect(world.moodlets.has('spokeAtSeminar')).toBe(true)
    expect(world.moodlets.has('failedAtSeminar')).toBe(false)
  })

  it('провал вешает свой', () => {
    const world = hopelessWorld()
    world.commandSpeakAtSeminar('retell')
    expect(world.moodlets.has('failedAtSeminar')).toBe(true)
  })

  it('красноречие качается в любом случае', () => {
    const world = hopelessWorld()
    world.commandSpeakAtSeminar('retell')
    expect(world.skills.eloquence).toBeGreaterThan(0)
  })

  it('спор сносит игрока прочь от преподавателя', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('challenge')
    expect(world.faction).toBe(77)
  })

  it('осторожный пересказ по шкале традиций не двигает', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')
    expect(world.faction).toBe(85)
  })

  it('преподаватель отвечает своими словами: похвалой на успех', () => {
    const outcome = preparedWorld().commandSpeakAtSeminar('challenge')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(SEMINAR_TEACHERS.continental!.lines.praise).toContain(outcome.speech.reply)
  })

  it('и выговором на провал', () => {
    const outcome = hopelessWorld().commandSpeakAtSeminar('retell')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(SEMINAR_TEACHERS.continental!.lines.rebuke).toContain(outcome.speech.reply)
  })

  it('одно и то же выступление отвечает одними и теми же словами', () => {
    const first = preparedWorld().commandSpeakAtSeminar('retell')
    const second = preparedWorld().commandSpeakAtSeminar('retell')
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.speech.reply).toBe(second.speech.reply)
  })
})

describe('World: семинар в снимке состояния', () => {
  it('вне занятий семинара в снимке нет', () => {
    const snapshot = makeSeminarWorld().snapshot()
    expect(snapshot.seminar).toBeNull()
    expect(snapshot.canSpeakAtSeminar).toBe(false)
  })

  it('из коридора панель не показывается', () => {
    const world = makeSeminarWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.snapshot().seminar).toBeNull()
    expect(world.snapshot().canSpeakAtSeminar).toBe(false)
  })

  it('сидящему на семинаре показывает варианты и разрешает выступить', () => {
    const snapshot = preparedWorld().snapshot()
    expect(snapshot.canSpeakAtSeminar).toBe(true)
    expect(snapshot.seminar?.courseId).toBe('greek')
    expect(snapshot.seminar?.lessonId).toBe('greek-mon')
    expect(snapshot.seminar?.teacherId).toBe('continental')
    expect(snapshot.seminar?.reason).toBeNull()
    expect(snapshot.seminar?.options.map((option) => option.id)).toEqual(['retell', 'challenge'])
  })

  it('вариант, до которого игрок не дорос, в списке не показывается', () => {
    const world = makeSeminarWorld()
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.snapshot().seminar?.options.map((option) => option.id)).toEqual(['retell'])
  })

  it('у каждого варианта есть подпись и пояснение', () => {
    for (const option of preparedWorld().snapshot().seminar?.options ?? []) {
      expect(option.label.length, option.id).toBeGreaterThan(5)
      expect(option.hint.length, option.id).toBeGreaterThan(5)
    }
  })

  it('после выступления показывает оценку и ответ преподавателя', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')

    const snapshot = world.snapshot()
    expect(snapshot.canSpeakAtSeminar).toBe(false)
    expect(snapshot.seminar?.reason).toBe('Вы уже выступали')
    expect(snapshot.seminar?.speech?.optionId).toBe('retell')
    expect(snapshot.seminar?.speech?.reply).not.toBeNull()
  })

  it('ответ убирается по команде, а оценка остаётся', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')
    world.dismissSeminarSpeech()

    expect(world.snapshot().seminar?.speech).toBeNull()
    expect(world.study?.gradebook.gradeFor('greek', 'seminars')).not.toBeNull()
  })

  it('после звонка панель исчезает вместе с ответом', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')
    runUntil(world, FIRST.endMinutes + 5)
    expect(world.snapshot().seminar).toBeNull()
  })
})

/**
 * Расписание недельное: понедельничный семинар бывает шесть раз за модуль.
 * Выступление на первом из них не должно закрывать остальные пять — иначе
 * усреднять оценки было бы попросту не с чем.
 */
describe('World: тот же семинар неделей позже', () => {
  it('через неделю слово дают снова', () => {
    const world = preparedWorld()
    expect(world.commandSpeakAtSeminar('retell').ok).toBe(true)

    runUntilNextWeek(world, FIRST.startMinutes + 5)
    const snapshot = world.snapshot()
    expect(snapshot.canSpeakAtSeminar).toBe(true)
    expect(snapshot.seminar?.reason).toBeNull()
    // Прошлый ответ преподавателя не тащится в новую пару.
    expect(snapshot.seminar?.speech).toBeNull()
  })

  it('вторая оценка усредняется с первой, а не перезаписывает её', () => {
    const world = preparedWorld()
    const first = world.commandSpeakAtSeminar('retell')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(world.study?.gradebook.gradeFor('greek', 'seminars')).toBe(first.speech.grade)

    runUntilNextWeek(world, FIRST.startMinutes + 5)
    // На вторую пару студент приходит, не открыв текста: так видно, что
    // считается именно среднее, а не последняя оценка.
    world.skills = createSkills()

    const second = world.commandSpeakAtSeminar('retell')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.speech.grade).not.toBe(first.speech.grade)
    expect(world.study?.gradebook.gradeFor('greek', 'seminars')).toBe(
      roundGrade((first.speech.grade + second.speech.grade) / 2),
    )
  })

  it('дважды за новую пару слова всё так же не дают', () => {
    const world = preparedWorld()
    world.commandSpeakAtSeminar('retell')
    runUntilNextWeek(world, FIRST.startMinutes + 5)

    expect(world.commandSpeakAtSeminar('retell').ok).toBe(true)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы уже выступали',
    })
  })
})

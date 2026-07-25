import { describe, expect, it } from 'vitest'
import { isMoving } from './actor/Actor'
import type { DialogueCatalog, DialogueNode } from './dialogue/Dialogue'
import type { ChainCatalog, DialogueChainData } from './dialogue/DialogueChain'
import type { MoodletCatalog } from './needs/Moodlets'
import { npcRoom, type NpcSpec } from './npc/Npc'
import { createSkills, SKILL_IDS } from './player/Skills'
import type { Teacher, TeacherCatalog } from './social/Teacher'
import type { AttendanceMark } from './study/Attendance'
import type { CourseCatalog } from './study/Course'
import { roundGrade } from './study/Gradebook'
import {
  occurrenceId,
  PERIODS,
  validateSchedule,
  type Schedule,
} from './study/Schedule'
import type { SeminarOption } from './study/Seminar'
import { StudyState } from './study/StudyState'
import { MINUTES_PER_DAY } from './time/GameClock'
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

/**
 * Два места в том же коридоре, где стоят преподаватели.
 *
 * Места в домашнем помещении раздаются с равными промежутками, поэтому
 * в коридоре из девяти клеток «континентальный» оказывается в третьей,
 * «аналитический» — в седьмой. IN_CORRIDOR — это шаг от первого из них
 * и пять метров от второго; чтобы заговорить со вторым, надо встать рядом
 * с ним, а не просто зайти в тот же коридор.
 */
const NEXT_TO_ANALYTIC = { col: 7, row: 2 }
/**
 * Дальний конец коридора. «Континентальный» отсюда за шесть метров:
 * то же помещение, а разговаривать не с кем.
 */
const FAR_END_OF_CORRIDOR = { col: 8, row: 2 }

function makeStudyWorld(spawn: { col: number; row: number }): World {
  const study = new StudyState({
    courses: STUDY_COURSES,
    schedule: STUDY_SCHEDULE,
    essays: [],
  })
  return new World(STUDY_PLAN, spawn, {}, study)
}

/**
 * Закрывает экран, прерывающий игру.
 *
 * Ночь в два часа наступает сама, и после неё мир стоит, пока игрок
 * не прочитает итоги дня. Прокрутка времени в тестах обязана вести себя
 * как игрок: прочитать и нажать «Дальше», — иначе часы упрутся в первую же
 * ночь и никуда дальше не пойдут.
 */
function passDayScreens(world: World): void {
  world.dismissDaySummary()
  world.dismissWeekendReport()
}

/** Прокручивает игровое время до указанной минуты суток. */
function runUntil(world: World, minutes: number): void {
  world.clock.speed = 3
  for (let i = 0; i < 20000 && world.clock.time.minutes < minutes; i++) {
    world.tick(0.25)
    passDayScreens(world)
  }
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
    passDayScreens(world)
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

/**
 * Узел, все условия которого — про состояние игрока, а не про его умения:
 * что он помнит и в каком настроении пришёл.
 */
const MEMORY_NODE: DialogueNode = {
  id: 'continental-again',
  speakerId: 'continental',
  prompt: 'Опять вы. Ну, что на этот раз?',
  options: [
    { id: 'safe', text: 'Промолчать', effects: {}, reply: 'Понятно.' },
    {
      id: 'remembers',
      text: 'Напомнить о прошлом разговоре',
      requires: { visitedNode: 'continental-hall' },
      effects: { respect: 5 },
      reply: 'Помню, помню.',
    },
    {
      id: 'while-praised',
      text: 'Пользуясь случаем, попросить о большем',
      requires: { moodletId: 'praised' },
      effects: { affection: 4 },
      reply: 'Куйте железо.',
    },
    {
      id: 'not-while-sour',
      text: 'Спокойно возразить по существу',
      requires: { withoutMoodletId: 'elevator' },
      effects: { respect: 3 },
      reply: 'Возражайте.',
    },
  ],
}

const TALK_DIALOGUES: DialogueCatalog = {
  'continental-hall': talkNode('continental'),
  'analytic-hall': talkNode('analytic'),
  'continental-again': MEMORY_NODE,
}

const TALK_NPCS: NpcSpec[] = [
  { id: 'teacher-continental', teacherId: 'continental', courseIds: [], homeRoom: 'коридор' },
  { id: 'teacher-analytic', teacherId: 'analytic', courseIds: [], homeRoom: 'коридор' },
]

function makeTalkWorld(spawn = IN_CORRIDOR): World {
  return new World(STUDY_PLAN, spawn, {}, null, MOODLET_CATALOG, TALK_NPCS, {
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

  it('через весь коридор заговорить нельзя, хоть помещение и общее', () => {
    const world = makeTalkWorld(FAR_END_OF_CORRIDOR)
    const npc = world.npcManager.find('teacher-continental')!
    // Помещение то же самое — значит, отказ даёт именно расстояние.
    expect(world.currentRoom).toBe('коридор')
    expect(npcRoom(world.grid, npc)).toBe('коридор')

    expect(world.startDialogue('continental-hall')).toBe(false)
    expect(world.activeDialogue).toBeNull()
  })

  it('дойдя по коридору, заговорить наконец можно', () => {
    const world = makeTalkWorld(FAR_END_OF_CORRIDOR)
    expect(world.startDialogue('continental-hall')).toBe(false)

    world.commandApproachNpc('teacher-continental')
    world.clock.speed = 3
    for (let i = 0; i < 600 && isMoving(world.player); i++) world.tick(0.05)

    expect(world.startDialogue('continental-hall')).toBe(true)
  })

  it('со вторым преподавателем в том же коридоре разговор идёт с его места', () => {
    // Один коридор, двое, и заговорить можно с тем, рядом с кем стоишь.
    const world = makeTalkWorld(NEXT_TO_ANALYTIC)
    expect(world.startDialogue('continental-hall')).toBe(false)
    expect(world.startDialogue('analytic-hall')).toBe(true)
    expect(world.activeDialogue?.npcId).toBe('teacher-analytic')
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

describe('World: разговоры помнят друг о друге', () => {
  /** Идентификаторы реплик, открытых игроку в начатом разговоре. */
  function optionsOf(world: World): string[] {
    return world.activeDialogue?.options.map((option) => option.id) ?? []
  }

  it('нового человека мир не помнит ни по одному разговору', () => {
    expect(makeTalkWorld().visitedNodes).toEqual([])
  })

  it('начатый разговор попадает в память', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    expect(world.hasVisitedNode('continental-hall')).toBe(true)
  })

  it('второй заход в тот же узел памяти не удваивает', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.endDialogue()
    world.startDialogue('continental-hall')
    expect(world.visitedNodes).toEqual(['continental-hall'])
  })

  it('реплика про прошлый разговор закрыта, пока разговора не было', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-again')
    expect(optionsOf(world)).not.toContain('remembers')
  })

  it('после того разговора она открывается', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-hall')
    world.endDialogue()

    world.startDialogue('continental-again')
    expect(optionsOf(world)).toContain('remembers')
    expect(world.chooseOption('remembers')).toBe('Помню, помню.')
  })

  it('узел не открывает реплику про самого себя посреди себя же', () => {
    // Память снимается до того, как узел в неё попадает: иначе «вспомните
    // разговор» открывалось бы в том же разговоре, в котором сказано.
    const world = makeTalkWorld()
    world.startDialogue('continental-again')
    world.markNodeVisited('continental-hall')
    expect(optionsOf(world)).not.toContain('remembers')
  })
})

describe('World: реплики зависят от настроения', () => {
  function optionsOf(world: World): string[] {
    return world.activeDialogue?.options.map((option) => option.id) ?? []
  }

  it('реплика «пока не отпустило» закрыта без модификатора', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-again')
    expect(optionsOf(world)).not.toContain('while-praised')
  })

  it('и открыта, пока модификатор держится', () => {
    const world = makeTalkWorld()
    expect(world.addMoodletById('praised')).toBe(true)
    world.startDialogue('continental-again')
    expect(optionsOf(world)).toContain('while-praised')
  })

  it('просроченный модификатор реплику уже не открывает', () => {
    const world = makeTalkWorld()
    world.addMoodlet({ id: 'praised', label: 'Похвалили', mood: 10, durationMinutes: 30 })
    const expiresAt = world.clock.totalMinutes + 30
    world.clock.speed = 3
    for (let i = 0; i < 4000 && world.clock.totalMinutes <= expiresAt; i++) world.tick(0.25)

    world.startDialogue('continental-again')
    expect(optionsOf(world)).not.toContain('while-praised')
  })

  it('реплика «на трезвую голову» закрывается, когда настроение испорчено', () => {
    const world = makeTalkWorld()
    world.startDialogue('continental-again')
    expect(optionsOf(world)).toContain('not-while-sour')
    world.endDialogue()

    world.addMoodletById('elevator')
    world.startDialogue('continental-again')
    expect(optionsOf(world)).not.toContain('not-while-sour')
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
  /** Где надо встать, чтобы заговорить именно с этим человеком. */
  const SPOT: Record<string, { col: number; row: number }> = {
    'teacher-continental': IN_CORRIDOR,
    'teacher-analytic': NEXT_TO_ANALYTIC,
  }

  /** Уважение, заработанное одним и тем же ответом у одного из двоих. */
  function respectFrom(npcId: string, nodeId: string, faction: number): number {
    const world = makeTalkWorld(SPOT[npcId])
    world.faction = faction
    expect(world.startDialogue(nodeId), npcId).toBe(true)
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
      sleepSpotKind: null,
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
/* Многошаговые сцены                                                  */
/* ------------------------------------------------------------------ */

/**
 * Маленькая сцена на два шага и две концовки: прямая ветка ведёт к хорошему
 * исходу, осторожная — к никакому. Третья реплика заперта навыком: на ней
 * проверяется, что закрытые строки видны, но нажать их нельзя.
 */
const CHAIN: DialogueChainData = {
  id: 'у-автомата',
  speakerId: 'continental',
  intro: 'Вы столкнулись у кофейного автомата.',
  startId: 'start',
  nodes: [
    {
      id: 'start',
      speakerId: 'continental',
      prompt: 'Ну и что вы об этом думаете?',
      options: [
        {
          id: 'plain',
          text: 'Ответить прямо, без оговорок',
          tone: 'direct',
          effects: { respect: 10, faction: 4 },
          reply: 'Так. Уже лучше.',
          consequence: 'Он оценил, что вы не стали юлить.',
          next: 'second',
        },
        {
          id: 'rude',
          text: 'Надерзить и посмотреть, что будет',
          tone: 'bold',
          effects: { affection: -12, respect: 2, moodletId: 'elevator' },
          reply: 'Смело. Продолжайте.',
          consequence: 'Шпилька попала, и он этого не скрыл.',
          next: 'second',
        },
        {
          id: 'locked',
          text: 'Ответить цитатой из оригинала',
          tone: 'scholarly',
          requires: { skillId: 'ancientLanguages', skillMin: 4 },
          effects: { respect: 14, skill: { id: 'ancientLanguages', amount: 1 } },
          reply: 'Надо же. Вы читали.',
          consequence: 'Цитата у автомата — он не ожидал.',
          next: 'second',
        },
      ],
    },
    {
      id: 'second',
      speakerId: 'continental',
      prompt: 'И что из этого следует?',
      options: [
        {
          id: 'finish-good',
          text: 'Довести мысль до конца',
          tone: 'direct',
          effects: { affection: 8 },
          reply: 'Хорошо. Договорили.',
          consequence: 'Вы довели мысль и не спрятались.',
          next: 'end-good',
        },
        {
          id: 'finish-bad',
          text: 'Сдать назад, пока не поздно',
          tone: 'cautious',
          effects: { respect: -6 },
          reply: 'Понятно.',
          consequence: 'Вы отступили с уже занятой позиции.',
          next: 'end-bad',
        },
      ],
    },
    {
      id: 'end-good',
      speakerId: 'continental',
      prompt: 'Приходите на семинар, там договорим.',
      options: [],
      ending: {
        id: 'good',
        title: 'Разошлись собеседниками',
        summary: 'Он вас запомнил, и запомнил с хорошей стороны.',
        moodletId: 'praised',
      },
    },
    {
      id: 'end-bad',
      speakerId: 'continental',
      prompt: 'Идите, идите.',
      options: [],
      ending: {
        id: 'bad',
        title: 'Разошлись никем',
        summary: 'Вашего лица он не запомнил.',
      },
    },
  ],
}

const CHAINS: ChainCatalog = {
  'у-автомата': { chain: CHAIN, room: 'коридор', once: true },
}

function makeChainWorld(spawn = IN_CORRIDOR, chains: ChainCatalog = CHAINS): World {
  return new World(STUDY_PLAN, spawn, {}, null, MOODLET_CATALOG, TALK_NPCS, {
    teachers: TALK_TEACHERS,
    dialogues: TALK_DIALOGUES,
    chains,
  })
}

describe('World: начало многошаговой сцены', () => {
  it('мир без сцен молча отказывает', () => {
    expect(makeWorld().startChainDialogue('у-автомата')).toBe(false)
    expect(makeWorld().activeChain).toBeNull()
  })

  it('несуществующая сцена не начинается', () => {
    expect(makeChainWorld().startChainDialogue('нет-такой')).toBe(false)
  })

  it('в одном помещении с собеседником сцена начинается', () => {
    const world = makeChainWorld()
    expect(world.startChainDialogue('у-автомата')).toBe(true)
    expect(world.activeChain?.npcId).toBe('teacher-continental')
  })

  it('из другого помещения сцену не завести', () => {
    const world = makeChainWorld(IN_CLASS)
    expect(world.startChainDialogue('у-автомата')).toBe(false)
    expect(world.activeChain).toBeNull()
  })

  it('через весь коридор сцену не завести', () => {
    const world = makeChainWorld(FAR_END_OF_CORRIDOR)
    expect(world.currentRoom).toBe('коридор')
    expect(world.startChainDialogue('у-автомата')).toBe(false)
    expect(world.activeChain).toBeNull()
  })

  it('издалека сцену не подсказывают, даже стоя в её помещении', () => {
    const world = makeChainWorld(FAR_END_OF_CORRIDOR)
    expect(world.availableChains()).toEqual([])
    expect(world.chainForNpc('teacher-continental')).toBeNull()
  })

  it('подойдя по коридору, сцену наконец заводят', () => {
    const world = makeChainWorld(FAR_END_OF_CORRIDOR)
    world.commandApproachNpc('teacher-continental')
    world.clock.speed = 3
    for (let i = 0; i < 600 && isMoving(world.player); i++) world.tick(0.05)

    expect(world.chainForNpc('teacher-continental')).toBe('у-автомата')
    expect(world.startChainDialogue('у-автомата')).toBe(true)
  })

  it('сцена привязана к помещению: в чужой комнате её нет', () => {
    // Собеседник рядом, но сцена написана для коридора, а стоят оба
    // в аудитории — значит, это не она.
    const chains: ChainCatalog = {
      'у-автомата': { chain: CHAIN, room: 'туалеты' },
    }
    const world = makeChainWorld(IN_CORRIDOR, chains)
    expect(world.startChainDialogue('у-автомата')).toBe(false)
  })

  it('сцена без привязки к помещению годится везде, где собеседник рядом', () => {
    const world = makeChainWorld(IN_CORRIDOR, { 'у-автомата': { chain: CHAIN } })
    expect(world.startChainDialogue('у-автомата')).toBe(true)
  })

  it('сцена останавливает шаг: на ходу не разговаривают', () => {
    const world = makeChainWorld()
    expect(world.commandMoveTo({ col: 8, row: 2 })).toBe(true)
    world.startChainDialogue('у-автомата')
    expect(isMoving(world.player)).toBe(false)
  })

  it('сцена закрывает начатый короткий разговор', () => {
    const world = makeChainWorld()
    world.startDialogue('continental-hall')
    world.startChainDialogue('у-автомата')
    expect(world.activeDialogue).toBeNull()
    expect(world.activeChain).not.toBeNull()
  })

  it('одноразовую сцену второй раз не предлагают', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-good')
    world.endChainDialogue()

    expect(world.playedChains).toEqual(['у-автомата'])
    expect(world.availableChains()).toEqual([])
    expect(world.startChainDialogue('у-автомата')).toBe(false)
  })

  it('брошенная на середине сцена сыгранной не считается', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.endChainDialogue()

    expect(world.playedChains).toEqual([])
    expect(world.startChainDialogue('у-автомата')).toBe(true)
  })

  it('подсказывает, какую сцену можно завести с этим человеком', () => {
    const world = makeChainWorld()
    expect(world.availableChains()).toEqual(['у-автомата'])
    expect(world.chainForNpc('teacher-continental')).toBe('у-автомата')
    expect(world.chainForNpc('teacher-analytic')).toBeNull()
  })

  it('издалека сцену не подсказывают', () => {
    const world = makeChainWorld(IN_CLASS)
    expect(world.availableChains()).toEqual([])
    expect(world.chainForNpc('teacher-continental')).toBeNull()
  })
})

describe('World: ход многошаговой сцены', () => {
  it('первый узел показывает завязку, реплику и ответы с тоном', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')

    const chain = world.snapshot().activeChain
    expect(chain?.chainId).toBe('у-автомата')
    expect(chain?.speakerId).toBe('continental')
    expect(chain?.intro).toContain('кофейного автомата')
    expect(chain?.nodeId).toBe('start')
    expect(chain?.prompt).toBe('Ну и что вы об этом думаете?')
    expect(chain?.options.map((option) => option.tone)).toEqual([
      'direct',
      'bold',
      'scholarly',
    ])
    expect(chain?.options.map((option) => option.toneLabel)).toEqual([
      'прямо',
      'дерзко',
      'по-учёному',
    ])
    expect(chain?.awaitingContinue).toBe(false)
    expect(chain?.outcome).toBeNull()
  })

  it('закрытая реплика видна серой и с намёком, чего не хватает', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')

    const locked = world.snapshot().activeChain?.options.find((o) => o.id === 'locked')
    expect(locked?.available).toBe(false)
    expect(locked?.lockHint).toBe('нужны древние языки')
    expect(locked?.text).toBe('Ответить цитатой из оригинала')
  })

  it('закрытая по настроению реплика называет, чего именно ждут', () => {
    const chain: DialogueChainData = {
      ...CHAIN,
      nodes: CHAIN.nodes.map((node) =>
        node.id === 'start'
          ? {
              ...node,
              options: node.options.map((option) =>
                option.id === 'locked'
                  ? { ...option, requires: { moodletId: 'praised' } }
                  : option,
              ),
            }
          : node,
      ),
    }
    const world = makeChainWorld(IN_CORRIDOR, { 'у-автомата': { chain, room: 'коридор' } })
    world.startChainDialogue('у-автомата')

    const locked = world.snapshot().activeChain?.options.find((o) => o.id === 'locked')
    expect(locked?.available).toBe(false)
    // Подпись берётся из каталога модификаторов, а не выдумывается на месте.
    expect(locked?.lockHint).toBe('нужно, чтобы ещё держалось «Похвалил Михайловский»')
  })

  it('прокачанному игроку та же реплика открыта и без подсказки', () => {
    const world = makeChainWorld()
    world.skills = createSkills({ ancientLanguages: 6 })
    world.startChainDialogue('у-автомата')

    const locked = world.snapshot().activeChain?.options.find((o) => o.id === 'locked')
    expect(locked?.available).toBe(true)
    expect(locked?.lockHint).toBeNull()
  })

  it('закрытую реплику выбрать нельзя, и сцена от этого не падает', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')

    expect(world.chooseChainOption('locked')).toBeNull()
    expect(world.snapshot().activeChain?.nodeId).toBe('start')
    expect(world.relationships.get('teacher-continental').respect).toBe(0)
  })

  it('несуществующую реплику мир отвергает молча', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    expect(world.chooseChainOption('нет-такой')).toBeNull()
  })

  it('без начатой сцены выбирать нечего', () => {
    expect(makeChainWorld().chooseChainOption('plain')).toBeNull()
  })

  it('выбор даёт ответ собеседника и последствие словами', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')

    const step = world.chooseChainOption('plain')
    expect(step?.reply).toBe('Так. Уже лучше.')
    expect(step?.consequence?.reason).toBe('Он оценил, что вы не стали юлить.')
    expect(step?.consequence?.text).not.toMatch(/\d/)
    expect(step?.consequence?.changes.map((change) => change.dimension)).toEqual([
      'respect',
      'faction',
    ])
    expect(step?.awaitingContinue).toBe(true)
  })

  it('пока ответ на экране, нового выбора не предлагают', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')

    expect(world.snapshot().activeChain?.options).toEqual([])
    expect(world.chooseChainOption('finish-good')).toBeNull()
  })

  it('ответ и следующая реплика не показываются разом и задом наперёд', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')

    const answered = world.snapshot().activeChain
    expect(answered?.reply).toBe('Так. Уже лучше.')
    expect(answered?.prompt).toBeNull()
    expect(answered?.intro).toBeNull()

    world.continueChainDialogue()
    const next = world.snapshot().activeChain
    expect(next?.prompt).toBe('И что из этого следует?')
    expect(next?.reply).toBeNull()
  })

  it('повторное «дальше» ничего не двигает', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    expect(world.continueChainDialogue()).toBe(true)
    expect(world.continueChainDialogue()).toBe(false)
    expect(world.snapshot().activeChain?.nodeId).toBe('second')
  })

  it('«дальше» убирает ответ и открывает следующий выбор', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    expect(world.continueChainDialogue()).toBe(true)

    const chain = world.snapshot().activeChain
    expect(chain?.nodeId).toBe('second')
    expect(chain?.prompt).toBe('И что из этого следует?')
    expect(chain?.reply).toBeNull()
    expect(chain?.consequence).toBeNull()
    expect(chain?.options.map((option) => option.id)).toEqual(['finish-good', 'finish-bad'])
  })

  it('завязка показывается один раз', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    expect(world.snapshot().activeChain?.intro).toBeNull()
  })

  it('концовка приходит с названием, итогом и последней репликой', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-good')
    world.continueChainDialogue()

    const chain = world.snapshot().activeChain
    expect(chain?.nodeId).toBeNull()
    expect(chain?.prompt).toBe('Приходите на семинар, там договорим.')
    expect(chain?.options).toEqual([])
    expect(chain?.outcome?.endingId).toBe('good')
    expect(chain?.outcome?.title).toBe('Разошлись собеседниками')
    expect(chain?.outcome?.closing).toContain('В сумме')
    expect(chain?.outcome?.closing).not.toMatch(/\d/)
  })

  it('разные ответы ведут к разным концовкам', () => {
    function endingOf(second: string): string | undefined {
      const world = makeChainWorld()
      world.startChainDialogue('у-автомата')
      world.chooseChainOption('plain')
      world.continueChainDialogue()
      return world.chooseChainOption(second)?.outcome?.endingId
    }
    expect(endingOf('finish-good')).toBe('good')
    expect(endingOf('finish-bad')).toBe('bad')
  })

  it('закрытие окна не отменяет применённых эффектов', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('rude')
    world.endChainDialogue()

    expect(world.snapshot().activeChain).toBeNull()
    expect(world.relationships.get('teacher-continental').affection).toBe(-12)
  })
})

describe('World: эффекты многошаговой сцены', () => {
  it('симпатия и уважение уходят в карту отношений', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('rude')

    const relationship = world.relationships.get('teacher-continental')
    expect(relationship.affection).toBe(-12)
    expect(relationship.respect).toBeGreaterThan(0)
  })

  it('прирост уважения проходит через близость взглядов', () => {
    function respectFrom(faction: number): number {
      const world = makeChainWorld()
      world.faction = faction
      world.startChainDialogue('у-автомата')
      world.chooseChainOption('plain')
      return world.relationships.get('teacher-continental').respect
    }
    const asOwn = respectFrom(85)
    const asStranger = respectFrom(-100)
    expect(asOwn).toBeGreaterThan(asStranger)
    expect(asStranger).toBeGreaterThan(0)
  })

  it('потеря уважения идёт в полном размере', () => {
    function penalty(faction: number): number {
      const world = makeChainWorld()
      world.faction = faction
      world.startChainDialogue('у-автомата')
      world.chooseChainOption('plain')
      const before = world.relationships.get('teacher-continental').respect
      world.continueChainDialogue()
      world.chooseChainOption('finish-bad')
      return world.relationships.get('teacher-continental').respect - before
    }
    expect(penalty(85)).toBe(-6)
    expect(penalty(-85)).toBe(-6)
  })

  it('сдвигает игрока по шкале традиций', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    expect(world.faction).toBe(4)
  })

  it('качает навык через общий замедлитель прокачки', () => {
    const world = makeChainWorld()
    world.skills = createSkills({ ancientLanguages: 6 })
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('locked')

    expect(world.skills.ancientLanguages).toBeGreaterThan(6)
    expect(world.skills.ancientLanguages).toBeLessThan(7)
  })

  it('реплика вешает свой модификатор настроения', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('rude')
    expect(world.moodlets.has('elevator')).toBe(true)
  })

  it('концовка вешает свой', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-good')

    expect(world.moodlets.has('praised')).toBe(true)
    expect(world.snapshot().activeMoodlets.map((item) => item.label)).toContain(
      'Похвалил Михайловский',
    )
  })

  it('концовка без модификатора настроения ничего не вешает', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-bad')
    expect(world.snapshot().activeMoodlets).toEqual([])
  })
})

/*
 * Слова о последствиях обязаны совпадать с последствиями.
 *
 * Множитель близости взглядов умножает прирост уважения, и до починки
 * разговор об этом не знал: реплика объявляла десятку, у преподавателя
 * с другого полюса шкалы применялось два с половиной, а игрок в обоих
 * случаях читал одно и то же.
 */
describe('World: описание последствий считается по применённому', () => {
  /** Та же сцена, слово в слово, но у преподавателя с другого полюса. */
  function chainFor(speakerId: string): DialogueChainData {
    const copy = JSON.parse(JSON.stringify(CHAIN)) as DialogueChainData
    copy.id = `у-автомата-${speakerId}`
    copy.speakerId = speakerId
    for (const node of copy.nodes) node.speakerId = speakerId
    return copy
  }

  const TWO_TEACHERS: ChainCatalog = {
    'у-континентального': { chain: chainFor('continental'), room: 'коридор' },
    'у-аналитика': { chain: chainFor('analytic'), room: 'коридор' },
  }

  /** Мир, в котором игрок стоит вплотную к нужному собеседнику. */
  function worldNear(spot: { col: number; row: number }, faction: number): World {
    const world = makeChainWorld(spot, TWO_TEACHERS)
    world.faction = faction
    return world
  }

  /** Что игрок прочтёт после одной и той же реплики у этого преподавателя. */
  function consequenceOf(chainId: string, spot: { col: number; row: number }): string {
    const world = worldNear(spot, 85)
    expect(world.startChainDialogue(chainId), chainId).toBe(true)
    return world.chooseChainOption('plain')?.consequence?.text ?? ''
  }

  it('одна и та же реплика у своего и у чужого описывается разными словами', () => {
    // Континентальный студент (+85) стоит на позиции Михайловского
    // и на другом конце шкалы от Долгорукова.
    const own = consequenceOf('у-континентального', IN_CORRIDOR)
    const stranger = consequenceOf('у-аналитика', NEXT_TO_ANALYTIC)

    expect(own).toContain('Уважение сильно выросло')
    expect(stranger).toContain('Уважение чуть заметно выросло')
    expect(own).not.toBe(stranger)
  })

  it('слова сходятся с тем, что стало с отношениями', () => {
    const world = worldNear(NEXT_TO_ANALYTIC, 85)
    world.startChainDialogue('у-аналитика')
    const step = world.chooseChainOption('plain')

    const described = step?.consequence?.changes.find((item) => item.dimension === 'respect')
    const applied = world.relationships.get('teacher-analytic').respect
    expect(described?.delta).toBeCloseTo(applied, 6)
    // Объявлено в реплике десять — применилось заметно меньше.
    expect(applied).toBeLessThan(10)
  })

  it('итоговая сводка сходится с накопленным уважением', () => {
    const world = worldNear(NEXT_TO_ANALYTIC, 85)
    world.startChainDialogue('у-аналитика')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    const finished = world.chooseChainOption('finish-good')

    const total = finished?.outcome?.changes.find((item) => item.dimension === 'respect')
    expect(total?.delta).toBeCloseTo(world.relationships.get('teacher-analytic').respect, 6)
  })

  it('множитель применяется один раз, а не дважды', () => {
    const world = worldNear(IN_CORRIDOR, 85)
    world.startChainDialogue('у-континентального')
    world.chooseChainOption('plain')
    // Своему десятка приносит полторы: множитель ровно один, и он же
    // описан словами. Двойной счёт дал бы двадцать две с половиной.
    expect(world.relationships.get('teacher-continental').respect).toBeCloseTo(15, 6)
  })
})

describe('World: сцена остаётся в памяти', () => {
  it('начатая сцена запоминается с первого же узла', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    expect(world.visitedNodes).toEqual(['start'])
  })

  it('пройденный путь запоминается целиком, включая концовку', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-good')

    expect(world.visitedNodes).toEqual(['start', 'second', 'end-good'])
  })

  it('концовки разных путей различимы: помнится не сцена, а её конец', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.continueChainDialogue()
    world.chooseChainOption('finish-bad')

    expect(world.hasVisitedNode('end-bad')).toBe(true)
    expect(world.hasVisitedNode('end-good')).toBe(false)
  })

  it('брошенная на середине сцена помнится ровно до места, где её бросили', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    world.chooseChainOption('plain')
    world.endChainDialogue()

    expect(world.hasVisitedNode('second')).toBe(true)
    expect(world.hasVisitedNode('end-good')).toBe(false)
  })
})

describe('World: короткие разговоры остались прежними', () => {
  it('одношаговый разговор работает в мире со сценами', () => {
    const world = makeChainWorld()
    expect(world.startDialogue('continental-hall')).toBe(true)
    expect(world.chooseOption('smart')).toBe('Уже лучше.')
    expect(world.snapshot().activeChain).toBeNull()
  })

  it('посреди сцены короткий разговор не начинается', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    expect(world.startDialogue('continental-hall')).toBe(false)
    expect(world.snapshot().activeDialogue).toBeNull()
  })

  it('посреди сцены не начинается и вторая сцена', () => {
    const world = makeChainWorld()
    world.startChainDialogue('у-автомата')
    expect(world.availableChains()).toEqual([])
    expect(world.startChainDialogue('у-автомата')).toBe(false)
    expect(world.snapshot().activeChain?.nodeId).toBe('start')
  })

  it('в мире без сцен снимок про них молчит', () => {
    const snapshot = makeTalkWorld().snapshot()
    expect(snapshot.activeChain).toBeNull()
    expect(snapshot.availableChains).toEqual([])
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

  /*
   * Живая игра, пункт 3 списка проблем: «первый семинар у Алиевой прошёл
   * нормально, на следующем занятии выступить уже не получилось». Следующим
   * занятием была лекция — и молчала об этом вся игра сразу: панель на
   * лекции исчезала целиком, а команда отвечала общим «сейчас не семинар»,
   * тем же самым, что и в пустом коридоре в полночь.
   */
  it('на лекции игра называет причину, а не отмалчивается', () => {
    const world = makeSeminarWorld(IN_LECTURE_ROOM)
    runUntil(world, PERIODS[1]!.startMinutes + 5)
    expect(markOf(world, 'histphil-mon')).toBe('present')
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Идёт лекция: здесь слушают, а выступают на семинарах',
    })

    // Панель на лекции остаётся и объясняет, почему выступать не с чем.
    const seminar = world.snapshot().seminar
    expect(seminar?.kind).toBe('lecture')
    expect(seminar?.canSpeak).toBe(false)
    expect(seminar?.reason).toContain('лекция')
    expect(seminar?.courseId).toBe('histphil')
  })

  it('вне пары причина другая: сидеть не на чем', () => {
    const world = makeSeminarWorld(IN_CORRIDOR)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Сейчас не семинар',
    })
    expect(world.snapshot().seminar).toBeNull()
  })

  it('дважды за одну пару слова не дают', () => {
    const world = preparedWorld()
    expect(world.commandSpeakAtSeminar('retell').ok).toBe(true)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы уже выступали — слово дают раз за пару',
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
    expect(snapshot.seminar?.reason).toBe('Вы уже выступали — слово дают раз за пару')
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
      reason: 'Вы уже выступали — слово дают раз за пару',
    })
  })
})

/**
 * Два занятия одного курса на одной неделе, в разные дни.
 *
 * Первым делом это сторож занятой личности пары. «Уже выступал» помечает
 * конкретное проведение — день плюс слот расписания, — и ключ обязан
 * различать понедельничный греческий и средовый. Свести их в один
 * (по курсу, по преподавателю, по слоту расписания) значит отдать игроку
 * одно слово за весь модуль: первое выступление закрыло бы все остальные.
 *
 * Второе — сторож обратной ошибки: пара не должна давать слово дважды,
 * иначе среднее за модуль накручивается на одном и том же семинаре.
 */
const TWO_DAY_SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'greek-wed', courseId: 'greek', kind: 'seminar', weekday: 2, period: 0, room: 'А-204' },
]

function makeTwoDayWorld(): World {
  const study = new StudyState({
    courses: SEMINAR_COURSES,
    schedule: TWO_DAY_SCHEDULE,
    essays: [],
    seminarOptions: SEMINAR_OPTIONS,
  })
  const world = new World(STUDY_PLAN, IN_CLASS, {}, study, SEMINAR_MOODLETS, SEMINAR_NPCS, {
    teachers: SEMINAR_TEACHERS,
    dialogues: {},
  })
  world.skills = createSkills({ ancientLanguages: 9, eloquence: 9, endurance: 9 })
  world.faction = 85
  return world
}

/** Прокручивает время до указанной минуты указанного дня. */
function runUntilDay(world: World, day: number, minutes: number): void {
  world.clock.speed = 3
  const target = day * MINUTES_PER_DAY + minutes
  for (let i = 0; i < 200000 && world.clock.totalMinutes < target; i++) {
    world.tick(0.25)
    passDayScreens(world)
  }
  expect(world.clock.time.day).toBe(day)
  expect(world.clock.time.minutes).toBeGreaterThanOrEqual(minutes)
}

describe('World: два занятия одного курса в разные дни', () => {
  it('выступить можно на каждом, и ровно по одному разу', () => {
    const world = makeTwoDayWorld()

    runUntilDay(world, 0, FIRST.startMinutes + 5)
    expect(world.snapshot().seminar?.lessonId).toBe('greek-mon')
    const monday = world.commandSpeakAtSeminar('retell')
    expect(monday.ok).toBe(true)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы уже выступали — слово дают раз за пару',
    })

    runUntilDay(world, 2, FIRST.startMinutes + 5)
    expect(world.snapshot().seminar?.lessonId).toBe('greek-wed')
    // Понедельничное выступление не тащится в среду ни ответом, ни запретом.
    expect(world.snapshot().seminar?.speech).toBeNull()
    expect(world.snapshot().canSpeakAtSeminar).toBe(true)

    const wednesday = world.commandSpeakAtSeminar('retell')
    expect(wednesday.ok).toBe(true)
    expect(world.commandSpeakAtSeminar('retell')).toEqual({
      ok: false,
      reason: 'Вы уже выступали — слово дают раз за пару',
    })

    if (!monday.ok || !wednesday.ok) return
    // Два разных проведения, две записи в журнале — и среднее из двух.
    expect(monday.speech.occurrenceId).not.toBe(wednesday.speech.occurrenceId)
    expect(world.study?.spokenCount).toBe(2)
    expect(world.study?.gradebook.gradeFor('greek', 'seminars')).toBe(
      roundGrade((monday.speech.grade + wednesday.speech.grade) / 2),
    )
  })

  it('повторённый идентификатор занятия ловится проверкой расписания', () => {
    // Именно из id собирается ключ проведения. Два занятия с одним id в один
    // день слиплись бы в одно: отметка о присутствии на первом закрывала бы
    // второе, а выступление на первом отнимало бы слово на втором.
    const clash: Schedule = [
      ...TWO_DAY_SCHEDULE,
      { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 2, room: 'А-204' },
    ]
    expect(validateSchedule(clash).join(' ')).toContain('повторяется')
    expect(validateSchedule(TWO_DAY_SCHEDULE)).toEqual([])
  })
})

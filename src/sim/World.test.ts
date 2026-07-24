import { describe, expect, it } from 'vitest'
import type { CourseCatalog } from './study/Course'
import { PERIODS, type Schedule } from './study/Schedule'
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

describe('World: учёба', () => {
  it('засчитывает присутствие, если персонаж стоит в нужной аудитории', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.study?.attendance.markFor('greek-mon')).toBe('present')
  })

  it('ставит прогул, если персонаж простоял пару в коридоре', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 5)
    expect(world.study?.attendance.markFor('greek-mon')).toBeNull()

    runUntil(world, FIRST.endMinutes + 5)
    expect(world.study?.attendance.markFor('greek-mon')).toBe('absent')
  })

  it('ставит прогул, если персонаж просидел пару в соседней аудитории', () => {
    const world = makeStudyWorld(IN_OTHER_CLASS)
    runUntil(world, FIRST.endMinutes + 5)
    expect(world.study?.attendance.markFor('greek-mon')).toBe('absent')
  })

  it('засчитывает опоздание тому, кто дошёл до аудитории к середине пары', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    runUntil(world, FIRST.startMinutes + 30)
    world.commandMoveTo(IN_CLASS)
    runUntil(world, FIRST.startMinutes + 40)
    expect(world.study?.attendance.markFor('greek-mon')).toBe('late')
  })

  it('не перезаписывает отметку, если персонаж досидел пару до звонка', () => {
    const world = makeStudyWorld(IN_CLASS)
    runUntil(world, FIRST.endMinutes + 30)
    expect(world.study?.attendance.markFor('greek-mon')).toBe('present')
  })

  it('на паузе посещаемость не меняется', () => {
    const world = makeStudyWorld(IN_CORRIDOR)
    world.clock.speed = 0
    world.tick(1)
    expect(world.study?.attendance.markFor('greek-mon')).toBeNull()
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

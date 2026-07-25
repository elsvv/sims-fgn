import { describe, expect, it } from 'vitest'
import { isMoving } from '../actor/Actor'
import { PERIODS, type Schedule } from '../study/Schedule'
import { GAME_MINUTES_PER_REAL_SECOND } from '../time/GameClock'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import {
  ARRIVE_BEFORE_MINUTES,
  NpcManager,
  npcRoom,
  roomCells,
  teachingSpot,
  type NpcSpec,
} from './Npc'

/**
 * Учебный этаж в миниатюре: две аудитории сверху, коридор снизу,
 * дверные проёмы — сами клетки пола под аудиториями. Доска в А-204
 * стоит в переднем ряду и непроходима: на ней проверяется, что
 * преподаватель встаёт рядом с доской, а не пытается влезть в неё.
 */
const PLAN: FloorPlan = {
  id: 'npc-test',
  name: 'Тестовый этаж',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: [
    '....#....',
    '....#....',
    '.........',
  ],
  props: [{ id: 'board', kind: 'whiteboard', col: 1, row: 0, rotation: 0, blocks: true }],
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 0, row0: 0, col1: 3, row1: 1 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 5, row0: 0, col1: 8, row1: 1 },
    { id: 'коридор', name: 'Коридор', col0: 0, row0: 2, col1: 8, row1: 2 },
  ],
}

const FIRST = PERIODS[0]!
const SECOND = PERIODS[1]!

const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'logic-mon', courseId: 'logic', kind: 'lecture', weekday: 0, period: 1, room: 'А-206' },
]

const ALIEVA: NpcSpec = {
  id: 'teacher-alieva',
  teacherId: 'alieva',
  courseIds: ['greek'],
  homeRoom: 'коридор',
}

const DOLGORUKOV: NpcSpec = {
  id: 'teacher-dolgorukov',
  teacherId: 'dolgorukov',
  courseIds: ['logic'],
  homeRoom: 'коридор',
}

/** Вахтёр: никаких курсов, из коридора не уходит. */
const IDLER: NpcSpec = {
  id: 'idler',
  teacherId: null,
  courseIds: [],
  homeRoom: 'коридор',
}

function makeGrid(): NavGrid {
  return new NavGrid(PLAN)
}

function makeManager(specs: NpcSpec[], grid: NavGrid, schedule: Schedule = SCHEDULE): NpcManager {
  return new NpcManager(specs, grid, schedule)
}

/**
 * Прокручивает время от одной минуты суток до другой.
 * Игровые минуты переводятся в масштабированные секунды тем же множителем,
 * что и в GameClock, — иначе тест мерил бы скорость, отличную от игровой.
 */
function run(
  manager: NpcManager,
  grid: NavGrid,
  from: number,
  to: number,
  day = 0,
  stepMinutes = 0.5,
): void {
  for (let minutes = from; minutes < to; minutes += stepMinutes) {
    manager.tick(grid, stepMinutes / GAME_MINUTES_PER_REAL_SECOND, day, minutes)
  }
}

describe('клетки помещений', () => {
  it('возвращает только проходимые клетки помещения', () => {
    const grid = makeGrid()
    const cells = roomCells(grid, 'А-204')
    expect(cells.length).toBe(7) // 4×2 клетки минус доска
    for (const cell of cells) {
      expect(grid.roomAt(cell)?.id).toBe('А-204')
      expect(grid.isWalkable(cell)).toBe(true)
    }
  })

  it('у несуществующего помещения клеток нет', () => {
    expect(roomCells(makeGrid(), 'преподавательская')).toEqual([])
  })

  it('место преподавателя — передний ряд, но не клетка доски', () => {
    const spot = teachingSpot(makeGrid(), 'А-204')
    expect(spot).not.toBeNull()
    expect(spot?.row).toBe(0)
    expect(spot).not.toEqual({ col: 1, row: 0 })
  })

  it('у помещения без клеток места нет', () => {
    expect(teachingSpot(makeGrid(), 'преподавательская')).toBeNull()
  })
})

describe('NpcManager: расстановка', () => {
  it('ставит NPC в его домашнее помещение', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')
    expect(npc).toBeDefined()
    expect(npcRoom(grid, npc!)).toBe('коридор')
  })

  it('двое в одном помещении стоят в разных клетках', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA, DOLGORUKOV, IDLER], grid)
    const spots = manager.list.map((npc) => `${npc.actor.position.x},${npc.actor.position.z}`)
    expect(new Set(spots).size).toBe(spots.length)
  })

  it('сохраняет ссылку на преподавателя и домашнее помещение', () => {
    const npc = makeManager([ALIEVA], makeGrid()).find('teacher-alieva')
    expect(npc?.teacherId).toBe('alieva')
    expect(npc?.homeRoom).toBe('коридор')
  })

  it('NPC с несуществующим помещением не ломает мир', () => {
    const grid = makeGrid()
    const manager = makeManager(
      [{ id: 'ghost', teacherId: null, courseIds: [], homeRoom: 'преподавательская' }],
      grid,
    )
    const npc = manager.find('ghost')
    expect(npc).toBeDefined()
    expect(grid.isWalkable(grid.worldToGrid(npc!.actor.position))).toBe(true)
    expect(() => run(manager, grid, 8 * 60, 9 * 60)).not.toThrow()
  })

  it('пустой список — пустой мир', () => {
    const grid = makeGrid()
    const manager = makeManager([], grid)
    expect(manager.list).toEqual([])
    expect(manager.snapshot()).toEqual([])
    expect(() => manager.tick(grid, 1, 0, 600)).not.toThrow()
  })
})

describe('NpcManager: распорядок', () => {
  it('к началу пары преподаватель стоит в нужной аудитории', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes)
    expect(npcRoom(grid, npc)).toBe('А-204')
    expect(isMoving(npc.actor)).toBe(false)
  })

  it('до выхода из дома преподаватель сидит в коридоре', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, 7 * 60, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES - 5)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('остаётся в аудитории до звонка', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.endMinutes - 1)
    expect(npcRoom(grid, npc)).toBe('А-204')
  })

  it('после пары уходит из аудитории домой', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.endMinutes)
    expect(npcRoom(grid, npc)).toBe('А-204')

    run(manager, grid, FIRST.endMinutes, FIRST.endMinutes + 40)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('у доски преподаватель развёрнут к аудитории, а не к стене', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes)
    // Аудитория лежит ниже переднего ряда по оси Z, значит взгляд идёт туда же.
    expect(Math.sin(npc.actor.facing)).toBeGreaterThan(0.5)
  })

  it('в выходной никто никуда не идёт', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    // День 6 — воскресенье: занятий нет, значит и повода выходить нет.
    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.endMinutes, 6)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('чужая пара преподавателя не касается', () => {
    const grid = makeGrid()
    const manager = makeManager([DOLGORUKOV], grid)
    const npc = manager.find('teacher-dolgorukov')!

    // Пара греческого идёт, до своей логики ему ещё больше часа.
    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes + 10)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('NPC без курсов остаётся дома весь день', () => {
    const grid = makeGrid()
    const manager = makeManager([IDLER], grid)
    const npc = manager.find('idler')!

    run(manager, grid, 8 * 60, 18 * 60, 0, 2)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('двое преподавателей расходятся по своим аудиториям и не путаются', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA, DOLGORUKOV], grid)
    const alieva = manager.find('teacher-alieva')!
    const dolgorukov = manager.find('teacher-dolgorukov')!

    // Пара греческого идёт, до логики ещё далеко.
    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes + 10)
    expect(npcRoom(grid, alieva)).toBe('А-204')
    expect(npcRoom(grid, dolgorukov)).toBe('коридор')

    // Логика началась: греческий кончился, преподаватели поменялись местами.
    run(manager, grid, FIRST.startMinutes + 10, SECOND.startMinutes + 20)
    expect(npcRoom(grid, alieva)).toBe('коридор')
    expect(npcRoom(grid, dolgorukov)).toBe('А-206')
  })

  it('одновременные пары в разных аудиториях не смешиваются', () => {
    const grid = makeGrid()
    // Расписание нарочно невозможное для студента — двух пар в одно время
    // у него не бывает, — но для NPC это проверка, что каждый видит только
    // своё занятие.
    const parallel: Schedule = [
      { id: 'greek', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
      { id: 'logic', courseId: 'logic', kind: 'lecture', weekday: 0, period: 0, room: 'А-206' },
    ]
    const manager = makeManager([ALIEVA, DOLGORUKOV], grid, parallel)

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes + 5)
    expect(npcRoom(grid, manager.find('teacher-alieva')!)).toBe('А-204')
    expect(npcRoom(grid, manager.find('teacher-dolgorukov')!)).toBe('А-206')
  })

  it('расписание без пар оставляет всех дома', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid, [])
    run(manager, grid, 7 * 60, 20 * 60, 0, 2)
    expect(npcRoom(grid, manager.find('teacher-alieva')!)).toBe('коридор')
  })

  it('путь ищется один раз на цель, а не каждый тик', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)

    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes)
    const goal = manager.goalOf('teacher-alieva')
    expect(goal).toEqual(teachingSpot(grid, 'А-204'))

    run(manager, grid, FIRST.startMinutes, FIRST.startMinutes + 10)
    expect(manager.goalOf('teacher-alieva')).toEqual(goal)
  })
})

describe('NpcManager: снимок', () => {
  it('отдаёт положение, поворот и признак движения', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)

    const idle = manager.snapshot()[0]
    expect(idle?.id).toBe('teacher-alieva')
    expect(idle?.teacherId).toBe('alieva')
    expect(idle?.isMoving).toBe(false)

    // Минута пути: персонаж уже вышел, но до аудитории ещё не дошёл.
    run(
      manager,
      grid,
      FIRST.startMinutes - ARRIVE_BEFORE_MINUTES,
      FIRST.startMinutes - ARRIVE_BEFORE_MINUTES + 1,
    )
    const walking = manager.snapshot()[0]
    expect(walking?.isMoving).toBe(true)
    expect(walking?.position).not.toEqual(idle?.position)
    expect(Number.isFinite(walking?.facing)).toBe(true)
  })

  it('снимок не даёт менять мир мимо симуляции', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA], grid)
    const snap = manager.snapshot()[0]!
    snap.position.x = 999
    expect(manager.find('teacher-alieva')!.actor.position.x).not.toBe(999)
  })
})

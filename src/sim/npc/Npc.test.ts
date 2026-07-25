import { describe, expect, it } from 'vitest'
import { isMoving } from '../actor/Actor'
import { PERIODS, type Schedule } from '../study/Schedule'
import { GAME_MINUTES_PER_REAL_SECOND } from '../time/GameClock'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import {
  ARRIVE_BEFORE_MINUTES,
  errandSpot,
  errandWindow,
  NpcManager,
  npcRoom,
  roomCells,
  teachingSpot,
  type ErrandHabit,
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

/* ------------------------------------------------------------------ */
/* Бытовые вылазки                                                     */
/* ------------------------------------------------------------------ */

/**
 * Тот же этаж, но с туалетом внизу: два коридорных выхода по краям,
 * между ними стена. Иначе туалет оказался бы просто продолжением коридора
 * и проверять было бы нечего.
 */
const ERRAND_PLAN: FloorPlan = {
  id: 'errand-test',
  name: 'Этаж с туалетом',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: [
    '....#....',
    '....#....',
    '.........',
    '.#######.',
    '.........',
  ],
  props: [{ id: 'board', kind: 'whiteboard', col: 1, row: 0, rotation: 0, blocks: true }],
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 0, row0: 0, col1: 3, row1: 1 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 5, row0: 0, col1: 8, row1: 1 },
    { id: 'коридор', name: 'Коридор', col0: 0, row0: 2, col1: 8, row1: 2 },
    { id: 'туалеты', name: 'Туалеты', col0: 0, row0: 4, col1: 3, row1: 4 },
  ],
}

/** Те же числа, что в каталоге: заходит за 75 минут, сидит 45. */
const RESTROOM: ErrandHabit = {
  room: 'туалеты',
  beforeLessonMinutes: 75,
  durationMinutes: 45,
}

const ALIEVA_WITH_ERRAND: NpcSpec = { ...ALIEVA, errand: RESTROOM }

function makeErrandGrid(): NavGrid {
  return new NavGrid(ERRAND_PLAN)
}

const ERRAND_FROM = FIRST.startMinutes - RESTROOM.beforeLessonMinutes
const ERRAND_UNTIL = FIRST.startMinutes - ARRIVE_BEFORE_MINUTES

describe('окно бытовой вылазки', () => {
  it('открывается за столько минут до пары, сколько задано', () => {
    const lesson = SCHEDULE[0]!
    const window = errandWindow(RESTROOM, lesson, FIRST.startMinutes)
    expect(window.room).toBe('туалеты')
    expect(window.fromMinutes).toBe(ERRAND_FROM)
    expect(window.lesson).toBe(lesson)
  })

  it('закрывается не позже, чем пора выходить к аудитории', () => {
    const lesson = SCHEDULE[0]!
    const greedy: ErrandHabit = { ...RESTROOM, durationMinutes: 600 }
    expect(errandWindow(greedy, lesson, FIRST.startMinutes).untilMinutes).toBe(ERRAND_UNTIL)
  })

  it('бессмысленно поздняя привычка даёт пустое окно', () => {
    const lesson = SCHEDULE[0]!
    const late: ErrandHabit = { ...RESTROOM, beforeLessonMinutes: 5, durationMinutes: 20 }
    const window = errandWindow(late, lesson, FIRST.startMinutes)
    expect(window.untilMinutes).toBeLessThanOrEqual(window.fromMinutes)
  })

  it('место в помещении — ближе к середине, а не в углу', () => {
    const spot = errandSpot(makeErrandGrid(), 'туалеты')
    expect(spot).toEqual({ col: 1, row: 4 })
  })

  it('у несуществующего помещения места нет', () => {
    expect(errandSpot(makeErrandGrid(), 'преподавательская')).toBeNull()
  })
})

describe('NpcManager: заход в туалет перед парой', () => {
  it('до открытия окна преподаватель у себя в коридоре', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, 7 * 60, ERRAND_FROM - 5)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('внутри окна его застают в туалете', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL - 5)
    expect(npcRoom(grid, npc)).toBe('туалеты')
    expect(isMoving(npc.actor)).toBe(false)
  })

  it('окно короткое: к звонку в туалете уже никого', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL + 5)
    expect(npcRoom(grid, npc)).not.toBe('туалеты')
  })

  it('выходит вовремя и на собственную пару не опаздывает', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, FIRST.startMinutes)
    expect(npcRoom(grid, npc)).toBe('А-204')
    expect(isMoving(npc.actor)).toBe(false)
  })

  it('успевает провести внутри заметное время, а не забежать и выбежать', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    let insideMinutes = 0
    for (let minutes = ERRAND_FROM; minutes < ERRAND_UNTIL; minutes += 0.5) {
      manager.tick(grid, 0.5 / GAME_MINUTES_PER_REAL_SECOND, 0, minutes)
      if (npcRoom(grid, npc) === 'туалеты') insideMinutes += 0.5
    }
    expect(insideMinutes).toBeGreaterThan(20)
  })

  it('в туалете он развёрнут к комнате, а не к стене', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL - 5)
    expect(Number.isFinite(npc.actor.facing)).toBe(true)
  })

  it('без привычки никто никуда не сворачивает', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL - 5)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('в выходной вылазки нет: нет пары — нет и повода', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL - 5, 6)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('чужая пара привычку не запускает', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([{ ...DOLGORUKOV, errand: RESTROOM }], grid)
    const npc = manager.find('teacher-dolgorukov')!

    // Окно перед греческим уже открыто, но греческий ведёт не он.
    run(manager, grid, ERRAND_FROM, ERRAND_UNTIL - 5)
    expect(npcRoom(grid, npc)).toBe('коридор')
  })

  it('перед второй парой отлучается так же, как перед первой', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([{ ...DOLGORUKOV, errand: RESTROOM }], grid)
    const npc = manager.find('teacher-dolgorukov')!

    const from = SECOND.startMinutes - RESTROOM.beforeLessonMinutes
    run(manager, grid, from, SECOND.startMinutes - ARRIVE_BEFORE_MINUTES - 5)
    expect(npcRoom(grid, npc)).toBe('туалеты')

    run(manager, grid, SECOND.startMinutes - ARRIVE_BEFORE_MINUTES - 5, SECOND.startMinutes)
    expect(npcRoom(grid, npc)).toBe('А-206')
  })

  it('распорядок дня читается по минутам', () => {
    const grid = makeErrandGrid()
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid)
    const npc = manager.find('teacher-alieva')!

    expect(manager.planFor(npc, 0, 7 * 60)).toEqual({
      activity: 'idle',
      room: 'коридор',
      lesson: null,
    })
    expect(manager.planFor(npc, 0, ERRAND_FROM + 1).activity).toBe('errand')
    expect(manager.planFor(npc, 0, ERRAND_FROM + 1).room).toBe('туалеты')
    expect(manager.planFor(npc, 0, ERRAND_UNTIL).activity).toBe('classroom')
    expect(manager.planFor(npc, 0, ERRAND_UNTIL).room).toBe('А-204')
    expect(manager.planFor(npc, 0, FIRST.endMinutes + 1).activity).toBe('idle')
  })

  it('идущая пара важнее бытовых дел', () => {
    const grid = makeErrandGrid()
    // Две пары подряд у одного человека: окно вылазки перед второй парой
    // попадает внутрь первой, и уйти с неё он не должен.
    const backToBack: Schedule = [
      { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
      { id: 'greek-mon-2', courseId: 'greek', kind: 'seminar', weekday: 0, period: 1, room: 'А-206' },
    ]
    const manager = makeManager([ALIEVA_WITH_ERRAND], grid, backToBack)
    const npc = manager.find('teacher-alieva')!

    run(manager, grid, ERRAND_FROM, FIRST.startMinutes + 30)
    expect(npcRoom(grid, npc)).toBe('А-204')
  })
})

describe('жители этажа в сохранении', () => {
  it('снимок берёт места и направления взгляда всех', () => {
    const grid = makeGrid()
    const manager = makeManager([ALIEVA, DOLGORUKOV], grid)
    run(manager, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes)

    const placements = manager.toJSON()
    expect(placements.map((item) => item.id)).toEqual(['teacher-alieva', 'teacher-dolgorukov'])
    expect(placements[0]?.position).toEqual(manager.find('teacher-alieva')?.actor.position)
    expect(placements[0]?.facing).toBe(manager.find('teacher-alieva')?.actor.facing)
  })

  it('загрузка ставит людей туда, где их застали', () => {
    const grid = makeGrid()
    const played = makeManager([ALIEVA], grid)
    run(played, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes)
    expect(npcRoom(grid, played.find('teacher-alieva')!)).toBe('А-204')

    const loaded = makeManager([ALIEVA], grid)
    expect(npcRoom(grid, loaded.find('teacher-alieva')!)).toBe('коридор')

    loaded.load(played.toJSON())
    expect(loaded.toJSON()).toEqual(played.toJSON())
    expect(npcRoom(grid, loaded.find('teacher-alieva')!)).toBe('А-204')
    expect(isMoving(loaded.find('teacher-alieva')!.actor)).toBe(false)
  })

  it('после загрузки распорядок считается заново, а не продолжается по старому пути', () => {
    const grid = makeGrid()
    const played = makeManager([ALIEVA], grid)
    // Человек застигнут на полпути в аудиторию.
    run(played, grid, FIRST.startMinutes - ARRIVE_BEFORE_MINUTES, FIRST.startMinutes - 20)

    const loaded = makeManager([ALIEVA], grid)
    loaded.load(played.toJSON())
    expect(loaded.goalOf('teacher-alieva')).toBeNull()

    run(loaded, grid, FIRST.startMinutes - 20, FIRST.startMinutes)
    run(played, grid, FIRST.startMinutes - 20, FIRST.startMinutes)
    expect(loaded.find('teacher-alieva')!.actor.position).toEqual(
      played.find('teacher-alieva')!.actor.position,
    )
    expect(npcRoom(grid, loaded.find('teacher-alieva')!)).toBe('А-204')
  })

  it('незнакомый в сохранении человек остаётся на своём месте', () => {
    // Старое сохранение не должно валиться из-за персонажа, которого
    // в нём ещё не было.
    const grid = makeGrid()
    const manager = makeManager([ALIEVA, DOLGORUKOV], grid)
    const before = { ...manager.find('teacher-dolgorukov')!.actor.position }

    manager.load([{ id: 'кто-то-новый', position: { x: 1, z: 1 }, facing: 0 }])
    expect(manager.find('teacher-dolgorukov')!.actor.position).toEqual(before)
  })
})

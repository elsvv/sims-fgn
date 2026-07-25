import { describe, expect, it } from 'vitest'
import { createActor, setDestination } from '../actor/Actor'
import { World } from '../World'
import type { FloorPlan } from './FloorPlan'
import { NavGrid } from './NavGrid'
import type { PropCatalog } from './PropDefinition'
import { buildSeatMap, seatFacing, seatKey } from './seats'

const PLAN: FloorPlan = {
  id: 'сиденья',
  name: 'Комната со стулом',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['#####', '#...#', '#...#', '#####'],
  rooms: [{ id: 'комната', name: 'Комната', col0: 1, row0: 1, col1: 3, row1: 2 }],
  props: [
    { id: 'стул', kind: 'chair', col: 2, row: 2, rotation: Math.PI, blocks: false },
    { id: 'парта', kind: 'desk', col: 2, row: 1, rotation: 0, blocks: true },
  ],
}

const CATALOG: PropCatalog = {
  chair: {
    kind: 'chair',
    label: 'Стул',
    size: { w: 0.4, d: 0.4, h: 0.94 },
    color: '#a8906a',
    blocks: false,
    seat: { height: 0.48 },
    interactions: [{ id: 'takeSeat', label: 'Занять место', durationMinutes: 2, needDelta: {} }],
  },
  desk: {
    kind: 'desk',
    label: 'Парта',
    size: { w: 0.9, d: 0.6, h: 0.75 },
    color: '#c8b18b',
    blocks: true,
    interactions: [{ id: 'sit', label: 'Сесть и слушать', durationMinutes: 40, needDelta: {} }],
  },
}

describe('карта сидений', () => {
  it('в карту попадают только предметы, на которых сидят', () => {
    const seats = buildSeatMap(PLAN, CATALOG)
    expect(seats.size).toBe(1)
    expect(seats.get(seatKey(2, 2))?.height).toBe(0.48)
    expect(seats.get(seatKey(2, 1))).toBeUndefined()
  })

  it('пустой каталог не даёт сидений', () => {
    expect(buildSeatMap(PLAN, {}).size).toBe(0)
  })
})

describe('куда смотрит сидящий', () => {
  /** Единичный вектор взгляда по осям (x, z). */
  function look(rotation: number): { x: number; z: number } {
    const facing = seatFacing(rotation)
    return { x: Math.cos(facing), z: Math.sin(facing) }
  }

  it('сидящий смотрит туда же, куда повёрнут стул', () => {
    // «Перёд» моделей набора — +Z, поворот доворачивает его по часовой.
    expect(look(0).z).toBeCloseTo(1, 6)
    expect(look(Math.PI).z).toBeCloseTo(-1, 6)
    expect(look(Math.PI / 2).x).toBeCloseTo(1, 6)
    expect(look(-Math.PI / 2).x).toBeCloseTo(-1, 6)
  })
})

describe('мир сажает того, кто дошёл до стула', () => {
  function world(): World {
    return new World(PLAN, { col: 1, row: 1 }, CATALOG)
  }

  it('стоящий на стуле сидит', () => {
    const game = world()
    game.player.position = game.grid.gridToWorld({ col: 2, row: 2 })
    expect(game.seatOf(game.player)?.height).toBe(0.48)
  })

  it('идущий сквозь стул не садится по дороге', () => {
    const game = world()
    game.player.position = game.grid.gridToWorld({ col: 2, row: 2 })
    setDestination(game.player, game.grid, { col: 3, row: 1 })
    expect(game.seatOf(game.player)).toBeNull()
  })

  it('стоящий рядом со стулом не сидит', () => {
    const game = world()
    game.player.position = game.grid.gridToWorld({ col: 1, row: 2 })
    expect(game.seatOf(game.player)).toBeNull()
  })

  it('в мире без стульев не сидит никто', () => {
    const game = new World({ ...PLAN, props: [] }, { col: 1, row: 1 }, CATALOG)
    expect(game.seatOf(createActor('кто-то', game.player.position))).toBeNull()
  })

  it('на стул можно встать: его клетка проходима', () => {
    // Стул — единственный предмет, чья клетка обязана оставаться
    // проходимой. Перекрой её — и сесть станет некуда.
    expect(new NavGrid(PLAN).isWalkable({ col: 2, row: 2 })).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { findAdjacentCell, findApproachCell } from './approach'

function makeGrid(tiles: string[], props: FloorPlan['props'] = []): NavGrid {
  return new NavGrid({
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles,
    props,
    rooms: [],
  })
}

describe('findApproachCell', () => {
  it('возвращает саму клетку, если она проходима', () => {
    expect(findApproachCell(makeGrid(['...']), { col: 1, row: 0 })).toEqual({
      col: 1,
      row: 0,
    })
  })

  it('возвращает соседнюю проходимую клетку, если предмет блокирует свою', () => {
    const grid = makeGrid(
      ['.....', '.....', '.....'],
      [{ id: 'coffee-1', kind: 'coffeeMachine', col: 4, row: 1, rotation: 0, blocks: true }],
    )
    const cell = findApproachCell(grid, { col: 4, row: 1 })
    expect(cell).not.toBeNull()
    expect(grid.isWalkable(cell!)).toBe(true)
  })

  it('возвращает null, если подойти негде', () => {
    expect(findApproachCell(makeGrid(['###', '###', '###']), { col: 1, row: 1 })).toBeNull()
  })
})

describe('findAdjacentCell', () => {
  it('никогда не возвращает саму целевую клетку, даже проходимую', () => {
    const cell = findAdjacentCell(makeGrid(['...']), { col: 1, row: 0 })
    expect(cell).not.toEqual({ col: 1, row: 0 })
    expect(cell).not.toBeNull()
  })

  it('возвращает null, когда рядом нет ни одной проходимой клетки', () => {
    expect(findAdjacentCell(makeGrid(['###', '#.#', '###']), { col: 1, row: 1 })).toBeNull()
  })

  it('берёт подходящую клетку, а не первую попавшуюся', () => {
    const grid = makeGrid(['.....', '.....', '.....'])
    const cell = findAdjacentCell(grid, { col: 2, row: 1 }, (c) => c.col === 1)
    expect(cell).toEqual({ col: 1, row: 1 })
  })

  it('без единой подходящей соседки берёт любую проходимую', () => {
    const grid = makeGrid(['.....', '.....', '.....'])
    expect(findAdjacentCell(grid, { col: 2, row: 1 }, () => false)).not.toBeNull()
  })
})

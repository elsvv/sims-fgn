import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { findApproachCell } from './approach'

function makeGrid(tiles: string[], props: FloorPlan['props'] = []): NavGrid {
  return new NavGrid({
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles,
    props,
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

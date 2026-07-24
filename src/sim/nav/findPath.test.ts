import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { findPath } from './findPath'

function makeGrid(tiles: string[]): NavGrid {
  const plan: FloorPlan = {
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor', ' ': 'void' },
    tiles,
    props: [],
    rooms: [],
  }
  return new NavGrid(plan)
}

describe('findPath', () => {
  it('находит прямой путь по открытой комнате', () => {
    const grid = makeGrid(['.....', '.....', '.....'])
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })
    expect(path).not.toBeNull()
    expect(path![0]).toEqual({ col: 0, row: 0 })
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 0 })
  })

  it('возвращает путь из одной клетки, если старт равен цели', () => {
    expect(findPath(makeGrid(['...']), { col: 1, row: 0 }, { col: 1, row: 0 })).toEqual([
      { col: 1, row: 0 },
    ])
  })

  it('обходит стену', () => {
    const grid = makeGrid(['.....', '.###.', '.....'])
    const path = findPath(grid, { col: 2, row: 0 }, { col: 2, row: 2 })
    expect(path).not.toBeNull()
    for (const step of path!) expect(grid.isWalkable(step)).toBe(true)
  })

  it('возвращает null, если цель отрезана', () => {
    const grid = makeGrid(['..#..', '..#..', '..#..'])
    expect(findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })).toBeNull()
  })

  it('возвращает null, если цель непроходима', () => {
    expect(findPath(makeGrid(['.#.']), { col: 0, row: 0 }, { col: 1, row: 0 })).toBeNull()
  })

  it('возвращает null, если старт непроходим', () => {
    expect(findPath(makeGrid(['.#.']), { col: 1, row: 0 }, { col: 2, row: 0 })).toBeNull()
  })

  it('соседние шаги пути всегда смежны по стороне', () => {
    const grid = makeGrid(['.....', '.###.', '.....'])
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 2 })!
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]!
      const cur = path[i]!
      expect(Math.abs(prev.col - cur.col) + Math.abs(prev.row - cur.row)).toBe(1)
    }
  })

  it('находит кратчайший путь по длине', () => {
    const grid = makeGrid(['.....', '.....'])
    expect(findPath(grid, { col: 0, row: 0 }, { col: 3, row: 1 })!.length).toBe(5)
  })
})

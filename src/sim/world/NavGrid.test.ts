import { describe, expect, it } from 'vitest'
import type { FloorPlan } from './FloorPlan'
import { NavGrid } from './NavGrid'

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Тестовый этаж',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor', '+': 'door', ' ': 'void' },
  tiles: [
    '#####',
    '#...#',
    '#...+',
    '#...#',
    '#####',
  ],
  props: [],
}

describe('NavGrid', () => {
  it('определяет размеры из строк планировки', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.cols).toBe(5)
    expect(grid.rows).toBe(5)
  })

  it('читает тип клетки', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.tileAt({ col: 0, row: 0 })).toBe('wall')
    expect(grid.tileAt({ col: 1, row: 1 })).toBe('floor')
    expect(grid.tileAt({ col: 4, row: 2 })).toBe('door')
  })

  it('считает проходимыми пол и двери, но не стены', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.isWalkable({ col: 1, row: 1 })).toBe(true)
    expect(grid.isWalkable({ col: 4, row: 2 })).toBe(true)
    expect(grid.isWalkable({ col: 0, row: 0 })).toBe(false)
  })

  it('считает непроходимым всё за границами', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.inBounds({ col: -1, row: 0 })).toBe(false)
    expect(grid.isWalkable({ col: -1, row: 0 })).toBe(false)
    expect(grid.isWalkable({ col: 99, row: 99 })).toBe(false)
  })

  it('переводит клетку в центр клетки в метрах', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.gridToWorld({ col: 0, row: 0 })).toEqual({ x: 0.5, z: 0.5 })
    expect(grid.gridToWorld({ col: 2, row: 3 })).toEqual({ x: 2.5, z: 3.5 })
  })

  it('переводит метры обратно в клетку', () => {
    expect(new NavGrid(PLAN).worldToGrid({ x: 2.7, z: 3.1 })).toEqual({ col: 2, row: 3 })
  })

  it('учитывает размер клетки при переводе координат', () => {
    const grid = new NavGrid({ ...PLAN, cellSize: 2 })
    expect(grid.gridToWorld({ col: 1, row: 1 })).toEqual({ x: 3, z: 3 })
    expect(grid.worldToGrid({ x: 3, z: 3 })).toEqual({ col: 1, row: 1 })
  })

  it('делает клетку с блокирующим предметом непроходимой', () => {
    const grid = new NavGrid({
      ...PLAN,
      props: [{ id: 'desk-1', kind: 'desk', col: 2, row: 2, rotation: 0, blocks: true }],
    })
    expect(grid.isWalkable({ col: 2, row: 2 })).toBe(false)
    expect(grid.isWalkable({ col: 1, row: 2 })).toBe(true)
  })
})

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
  rooms: [{ id: 'зал', name: 'Зал', col0: 1, row0: 1, col1: 3, row1: 3 }],
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

  it('находит помещение по клетке внутри него', () => {
    expect(new NavGrid(PLAN).roomAt({ col: 2, row: 2 })?.id).toBe('зал')
  })

  it('считает клетки на границе помещения принадлежащими ему', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.roomAt({ col: 1, row: 1 })?.id).toBe('зал')
    expect(grid.roomAt({ col: 3, row: 3 })?.id).toBe('зал')
  })

  it('возвращает null для клетки вне помещений', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.roomAt({ col: 0, row: 0 })).toBeNull()
    expect(grid.roomAt({ col: 4, row: 2 })).toBeNull()
  })

  it('возвращает null за границами планировки', () => {
    expect(new NavGrid(PLAN).roomAt({ col: -1, row: -1 })).toBeNull()
    expect(new NavGrid(PLAN).roomAt({ col: 99, row: 99 })).toBeNull()
  })

  it('возвращает null, если помещений не описано вовсе', () => {
    expect(new NavGrid({ ...PLAN, rooms: [] }).roomAt({ col: 2, row: 2 })).toBeNull()
  })

  it('различает соседние помещения', () => {
    const grid = new NavGrid({
      ...PLAN,
      rooms: [
        { id: 'левое', name: 'Левое', col0: 1, row0: 1, col1: 1, row1: 3 },
        { id: 'правое', name: 'Правое', col0: 2, row0: 1, col1: 3, row1: 3 },
      ],
    })
    expect(grid.roomAt({ col: 1, row: 2 })?.id).toBe('левое')
    expect(grid.roomAt({ col: 2, row: 2 })?.id).toBe('правое')
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

import { describe, expect, it } from 'vitest'
import { findApproachCell } from '../../sim/interaction/approach'
import { findPath } from '../../sim/nav/findPath'
import { NavGrid } from '../../sim/world/NavGrid'
import { PROP_CATALOG } from '../props/propCatalog'
import { FLOOR_A2, FLOOR_A2_SPAWN } from './floorA2'

describe('корпус А, 2 этаж', () => {
  it('все строки планировки одной длины', () => {
    const width = FLOOR_A2.tiles[0]!.length
    for (const row of FLOOR_A2.tiles) expect(row.length).toBe(width)
  })

  it('все символы планировки есть в легенде', () => {
    for (const row of FLOOR_A2.tiles) {
      for (const char of row) expect(FLOOR_A2.legend[char]).toBeDefined()
    }
  })

  it('все размещённые предметы есть в каталоге', () => {
    for (const prop of FLOOR_A2.props) expect(PROP_CATALOG[prop.kind]).toBeDefined()
  })

  it('идентификаторы предметов уникальны', () => {
    const ids = FLOOR_A2.props.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('предметы не стоят внутри стен', () => {
    const bare = new NavGrid({ ...FLOOR_A2, props: [] })
    for (const prop of FLOOR_A2.props) {
      expect(bare.tileAt({ col: prop.col, row: prop.row }), prop.id).not.toBe('wall')
    }
  })

  it('точка появления игрока проходима', () => {
    expect(new NavGrid(FLOOR_A2).isWalkable(FLOOR_A2_SPAWN)).toBe(true)
  })

  it('игрок появляется не вплотную к предметам', () => {
    for (const prop of FLOOR_A2.props) {
      const distance = Math.max(
        Math.abs(prop.col - FLOOR_A2_SPAWN.col),
        Math.abs(prop.row - FLOOR_A2_SPAWN.row),
      )
      expect(distance, `${prop.id} стоит вплотную к точке появления`).toBeGreaterThan(1)
    }
  })

  it('ни один предмет каталога не шире и не глубже клетки', () => {
    // Предмет занимает ровно одну клетку навигации. Если он больше клетки,
    // он визуально накроет соседние — по которым персонаж всё равно пройдёт.
    // Высота не проверяется: вверх ходить нельзя.
    for (const definition of Object.values(PROP_CATALOG)) {
      expect(definition.size.w, `${definition.kind}: ширина`).toBeLessThanOrEqual(
        FLOOR_A2.cellSize,
      )
      expect(definition.size.d, `${definition.kind}: глубина`).toBeLessThanOrEqual(
        FLOOR_A2.cellSize,
      )
    }
  })

  it('от точки появления достижим каждый предмет', () => {
    const grid = new NavGrid(FLOOR_A2)
    for (const prop of FLOOR_A2.props) {
      const approach = findApproachCell(grid, { col: prop.col, row: prop.row })
      expect(approach, `к ${prop.id} негде подойти`).not.toBeNull()
      expect(findPath(grid, FLOOR_A2_SPAWN, approach!), `${prop.id} недостижим`).not.toBeNull()
    }
  })

  it('обе аудитории достижимы из коридора', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 4, row: 2 })).not.toBeNull()
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 18, row: 2 })).not.toBeNull()
  })

  it('лифтовый холл и туалеты достижимы', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 19, row: 10 })).not.toBeNull()
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 3, row: 10 })).not.toBeNull()
  })

  it('у каждого предмета в каталоге есть хотя бы одно действие', () => {
    for (const definition of Object.values(PROP_CATALOG)) {
      expect(definition.interactions.length, definition.kind).toBeGreaterThan(0)
    }
  })
})

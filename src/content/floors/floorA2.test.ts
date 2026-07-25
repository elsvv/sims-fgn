import { describe, expect, it } from 'vitest'
import { findApproachCell } from '../../sim/interaction/approach'
import { findPath } from '../../sim/nav/findPath'
import { validateRooms } from '../../sim/world/FloorPlan'
import { NavGrid } from '../../sim/world/NavGrid'
import { PROP_CATALOG } from '../props/propCatalog'
import { SCHEDULE } from '../study/courses'
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

  it('помещения этажа корректны', () => {
    expect(validateRooms(FLOOR_A2)).toEqual([])
  })

  it('каждая клетка помещения проходима', () => {
    // Помещение, часть которого — стена, означало бы, что расписание
    // ссылается на клетки, куда игрок никогда не встанет.
    const grid = new NavGrid({ ...FLOOR_A2, props: [] })
    for (const room of FLOOR_A2.rooms) {
      for (let row = room.row0; row <= room.row1; row++) {
        for (let col = room.col0; col <= room.col1; col++) {
          expect(grid.isWalkable({ col, row }), `${room.id}: клетка ${col},${row}`).toBe(true)
        }
      }
    }
  })

  it('характерные точки этажа опознаются как нужные помещения', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(grid.roomAt({ col: 4, row: 2 })?.id).toBe('А-204')
    expect(grid.roomAt({ col: 18, row: 2 })?.id).toBe('А-206')
    expect(grid.roomAt(FLOOR_A2_SPAWN)?.id).toBe('коридор')
    expect(grid.roomAt({ col: 3, row: 10 })?.id).toBe('туалеты')
    expect(grid.roomAt({ col: 19, row: 10 })?.id).toBe('лифтовый холл')
  })

  it('стены и дверные проёмы не принадлежат помещениям', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(grid.roomAt({ col: 0, row: 0 })).toBeNull()
    expect(grid.roomAt({ col: 4, row: 5 })).toBeNull()
    expect(grid.roomAt({ col: 11, row: 2 })).toBeNull()
  })

  it('каждая аудитория из расписания есть на этаже', () => {
    const ids = new Set(FLOOR_A2.rooms.map((room) => room.id))
    for (const lesson of SCHEDULE) {
      expect(ids.has(lesson.room), `${lesson.id}: аудитории ${lesson.room} нет на этаже`).toBe(
        true,
      )
    }
  })

  it('обе аудитории этажа заняты хотя бы одним занятием', () => {
    for (const id of ['А-204', 'А-206']) {
      expect(SCHEDULE.some((lesson) => lesson.room === id), id).toBe(true)
    }
  })

  it('у каждого предмета в каталоге есть хотя бы одно действие', () => {
    for (const definition of Object.values(PROP_CATALOG)) {
      expect(definition.interactions.length, definition.kind).toBeGreaterThan(0)
    }
  })
})

/**
 * Проверки расстановки, которые стали нужны вместе с настоящими моделями.
 *
 * Пока предметы были одинаковыми боксами по центру клетки, поворот ничего
 * не значил, а «стоит у стены» и «стоит посреди комнаты» выглядели
 * одинаково. С моделью и то и другое видно сразу, и ошибку расстановки
 * дешевле поймать здесь, чем глазами на скриншоте.
 */
describe('обстановка второго этажа расставлена по-человечески', () => {
  const grid = new NavGrid({ ...FLOOR_A2, props: [] })

  /** Клетка позади предмета — та, к которой он повёрнут спиной. */
  function behind(prop: (typeof FLOOR_A2.props)[number]): { col: number; row: number } {
    return {
      col: prop.col - Math.round(Math.sin(prop.rotation)),
      row: prop.row - Math.round(Math.cos(prop.rotation)),
    }
  }

  it('поворот каждого предмета кратен четверти оборота', () => {
    // Планировка стоит по сторонам света. Косо повёрнутый предмет
    // вылезет углом за свою клетку, и видимое разойдётся с проходимым.
    for (const prop of FLOOR_A2.props) {
      const quarters = prop.rotation / (Math.PI / 2)
      expect(Math.abs(quarters - Math.round(quarters)), prop.id).toBeLessThan(1e-9)
    }
  })

  it('в одной клетке не стоит двух предметов', () => {
    const cells = FLOOR_A2.props.map((prop) => `${prop.col},${prop.row}`)
    expect(new Set(cells).size, 'предметы налезли друг на друга').toBe(cells.length)
  })

  it('ни один предмет не стоит в дверном проёме', () => {
    for (const prop of FLOOR_A2.props) {
      expect(grid.tileAt({ col: prop.col, row: prop.row }), prop.id).toBe('floor')
    }
  })

  it('ни один предмет не загораживает дверной проём', () => {
    // Проём шириной в клетку: предмет вплотную к нему с любой стороны
    // превращает дверь в стену.
    const doors: { col: number; row: number }[] = []
    for (let row = 0; row < FLOOR_A2.tiles.length; row++) {
      const line = FLOOR_A2.tiles[row] ?? ''
      for (let col = 0; col < line.length; col++) {
        if (grid.tileAt({ col, row }) === 'door') doors.push({ col, row })
      }
    }
    expect(doors.length, 'на этаже вообще нет дверей').toBeGreaterThan(0)

    for (const prop of FLOOR_A2.props) {
      if (!prop.blocks) continue
      for (const door of doors) {
        const distance = Math.abs(prop.col - door.col) + Math.abs(prop.row - door.row)
        expect(distance, `${prop.id} стоит вплотную к проёму ${door.col},${door.row}`).toBeGreaterThan(1)
      }
    }
  })

  it('предмет, прижатый спиной к стене, действительно стоит у стены', () => {
    // Прижатие живёт в каталоге (align: 'back'), а стена — в планировке.
    // Разъедутся — и шкаф встанет спиной к пустому месту.
    let checked = 0
    for (const prop of FLOOR_A2.props) {
      const model = PROP_CATALOG[prop.kind]?.model
      if (!model || model === 'box' || model.align !== 'back') continue
      checked++
      const cell = behind(prop)
      const kind = grid.tileAt(cell)
      expect(
        kind === 'wall' || kind === 'void',
        `${prop.id}: за спиной клетка ${cell.col},${cell.row} — это ${kind}`,
      ).toBe(true)
    }
    expect(checked, 'ни один предмет не прижат к стене — проверка ничего не проверила').toBeGreaterThan(5)
  })

  it('к каждому предмету есть куда встать, чтобы им воспользоваться', () => {
    // То же, что и проверка достижимости, но с другой стороны: предмет,
    // обойдённый со всех сторон другими предметами, недоступен.
    const withProps = new NavGrid(FLOOR_A2)
    for (const prop of FLOOR_A2.props) {
      const approach = findApproachCell(withProps, { col: prop.col, row: prop.row })
      expect(approach, `${prop.id}: подойти негде`).not.toBeNull()
      expect(withProps.isWalkable(approach!), `${prop.id}: подход непроходим`).toBe(true)
    }
  })
})

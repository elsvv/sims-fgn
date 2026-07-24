import { describe, expect, it } from 'vitest'
import { planSize, roomContains, validateRooms, type FloorPlan, type RoomDef } from './FloorPlan'

const TILES = [
  '######',
  '#..#.#',
  '#..#.#',
  '######',
]

function makePlan(rooms: RoomDef[]): FloorPlan {
  return {
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles: TILES,
    props: [],
    rooms,
  }
}

const LEFT: RoomDef = { id: 'левая', name: 'Левая', col0: 1, row0: 1, col1: 2, row1: 2 }
const RIGHT: RoomDef = { id: 'правая', name: 'Правая', col0: 4, row0: 1, col1: 4, row1: 2 }

describe('размер планировки', () => {
  it('считается по самой длинной строке', () => {
    expect(planSize(makePlan([]))).toEqual({ cols: 6, rows: 4 })
  })
})

describe('принадлежность клетки помещению', () => {
  it('включает границы', () => {
    expect(roomContains(LEFT, 1, 1)).toBe(true)
    expect(roomContains(LEFT, 2, 2)).toBe(true)
  })

  it('исключает соседние клетки', () => {
    expect(roomContains(LEFT, 0, 1)).toBe(false)
    expect(roomContains(LEFT, 3, 1)).toBe(false)
    expect(roomContains(LEFT, 1, 3)).toBe(false)
  })
})

describe('validateRooms', () => {
  it('не находит ошибок в корректной планировке', () => {
    expect(validateRooms(makePlan([LEFT, RIGHT]))).toEqual([])
  })

  it('принимает планировку вовсе без помещений', () => {
    expect(validateRooms(makePlan([]))).toEqual([])
  })

  it('ловит пересечение помещений', () => {
    const overlapping: RoomDef = { ...RIGHT, id: 'жадная', col0: 2, col1: 4 }
    const errors = validateRooms(makePlan([LEFT, overlapping]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('пересекаются')
  })

  it('считает соприкосновение по границе пересечением', () => {
    // Клетка (2,1) принадлежала бы обоим помещениям — это и есть пересечение.
    const touching: RoomDef = { id: 'соседняя', name: 'Соседняя', col0: 2, row0: 1, col1: 3, row1: 2 }
    expect(validateRooms(makePlan([LEFT, touching]))).toHaveLength(1)
  })

  it('не считает пересечением помещения, стоящие вплотную', () => {
    const next: RoomDef = { id: 'соседняя', name: 'Соседняя', col0: 3, row0: 1, col1: 3, row1: 2 }
    expect(validateRooms(makePlan([LEFT, next]))).toEqual([])
  })

  it('ловит выход за правую и нижнюю границы планировки', () => {
    const huge: RoomDef = { id: 'огромная', name: 'Огромная', col0: 1, row0: 1, col1: 99, row1: 99 }
    const errors = validateRooms(makePlan([huge]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('выходит за границы')
  })

  it('ловит отрицательные координаты', () => {
    const outside: RoomDef = { id: 'снаружи', name: 'Снаружи', col0: -1, row0: 0, col1: 1, row1: 1 }
    expect(validateRooms(makePlan([outside]))[0]).toContain('выходит за границы')
  })

  it('ловит вывернутые границы', () => {
    const inverted: RoomDef = { id: 'кривая', name: 'Кривая', col0: 3, row0: 1, col1: 1, row1: 2 }
    const errors = validateRooms(makePlan([inverted]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('наизнанку')
  })

  it('ловит повторяющиеся идентификаторы', () => {
    const twin: RoomDef = { ...LEFT, col0: 4, col1: 4 }
    const errors = validateRooms(makePlan([LEFT, twin]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('дважды')
  })

  it('перечисляет все ошибки сразу, а не только первую', () => {
    const bad: RoomDef = { id: 'плохая', name: 'Плохая', col0: 0, row0: 0, col1: 99, row1: 99 }
    expect(validateRooms(makePlan([LEFT, RIGHT, bad])).length).toBeGreaterThan(2)
  })
})

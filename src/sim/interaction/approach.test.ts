import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import {
  findAdjacentCell,
  findApproachCell,
  isWithinTalkRange,
  TALK_RANGE_METRES,
} from './approach'

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

describe('isWithinTalkRange', () => {
  const HERE = { x: 0, z: 0 }

  it('стоящие вплотную разговаривают', () => {
    expect(isWithinTalkRange(HERE, { x: 1, z: 0 })).toBe(true)
  })

  it('через весь коридор — нет', () => {
    expect(isWithinTalkRange(HERE, { x: 13, z: 0 })).toBe(false)
  })

  it('считает расстояние по прямой, а не по осям', () => {
    // По сумме осей это четыре метра, по прямой — меньше трёх.
    expect(isWithinTalkRange(HERE, { x: 2, z: 2 })).toBe(true)
    expect(isWithinTalkRange(HERE, { x: 3, z: 3 })).toBe(false)
  })

  it('ровно на границе разговор ещё возможен', () => {
    expect(isWithinTalkRange(HERE, { x: TALK_RANGE_METRES, z: 0 })).toBe(true)
    expect(isWithinTalkRange(HERE, { x: TALK_RANGE_METRES + 0.01, z: 0 })).toBe(false)
  })

  it('порядок собеседников ничего не меняет', () => {
    const there = { x: 2.5, z: -1 }
    expect(isWithinTalkRange(HERE, there)).toBe(isWithinTalkRange(there, HERE))
  })

  it('принимает свою мерку, если она нужна', () => {
    expect(isWithinTalkRange(HERE, { x: 5, z: 0 }, 6)).toBe(true)
    expect(isWithinTalkRange(HERE, { x: 5, z: 0 }, 4)).toBe(false)
  })

  it('порог не позволяет разговаривать через весь этаж', () => {
    expect(TALK_RANGE_METRES).toBeGreaterThanOrEqual(2)
    expect(TALK_RANGE_METRES).toBeLessThanOrEqual(3)
  })
})

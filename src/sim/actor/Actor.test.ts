import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { createActor, isMoving, setDestination, stepActor } from './Actor'

function makeGrid(): NavGrid {
  const plan: FloorPlan = {
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles: ['.....', '.....', '.....'],
    props: [],
  }
  return new NavGrid(plan)
}

describe('Actor', () => {
  it('создаётся неподвижным', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(isMoving(actor)).toBe(false)
    expect(actor.path).toEqual([])
  })

  it('принимает достижимую цель', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(setDestination(actor, makeGrid(), { col: 4, row: 2 })).toBe(true)
    expect(isMoving(actor)).toBe(true)
  })

  it('отвергает недостижимую цель и не двигается', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(setDestination(actor, makeGrid(), { col: 99, row: 99 })).toBe(false)
    expect(isMoving(actor)).toBe(false)
  })

  it('доходит до цели за достаточное время', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 4, row: 0 })
    for (let i = 0; i < 600; i++) stepActor(actor, grid, 0.05)
    expect(actor.position.x).toBeCloseTo(4.5, 2)
    expect(actor.position.z).toBeCloseTo(0.5, 2)
    expect(isMoving(actor)).toBe(false)
  })

  it('за один короткий шаг смещается, но не телепортируется', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 4, row: 0 })
    stepActor(actor, grid, 0.1)
    expect(actor.position.x).toBeGreaterThan(0.5)
    expect(actor.position.x).toBeLessThan(1.0)
  })

  it('не двигается, когда пути нет', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    stepActor(actor, grid, 1)
    expect(actor.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('смотрит вдоль +X при движении вправо', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 2, row: 0 })
    stepActor(actor, grid, 0.2)
    expect(actor.facing).toBeCloseTo(0, 3)
  })

  it('смотрит вдоль +Z при движении вниз по сетке', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 0, row: 2 })
    stepActor(actor, grid, 0.2)
    expect(actor.facing).toBeCloseTo(Math.PI / 2, 3)
  })
})

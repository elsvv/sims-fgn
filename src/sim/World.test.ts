import { describe, expect, it } from 'vitest'
import { World } from './World'
import type { FloorPlan } from './world/FloorPlan'
import type { PropCatalog } from './world/PropDefinition'

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Тест',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['.....', '.....', '.....'],
  props: [
    { id: 'coffee-1', kind: 'coffeeMachine', col: 4, row: 1, rotation: 0, blocks: true },
  ],
}

const CATALOG: PropCatalog = {
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28, bladder: -12 },
      },
    ],
  },
}

function makeWorld(): World {
  return new World(PLAN, { col: 0, row: 0 }, CATALOG)
}

describe('World: время и нужды', () => {
  it('ставит игрока в центр стартовой клетки', () => {
    expect(makeWorld().player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('продвигает часы при тике', () => {
    const world = makeWorld()
    const before = world.clock.totalMinutes
    world.tick(0.1)
    expect(world.clock.totalMinutes).toBeGreaterThan(before)
  })

  it('изнашивает нужды при тике', () => {
    const world = makeWorld()
    world.clock.speed = 3
    for (let i = 0; i < 100; i++) world.tick(0.1)
    expect(world.needs.energy).toBeLessThan(100)
    expect(world.needs.stress).toBeGreaterThan(0)
  })

  it('на паузе ничего не меняется', () => {
    const world = makeWorld()
    world.clock.speed = 0
    const before = world.snapshot()
    world.tick(0.2)
    const after = world.snapshot()
    expect(after.minutes).toBe(before.minutes)
    expect(after.needs.energy).toBe(before.needs.energy)
  })

  it('ограничивает длину одного тика, чтобы не проваливаться после сворачивания вкладки', () => {
    const world = makeWorld()
    world.clock.speed = 1
    world.tick(3600)
    expect(world.clock.totalMinutes - 7 * 60).toBeLessThanOrEqual(30)
  })

  it('применяет дельту нужд', () => {
    const world = makeWorld()
    world.applyNeeds({ hunger: -60 })
    expect(world.needs.hunger).toBe(40)
  })

  it('отдаёт снимок состояния с подписями на русском', () => {
    const snap = makeWorld().snapshot()
    expect(snap.timeLabel).toBe('07:00')
    expect(snap.dayLabel).toBe('Неделя 1, понедельник')
    expect(snap.mood).toBeGreaterThan(90)
    expect(snap.activity).toBeNull()
  })
})

describe('World: движение', () => {
  it('на паузе игрок не двигается', () => {
    const world = makeWorld()
    world.commandMoveTo({ col: 4, row: 0 })
    world.clock.speed = 0
    world.tick(0.2)
    expect(world.player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('исполняет команду перемещения', () => {
    const world = makeWorld()
    expect(world.commandMoveTo({ col: 4, row: 2 })).toBe(true)
    for (let i = 0; i < 600; i++) world.tick(0.05)
    expect(world.player.position.x).toBeCloseTo(4.5, 2)
    expect(world.player.position.z).toBeCloseTo(2.5, 2)
  })

  it('отвергает команду в непроходимую клетку', () => {
    expect(makeWorld().commandMoveTo({ col: 50, row: 50 })).toBe(false)
  })
})

describe('World: взаимодействия', () => {
  it('отвергает взаимодействие с несуществующим предметом', () => {
    expect(makeWorld().commandInteract('нет-такого', 'drinkCoffee')).toBe(false)
  })

  it('отвергает неизвестное действие', () => {
    expect(makeWorld().commandInteract('coffee-1', 'нет-такого')).toBe(false)
  })

  it('принимает известное действие и ставит его в очередь', () => {
    const world = makeWorld()
    expect(world.commandInteract('coffee-1', 'drinkCoffee')).toBe(true)
    expect(world.activeInteraction?.interactionId).toBe('drinkCoffee')
  })

  it('не применяет эффект, пока персонаж идёт', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.tick(0.05)
    expect(world.needs.energy).toBeLessThanOrEqual(40)
    expect(world.activeInteraction).not.toBeNull()
  })

  it('применяет эффект после того, как персонаж дошёл и отработал время', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.clock.speed = 3
    world.commandInteract('coffee-1', 'drinkCoffee')
    for (let i = 0; i < 200; i++) world.tick(0.05)
    expect(world.activeInteraction).toBeNull()
    expect(world.needs.energy).toBeGreaterThan(40)
  })

  it('показывает текущее занятие в снимке состояния', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    expect(world.snapshot().activity).toBe('Взять кофе')
  })

  it('новая команда движения отменяет взаимодействие', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.commandMoveTo({ col: 0, row: 2 })
    expect(world.activeInteraction).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { FLOOR_A2 } from '../../content/floors/floorA2'
import {
  FAR_METERS,
  NEAR_METERS,
  distanceBetween,
  distanceGain,
  positionalGain,
} from './distance'

describe('громкость по расстоянию', () => {
  it('вблизи звук идёт в полную силу', () => {
    expect(distanceGain(0)).toBe(1)
    expect(distanceGain(NEAR_METERS)).toBe(1)
  })

  it('за дальней границей не слышно ничего', () => {
    expect(distanceGain(FAR_METERS)).toBe(0)
    expect(distanceGain(FAR_METERS + 10)).toBe(0)
  })

  it('чем дальше, тем тише, без исключений', () => {
    let previous = 1
    for (let d = NEAR_METERS; d <= FAR_METERS; d += 0.5) {
      const gain = distanceGain(d)
      expect(gain, `${d} м`).toBeLessThanOrEqual(previous)
      expect(gain, `${d} м`).toBeGreaterThanOrEqual(0)
      previous = gain
    }
  })

  it('вдвое дальше — заметно тише', () => {
    // Пропорция примерно обратная, как в жизни, плюс спад к нулю.
    const near = distanceGain(4)
    const far = distanceGain(8)
    expect(far).toBeLessThan(near / 2)
  })

  it('дальняя граница — это длина коридора', () => {
    // Смысл величины: звук с одного конца коридора до другого доходит
    // на пределе слышимости, а не пропадает на середине.
    const corridor = FLOOR_A2.rooms.find((room) => room.id === 'коридор')
    expect(corridor).toBeDefined()
    if (corridor === undefined) return
    const length = (corridor.col1 - corridor.col0 + 1) * FLOOR_A2.cellSize
    expect(FAR_METERS).toBeGreaterThanOrEqual(length)
    expect(distanceGain(length / 2)).toBeGreaterThan(0)
  })

  it('порченое расстояние звучит вблизи, а не молчит', () => {
    // Лучше лишний звук, чем беззвучная игра из-за одной NaN.
    expect(distanceGain(Number.NaN)).toBe(1)
  })

  it('расстояние считается по полу, а не по одной оси', () => {
    expect(distanceBetween({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5)
  })

  it('звук без места слышен всегда', () => {
    // Звонок, оценка и щелчок интерфейса случаются не в точке этажа.
    expect(positionalGain({ x: 0, z: 0 }, null)).toBe(1)
  })

  it('кофейный автомат в другом конце коридора тише, чем под носом', () => {
    const player = { x: 6.5, z: 7.5 }
    const near = positionalGain(player, { x: 6.5, z: 6.5 })
    const across = positionalGain(player, { x: 20.5, z: 6.5 })
    expect(near).toBe(1)
    expect(across).toBeLessThan(0.2)
    expect(across).toBeGreaterThan(0)
  })
})

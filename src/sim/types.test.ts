import { describe, expect, it } from 'vitest'
import { distance, vec2 } from './types'

describe('типы мира', () => {
  it('vec2 кладёт координаты в плоскость XZ', () => {
    expect(vec2(1, 2)).toEqual({ x: 1, z: 2 })
  })

  it('расстояние считается по теореме Пифагора', () => {
    expect(distance(vec2(0, 0), vec2(3, 4))).toBe(5)
  })

  it('расстояние до самой себя равно нулю', () => {
    const point = vec2(7.5, -2.25)
    expect(distance(point, point)).toBe(0)
  })

  it('расстояние не зависит от порядка точек', () => {
    expect(distance(vec2(-1, 3), vec2(2, -1))).toBe(distance(vec2(2, -1), vec2(-1, 3)))
  })
})

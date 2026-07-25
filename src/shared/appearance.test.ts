import { describe, expect, it } from 'vitest'
import { createAppearance } from './appearance'

describe('внешность персонажа', () => {
  it('имеет разумные значения по умолчанию', () => {
    const look = createAppearance()
    expect(look.height).toBeGreaterThan(1.5)
    expect(look.height).toBeLessThan(2.1)
    expect(look.glasses).toBe(false)
  })

  it('принимает переопределения', () => {
    const look = createAppearance({ facialHair: 'beard', glasses: true, height: 1.9 })
    expect(look.facialHair).toBe('beard')
    expect(look.glasses).toBe(true)
    expect(look.height).toBe(1.9)
  })

  it('зажимает телосложение в диапазон 0..1', () => {
    expect(createAppearance({ build: 5 }).build).toBe(1)
    expect(createAppearance({ build: -3 }).build).toBe(0)
  })
})

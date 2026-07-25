import { describe, expect, it } from 'vitest'
import { createAppearance, DEFAULT_CHARACTER_MODEL } from './appearance'
import {
  CHARACTER_ANIMATIONS_URL,
  characterModelUrls,
  modelUrl,
} from './characterModel'

describe('внешность персонажа', () => {
  it('имеет разумные значения по умолчанию', () => {
    const look = createAppearance()
    expect(look.height).toBeGreaterThan(1.5)
    expect(look.height).toBeLessThan(2.1)
    expect(look.glasses).toBe(false)
  })

  it('без указания модели человек всё равно есть из чего собрать', () => {
    // Иначе тот, кто просто позвал createAppearance(), получил бы описание,
    // по которому нельзя нарисовать ничего.
    expect(createAppearance().model).toEqual(DEFAULT_CHARACTER_MODEL)
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

describe('файлы, из которых собирается человек', () => {
  it('путь до модели складывается из набора и имени', () => {
    expect(modelUrl({ pack: 'women', name: 'SciFi' })).toBe(
      '/models/characters/women/SciFi.glb',
    )
  })

  it('к телу добавляются доноры частей и общий файл анимаций', () => {
    const urls = characterModelUrls({
      base: { pack: 'men', name: 'Casual_Hoodie' },
      parts: {
        Head: { pack: 'men', name: 'Adventurer' },
        Legs: { pack: 'men', name: 'Casual_2' },
      },
    })
    expect(urls).toEqual([
      '/models/characters/men/Casual_Hoodie.glb',
      '/models/characters/men/Adventurer.glb',
      '/models/characters/men/Casual_2.glb',
      CHARACTER_ANIMATIONS_URL,
    ])
  })

  it('один и тот же файл не грузится дважды', () => {
    // Голова и ноги могут прийти из одного донора — грузить его надо один раз.
    const urls = characterModelUrls({
      base: { pack: 'men', name: 'Suit' },
      parts: {
        Head: { pack: 'men', name: 'Casual_2' },
        Legs: { pack: 'men', name: 'Casual_2' },
      },
    })
    expect(urls).toEqual([
      '/models/characters/men/Suit.glb',
      '/models/characters/men/Casual_2.glb',
      CHARACTER_ANIMATIONS_URL,
    ])
  })

  it('порядок постоянен: он задаёт порядок разобранных файлов при сборке', () => {
    const model = {
      base: { pack: 'women', name: 'Casual' } as const,
      parts: { Head: { pack: 'women', name: 'SciFi' } as const },
    }
    expect(characterModelUrls(model)).toEqual(characterModelUrls(model))
  })
})

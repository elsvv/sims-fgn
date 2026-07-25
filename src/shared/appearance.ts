/**
 * Внешность персонажа — общий словарь для контента и рендера.
 *
 * Слои игры выстроены в одну сторону: render → content → sim. Описание
 * внешности нужно обоим верхним слоям сразу: контент говорит, как выглядит
 * Марей, рендер — как это нарисовать. Если бы тип жил в рендере, контент
 * тянул бы из него, и стрелка развернулась бы назад.
 *
 * Поэтому он лежит здесь, в src/shared: слой ниже контента, но выше нуля.
 * Здесь только описания и чистые функции — ни react, ни three, ни данных
 * об университете. За тем, что стрелки не разворачиваются, следит
 * sim/architecture.test.ts.
 */

import type { CharacterModel } from './characterModel'

export type HairStyle = 'short' | 'medium' | 'bald' | 'ponytail'
export type FacialHair = 'none' | 'stubble' | 'beard' | 'moustache'

/**
 * Параметрическое описание внешности. Конкретный человек — это набор
 * значений, а не отдельная модель.
 *
 * Описание одно, а рисующих компонентов два, и они взаимозаменяемы:
 * `GltfCharacter` собирает человека из готовых моделей, `ProceduralCharacter`
 * складывает его из капсул. Второй — не наследие, а запасной путь: файл
 * может не доехать, и остаться без персонажей игра не должна.
 *
 * Поля делятся на две части. Цвета, рост и телосложение действуют
 * в обоих компонентах. `model` — только в первом: он говорит, какие
 * файлы набора дают телу форму. Признаки вроде `hairStyle` и
 * `facialHair` рисует процедурный, а модельному они достаются
 * силуэтом самой модели — гриву и бороду Марею даёт голова
 * из `men/Adventurer`, а не отдельный параметр.
 */
export interface CharacterAppearance {
  /** Рост в метрах. */
  height: number
  /** Телосложение: 0 — худой, 1 — плотный. */
  build: number
  skin: string
  hair: string
  hairStyle: HairStyle
  facialHair: FacialHair
  glasses: boolean
  top: string
  bottom: string
  /** Из каких файлов набора собирается фигура. */
  model: CharacterModel
}

/**
 * Модель человека, о котором ничего не известно: футболка и джинсы.
 * Она же достаётся всем, кто не назвал свою.
 */
export const DEFAULT_CHARACTER_MODEL: CharacterModel = {
  base: { pack: 'men', name: 'Casual_2' },
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function createAppearance(
  overrides: Partial<CharacterAppearance> = {},
): CharacterAppearance {
  const merged: CharacterAppearance = {
    height: 1.75,
    build: 0.4,
    skin: '#e0b48f',
    hair: '#3a2c22',
    hairStyle: 'short',
    facialHair: 'none',
    glasses: false,
    top: '#41516b',
    bottom: '#2d3138',
    model: DEFAULT_CHARACTER_MODEL,
    ...overrides,
  }
  merged.build = clamp01(merged.build)
  return merged
}

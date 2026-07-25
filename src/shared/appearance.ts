export type HairStyle = 'short' | 'medium' | 'bald' | 'ponytail'
export type FacialHair = 'none' | 'stubble' | 'beard' | 'moustache'

/**
 * Параметрическое описание внешности. Конкретный человек — это набор
 * значений, а не отдельная модель. Тех же параметров хватит, чтобы позже
 * выбрать вариант готовой GLTF-модели.
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
    ...overrides,
  }
  merged.build = clamp01(merged.build)
  return merged
}

import { describe, expect, it } from 'vitest'
import { PLAYER_APPEARANCE, TEACHER_APPEARANCES } from '../../content/people/appearances'
import type { CharacterAppearance } from '../../shared/appearance'
import { BACKGROUND_COLORS } from '../building/palette'

/**
 * Читается ли человек с игровой камеры.
 *
 * Камера висит в десяти метрах над этажом и смотрит сверху под углом.
 * С такой высоты от человека остаётся цветное пятно: лица не видно,
 * подписи читать игрок не обязан. Значит, цвет верха — это и есть имя
 * человека, и два похожих цвета на этаже равносильны двум одинаковым
 * людям. Ровно это и было найдено при игре: Павлов и Долгоруков
 * в одинаковых серых футболках (docs/known-issues.md).
 *
 * Порог подобран по самой близкой паре, которую глаз ещё различает:
 * тёмно-синий пиджак Михайловского и синяя футболка Долгорукова.
 * Всё, что ближе, сливается.
 */

const CAST: [string, CharacterAppearance][] = [
  ...Object.entries(TEACHER_APPEARANCES),
  ['игрок', PLAYER_APPEARANCE],
]

/**
 * Насколько два цвета различимы. Евклидово расстояние в RGB: грубо,
 * но честно — от нуля (тот же цвет) до 441 (чёрное против белого).
 */
function distance(first: string, second: string): number {
  const a = channels(first)
  const b = channels(second)
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
}

function channels(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

/** Ниже этого два верха с игровой высоты — один и тот же цвет. */
const READABLE = 60

describe('человека видно и его узнают', () => {
  it('цвет верха уникален у каждого', () => {
    const tops = CAST.map(([, look]) => look.top.toLowerCase())
    expect(new Set(tops).size).toBe(tops.length)
  })

  it('любые двое различаются по верху заметно, а не формально', () => {
    for (let i = 0; i < CAST.length; i++) {
      for (let j = i + 1; j < CAST.length; j++) {
        const [idA, a] = CAST[i]!
        const [idB, b] = CAST[j]!
        expect(distance(a.top, b.top), `${idA} и ${idB}`).toBeGreaterThan(READABLE)
      }
    }
  })

  it('никто не сливается ни с полом, ни со стеной', () => {
    // Первый подбор цветов провалил обе проверки: светло-серый свитер
    // Марея почти совпадал с полом, а кремовая блузка Кречетовой —
    // со стеной. Человек, которого не видно на своём фоне, для игрока
    // не существует.
    for (const [id, look] of CAST) {
      for (const [surface, color] of Object.entries(BACKGROUND_COLORS)) {
        expect(distance(look.top, color), `${id} на фоне «${surface}»`).toBeGreaterThan(
          READABLE,
        )
      }
    }
  })

  it('игрок ярче любого преподавателя', () => {
    // Своя фигура должна находиться взглядом мгновенно и на любом фоне.
    // Тёплый терракотовый верх на этаже больше ни у кого.
    const saturation = (look: CharacterAppearance): number => {
      const { r, g, b } = channels(look.top)
      return Math.max(r, g, b) - Math.min(r, g, b)
    }
    for (const [id, look] of Object.entries(TEACHER_APPEARANCES)) {
      expect(saturation(PLAYER_APPEARANCE), id).toBeGreaterThan(saturation(look))
    }
  })
})

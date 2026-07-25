import { describe, expect, it } from 'vitest'
import type { CharacterAppearance } from '../../render/character/CharacterAppearance'
import { NavGrid } from '../../sim/world/NavGrid'
import { roomCells } from '../../sim/npc/Npc'
import { FLOOR_A2 } from '../floors/floorA2'
import { DEFAULT_APPEARANCE, TEACHER_APPEARANCES } from './appearances'
import { TEACHER_NPCS } from './npcs'
import { TEACHERS } from './teachers'

const LOOKS = Object.entries(TEACHER_APPEARANCES)

/**
 * Признаки, по которым фигуру опознают издали. Цвет верха — первое, что
 * видно; борода и очки — единственные детали лица, различимые с игровой
 * дистанции; рост и телосложение задают саму форму силуэта.
 */
function silhouette(look: CharacterAppearance): string[] {
  return [
    `верх:${look.top.toLowerCase()}`,
    `лицо:${look.facialHair}`,
    `очки:${look.glasses}`,
    `рост:${look.height.toFixed(2)}`,
    `сложение:${Math.round(look.build * 10)}`,
    `причёска:${look.hairStyle}`,
  ]
}

function differences(a: CharacterAppearance, b: CharacterAppearance): number {
  const left = silhouette(a)
  const right = silhouette(b)
  return left.filter((feature, index) => feature !== right[index]).length
}

const HEX = /^#[0-9a-f]{6}$/i

describe('внешность преподавателей', () => {
  it('описан каждый из шестерых и никого лишнего', () => {
    expect(Object.keys(TEACHER_APPEARANCES).sort()).toEqual(Object.keys(TEACHERS).sort())
  })

  it('цвета заданы шестизначным кодом', () => {
    for (const [id, look] of LOOKS) {
      for (const [field, value] of Object.entries({
        skin: look.skin,
        hair: look.hair,
        top: look.top,
        bottom: look.bottom,
      })) {
        expect(value, `${id}.${field}`).toMatch(HEX)
      }
    }
  })

  it('рост и телосложение человеческие', () => {
    for (const [id, look] of LOOKS) {
      expect(look.height, id).toBeGreaterThan(1.5)
      expect(look.height, id).toBeLessThan(2)
      expect(look.build, id).toBeGreaterThanOrEqual(0)
      expect(look.build, id).toBeLessThanOrEqual(1)
    }
  })

  it('ни у кого нет одинакового верха: цвет одежды — главный опознавательный знак', () => {
    const tops = LOOKS.map(([, look]) => look.top.toLowerCase())
    expect(new Set(tops).size).toBe(tops.length)
  })

  it('ни у кого нет одинакового роста', () => {
    const heights = LOOKS.map(([, look]) => look.height)
    expect(new Set(heights).size).toBe(heights.length)
  })

  it('разброс роста заметен на глаз', () => {
    const heights = LOOKS.map(([, look]) => look.height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(0.15)
  })

  it('любые двое различаются не одним признаком, а минимум двумя', () => {
    for (let i = 0; i < LOOKS.length; i++) {
      for (let j = i + 1; j < LOOKS.length; j++) {
        const [idA, a] = LOOKS[i]!
        const [idB, b] = LOOKS[j]!
        expect(differences(a, b), `${idA} и ${idB} слишком похожи`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('лица различаются: борода не у всех и не у одного', () => {
    const faces = LOOKS.map(([, look]) => look.facialHair)
    expect(new Set(faces).size).toBeGreaterThanOrEqual(3)
    expect(faces.filter((face) => face !== 'none').length).toBeGreaterThanOrEqual(2)
  })

  it('очки достались одному — иначе они перестают быть приметой', () => {
    expect(LOOKS.filter(([, look]) => look.glasses).length).toBe(1)
  })

  it('Павлов в очках, Алиева и Марей без них — так на всех фотографиях', () => {
    expect(TEACHER_APPEARANCES.pavlov?.glasses).toBe(true)
    expect(TEACHER_APPEARANCES.alieva?.glasses).toBe(false)
    expect(TEACHER_APPEARANCES.marey?.glasses).toBe(false)
  })

  it('у Алиевой волосы светлее кожи — это её примета', () => {
    const look = TEACHER_APPEARANCES.alieva
    expect(look).toBeDefined()
    expect(luma(look!.hair)).toBeGreaterThan(luma(look!.skin))
    expect(luma(look!.top)).toBeLessThan(60)
  })

  it('Марей крупнее всех и с бородой', () => {
    const marey = TEACHER_APPEARANCES.marey
    expect(marey?.facialHair).toBe('beard')
    for (const [id, look] of LOOKS) {
      if (id === 'marey') continue
      expect(marey!.build, id).toBeGreaterThan(look.build)
    }
  })

  it('запасная внешность отличается от всех шестерых', () => {
    for (const [id, look] of LOOKS) {
      expect(differences(DEFAULT_APPEARANCE, look), id).toBeGreaterThanOrEqual(2)
    }
  })
})

function luma(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('преподаватели как жители этажа', () => {
  const grid = new NavGrid(FLOOR_A2)

  it('в игре ровно шесть NPC — по одному на преподавателя', () => {
    expect(TEACHER_NPCS.length).toBe(Object.keys(TEACHERS).length)
    expect(new Set(TEACHER_NPCS.map((npc) => npc.id)).size).toBe(TEACHER_NPCS.length)
  })

  it('каждый ссылается на существующего преподавателя', () => {
    for (const npc of TEACHER_NPCS) {
      expect(npc.teacherId, npc.id).not.toBeNull()
      expect(TEACHERS[npc.teacherId!], npc.id).toBeDefined()
    }
  })

  it('каждому есть чем выглядеть', () => {
    for (const npc of TEACHER_NPCS) {
      expect(TEACHER_APPEARANCES[npc.teacherId!], npc.id).toBeDefined()
    }
  })

  it('курсы NPC совпадают с курсами преподавателя', () => {
    for (const npc of TEACHER_NPCS) {
      expect(npc.courseIds, npc.id).toEqual(TEACHERS[npc.teacherId!]?.courseIds)
    }
  })

  it('домашнее помещение построено и в него можно войти', () => {
    for (const npc of TEACHER_NPCS) {
      const cells = roomCells(grid, npc.homeRoom)
      expect(cells.length, `${npc.id}: помещение «${npc.homeRoom}»`).toBeGreaterThan(0)
    }
  })

  it('в помещении хватает места всем, кто в нём живёт', () => {
    const perRoom = new Map<string, number>()
    for (const npc of TEACHER_NPCS) {
      perRoom.set(npc.homeRoom, (perRoom.get(npc.homeRoom) ?? 0) + 1)
    }
    for (const [room, count] of perRoom) {
      expect(roomCells(grid, room).length, room).toBeGreaterThanOrEqual(count)
    }
  })
})

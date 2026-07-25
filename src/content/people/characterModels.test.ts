import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CharacterAppearance } from '../../shared/appearance'
import {
  CHARACTER_ANIMATIONS_URL,
  characterModelUrls,
  modelUrl,
  PART_SLOTS,
  type MaterialRole,
} from '../../shared/characterModel'
import {
  ALL_APPEARANCES,
  DEFAULT_APPEARANCE,
  PLAYER_APPEARANCE,
  TEACHER_APPEARANCES,
} from './appearances'
import { TEACHERS } from './teachers'

/**
 * Из чего собран каждый человек.
 *
 * Проверяется не «красиво ли получилось» — это решается глазами, — а то,
 * что сборка вообще возможна: файлы на месте, части названы существующими
 * именами, а описания шестерых не выродились в шесть одинаковых.
 */

const CAST: [string, CharacterAppearance][] = [
  ...Object.entries(TEACHER_APPEARANCES),
  ['player', PLAYER_APPEARANCE],
]

/** Роли, которые умеет назначать перекраска. */
const ROLES: MaterialRole[] = ['skin', 'hair', 'top', 'bottom', 'shoes', 'keep']

function fileOf(url: string): string {
  return join(process.cwd(), 'public', url.replace(/^\//, ''))
}

describe('модели персонажей', () => {
  it('у каждого из шестерых описано, из чего он собран', () => {
    for (const [id] of Object.entries(TEACHER_APPEARANCES)) {
      expect(TEACHERS[id], id).toBeDefined()
    }
    for (const [id, look] of CAST) {
      expect(look.model.base.name, id).toBeTruthy()
      expect(['men', 'women'], id).toContain(look.model.base.pack)
    }
  })

  it('все файлы, которые игра попросит, лежат в public/models/characters', () => {
    const urls = new Set(ALL_APPEARANCES.flatMap((look) => characterModelUrls(look.model)))
    expect(urls.size).toBeGreaterThan(0)
    for (const url of urls) {
      const path = fileOf(url)
      expect(existsSync(path), url).toBe(true)
      expect(statSync(path).size, url).toBeGreaterThan(1024)
    }
  })

  it('файл анимаций один на всех', () => {
    // Скелет у всех моделей набора общий, поэтому клипы лежат отдельно
    // и грузятся один раз. Если бы каждый тащил свои, шестеро принесли бы
    // полтора мегабайта одного и того же.
    for (const [id, look] of CAST) {
      expect(characterModelUrls(look.model), id).toContain(CHARACTER_ANIMATIONS_URL)
    }
  })

  it('в списке файлов нет повторов', () => {
    // Долгоруков и Павлов собраны на одном теле, Марей берёт у того же
    // файла ноги. Грузить его трижды незачем.
    for (const [id, look] of CAST) {
      const urls = characterModelUrls(look.model)
      expect(new Set(urls).size, id).toBe(urls.length)
    }
  })

  it('пересаженные части названы существующими именами частей тела', () => {
    for (const [id, look] of CAST) {
      for (const slot of Object.keys(look.model.parts ?? {})) {
        expect(PART_SLOTS, `${id}: ${slot}`).toContain(slot)
      }
    }
  })

  it('точечная перекраска назначает существующие роли', () => {
    for (const [id, look] of CAST) {
      for (const [material, role] of Object.entries(look.model.roles ?? {})) {
        expect(ROLES, `${id}: ${material}`).toContain(role)
      }
    }
  })

  it('часть не берётся из того же файла, что и база', () => {
    // Такая пересадка ничего не меняет и означает опечатку.
    for (const [id, look] of CAST) {
      for (const [slot, ref] of Object.entries(look.model.parts ?? {})) {
        expect(modelUrl(ref), `${id}: ${slot}`).not.toBe(modelUrl(look.model.base))
      }
    }
  })

  it('Марей узнаётся по бороде и гриве, а не по одежде', () => {
    // Голова с полной бородой и гривой во всём наборе одна: men/Adventurer.
    // Худи её не даёт, поэтому она донорская. Ноги тоже донорские: у худи
    // вместо брюк шорты.
    const marey = TEACHER_APPEARANCES.marey
    expect(marey?.model.parts?.Head?.name).toBe('Adventurer')
    expect(marey?.model.parts?.Legs).toBeDefined()
  })

  it('Долгоруков узнаётся по кудрям — единственной копне в наборе', () => {
    const dolgorukov = TEACHER_APPEARANCES.dolgorukov
    expect(dolgorukov?.model.parts?.Head).toEqual({ pack: 'women', name: 'Formal' })
  })

  it('Павлов и Долгоруков перестали быть близнецами', () => {
    // Ровно та поломка, ради которой всё затевалось: оба собраны
    // на men/Casual_2, и в первой сборке отличались только кроссовками.
    const pavlov = TEACHER_APPEARANCES.pavlov
    const dolgorukov = TEACHER_APPEARANCES.dolgorukov
    expect(pavlov?.model.base).toEqual(dolgorukov?.model.base)
    expect(pavlov?.top).not.toBe(dolgorukov?.top)
    expect(pavlov?.glasses).not.toBe(dolgorukov?.glasses)
    expect(pavlov?.model.parts?.Head).toBeUndefined()
    expect(dolgorukov?.model.parts?.Head).toBeDefined()
  })

  it('игрок собран не так, как любой из шестерых', () => {
    // Игрок не должен читаться как седьмой преподаватель: у него своё
    // тело, а не перекрашенное чужое.
    for (const [id, look] of Object.entries(TEACHER_APPEARANCES)) {
      expect(modelUrl(PLAYER_APPEARANCE.model.base), id).not.toBe(modelUrl(look.model.base))
    }
  })

  it('запасная внешность обходится без пересадок', () => {
    // Она достаётся тому, о ком ничего не известно, и должна собираться
    // из одного файла: сложная сборка для безымянного прохожего — это
    // лишние мегабайты ради человека без имени.
    expect(DEFAULT_APPEARANCE.model.parts).toBeUndefined()
  })
})

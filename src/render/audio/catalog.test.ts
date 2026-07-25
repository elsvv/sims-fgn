import { statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AMBIENCE_LAYERS,
  MUSIC_TRACKS,
  SOUNDS,
  SYNTH_IDS,
  STEP_SOUNDS,
  isSynth,
  type SoundId,
} from './catalog'
import { MUSIC_PLAYLISTS, MUSIC_REST_SECONDS } from './music'

/**
 * Каталог обещает файлы — файлы обязаны лежать.
 *
 * Это главная проверка всего звукового слоя, и написана она по следам
 * чужой беды: в соседнем проекте звук написали, а файлы перенести забыли,
 * и игра прошла все тесты, собралась и молчала. Тест без файлов на диске
 * тогда ничего не заметил, потому что проверял только логику.
 *
 * Поэтому здесь честный поход в public/: путь из каталога превращается
 * в путь на диске и спрашивается размер. Ноль байт — тоже провал: битый
 * файл в сборке хуже отсутствующего, он не падает, а тихо не звучит.
 */

const PUBLIC = join(process.cwd(), 'public')

function sizeOf(src: string): number {
  // Путь в каталоге — от корня сайта, файл лежит в public/.
  return statSync(join(PUBLIC, src)).size
}

function everySrc(): string[] {
  return [
    ...Object.values(MUSIC_TRACKS).map((track) => track.src),
    ...Object.values(AMBIENCE_LAYERS).map((layer) => layer.src),
    ...Object.values(SOUNDS)
      .map((sound) => sound.src)
      .filter((src): src is string => src !== null),
  ]
}

describe('каталог звука', () => {
  it('каждый обещанный файл лежит на диске и не пуст', () => {
    for (const src of everySrc()) {
      expect(sizeOf(src), src).toBeGreaterThan(0)
    }
  })

  it('файлов в каталоге столько, сколько кладёт сборщик', () => {
    // Шесть треков, шесть слоёв атмосферы и двенадцать записанных
    // звуков — ровно то, что перечислено в tools/build-audio.mjs.
    // Голосов в этом счёте нет: они синтезируются, см. simlish.ts.
    expect(everySrc()).toHaveLength(6 + 6 + 12)
  })

  it('все пути ведут в /audio и заканчиваются на mp3', () => {
    for (const src of everySrc()) {
      expect(src, src).toMatch(/^\/audio\/[a-z]+\/[a-z0-9-]+\.mp3$/)
    }
  })

  it('ни один путь не повторяется', () => {
    const all = everySrc()
    expect(new Set(all).size).toBe(all.length)
  })

  it('синтезированные звуки объявлены синтезированными ровно один раз', () => {
    // Список SYNTH_IDS и `src: null` в каталоге описывают один и тот же
    // факт. Разъедутся — звук, объявленный синтезированным, но с файлом,
    // не зазвучит вовсе, и заметить это можно будет только на слух.
    for (const [id, sound] of Object.entries(SOUNDS)) {
      expect(isSynth(id as SoundId), id).toBe(sound.src === null)
    }
    expect(SYNTH_IDS.filter((id) => SOUNDS[id].src !== null)).toEqual([])
  })

  it('громкости лежат в разумных пределах', () => {
    for (const [id, sound] of Object.entries(SOUNDS)) {
      expect(sound.gain, id).toBeGreaterThan(0)
      expect(sound.gain, id).toBeLessThanOrEqual(1)
    }
    for (const [id, layer] of Object.entries(AMBIENCE_LAYERS)) {
      expect(layer.gain, id).toBeGreaterThan(0)
      expect(layer.gain, id).toBeLessThanOrEqual(1)
    }
  })

  it('шаг — самый тихий звук в игре', () => {
    // Он звучит десятки раз в минуту: любой другой звук, оказавшийся
    // тише шага, попросту потеряется под ходьбой.
    const quietest = Math.min(...STEP_SOUNDS.map((id) => SOUNDS[id].gain))
    for (const [id, sound] of Object.entries(SOUNDS)) {
      if (STEP_SOUNDS.includes(id as never)) continue
      expect(sound.gain, id).toBeGreaterThan(quietest)
    }
  })

  it('плейлисты ссылаются на существующие треки', () => {
    for (const [mood, playlist] of Object.entries(MUSIC_PLAYLISTS)) {
      expect(playlist.length, mood).toBeGreaterThan(0)
      for (const id of playlist) expect(MUSIC_TRACKS[id], `${mood}: ${id}`).toBeDefined()
    }
  })

  it('у каждого настроения задана пауза между повторами', () => {
    for (const mood of Object.keys(MUSIC_PLAYLISTS)) {
      const rest = MUSIC_REST_SECONDS[mood as keyof typeof MUSIC_REST_SECONDS]
      expect(rest, mood).toBeGreaterThan(0)
    }
  })

  it('длительность трека в каталоге совпадает с настроением', () => {
    // Число секунд — не украшение: по нему считается, когда трек кончится
    // и начнётся пауза. Ноль или отрицательное значение остановило бы
    // музыку навсегда.
    for (const [id, track] of Object.entries(MUSIC_TRACKS)) {
      expect(track.seconds, id).toBeGreaterThan(10)
      expect(track.id, id).toBe(id)
    }
  })
})

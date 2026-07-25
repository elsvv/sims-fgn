import { describe, expect, it } from 'vitest'
import { FLOOR_A2 } from '../../content/floors/floorA2'
import {
  BUSY_BEFORE_LESSON_MINUTES,
  ambienceFor,
  isAuditorium,
  type AmbienceSituation,
} from './ambience'
import { AMBIENCE_LAYERS } from './catalog'

const CALM: AmbienceSituation = {
  room: 'коридор',
  lessonHere: false,
  minutesToLesson: null,
  night: false,
}

describe('атмосфера по помещению', () => {
  it('у каждого помещения этажа есть свой воздух', () => {
    // Проверка идёт по настоящей планировке, а не по списку строк:
    // дописанная в floorA2.ts комната не должна остаться беззвучной.
    for (const room of FLOOR_A2.rooms) {
      const layer = ambienceFor({ ...CALM, room: room.id })
      expect(layer, room.id).not.toBeNull()
      if (layer !== null) expect(AMBIENCE_LAYERS[layer].id).toBe(layer)
    }
  })

  it('в туалете кафель, в лифтовом холле механизм', () => {
    expect(ambienceFor({ ...CALM, room: 'туалеты' })).toBe('toilet')
    expect(ambienceFor({ ...CALM, room: 'лифтовый холл' })).toBe('elevator-hall')
  })

  it('в аудитории тихо, а во время пары — гомон', () => {
    expect(ambienceFor({ ...CALM, room: 'А-204' })).toBe('lecture')
    expect(ambienceFor({ ...CALM, room: 'А-204', lessonHere: true })).toBe('lecture-class')
    expect(ambienceFor({ ...CALM, room: 'А-206', lessonHere: true })).toBe('lecture-class')
  })

  it('аудитория опознаётся по номеру, а не по списку', () => {
    // Достроенный третий этаж принесёт «А-3xx», и они должны зазвучать
    // аудиториями сами.
    expect(isAuditorium('А-204')).toBe(true)
    expect(isAuditorium('А-311')).toBe(true)
    expect(isAuditorium('коридор')).toBe(false)
    expect(isAuditorium('лифтовый холл')).toBe(false)
    expect(ambienceFor({ ...CALM, room: 'А-311', lessonHere: true })).toBe('lecture-class')
  })

  it('перед парой коридор наполняется', () => {
    expect(ambienceFor({ ...CALM, minutesToLesson: 5 })).toBe('corridor-busy')
    expect(ambienceFor({ ...CALM, minutesToLesson: BUSY_BEFORE_LESSON_MINUTES })).toBe(
      'corridor-busy',
    )
    expect(ambienceFor({ ...CALM, minutesToLesson: BUSY_BEFORE_LESSON_MINUTES + 1 })).toBe(
      'corridor',
    )
    expect(ambienceFor({ ...CALM, minutesToLesson: null })).toBe('corridor')
  })

  it('ночью коридор пуст, даже если утром пара', () => {
    expect(ambienceFor({ ...CALM, minutesToLesson: 5, night: true })).toBe('corridor')
  })

  it('гомон в коридоре не зависит от пары в аудитории', () => {
    // lessonHere относится к помещению игрока: в коридоре пар не бывает.
    expect(ambienceFor({ ...CALM, lessonHere: true })).toBe('corridor')
  })

  it('в дверях звучит то же, что звучало', () => {
    // Дверные проёмы не принадлежат никакому помещению. Без этого правила
    // каждый вход в аудиторию давал бы секунду тишины посреди перехода.
    expect(ambienceFor({ ...CALM, room: null }, 'corridor')).toBe('corridor')
    expect(ambienceFor({ ...CALM, room: null }, 'toilet')).toBe('toilet')
    expect(ambienceFor({ ...CALM, room: null }, null)).toBeNull()
  })

  it('незнакомое помещение не обрывает звук', () => {
    // Библиотеки и столовой на этаже ещё нет; когда появятся, у них
    // будет свой слой. До тех пор молчать посреди игры незачем.
    expect(ambienceFor({ ...CALM, room: 'библиотека' }, 'corridor')).toBe('corridor')
  })

  it('решение зависит только от обстановки, а не от порядка вызовов', () => {
    const twice = ambienceFor(
      { ...CALM, room: 'туалеты' },
      ambienceFor({ ...CALM, room: 'туалеты' }),
    )
    expect(twice).toBe('toilet')
  })
})

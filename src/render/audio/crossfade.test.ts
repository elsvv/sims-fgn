import { describe, expect, it } from 'vitest'
import {
  AMBIENCE_FADE_IN,
  AMBIENCE_FADE_OUT,
  MUSIC_FADE_IN,
  MUSIC_FADE_OUT,
  planCrossfade,
  type CrossfadeInput,
} from './crossfade'

const BASE: CrossfadeInput = {
  now: 100,
  current: null,
  next: null,
  currentGain: 1,
  targetGain: 0.8,
  fadeOut: 2,
  fadeIn: 3,
}

describe('расписание кроссфейда', () => {
  it('тот же источник не трогается', () => {
    expect(planCrossfade({ ...BASE, current: 'коридор', next: 'коридор' })).toEqual({
      kind: 'keep',
    })
    expect(planCrossfade(BASE)).toEqual({ kind: 'keep' })
  })

  it('из тишины — только разгорание', () => {
    const plan = planCrossfade({ ...BASE, next: 'коридор' })
    expect(plan.kind).toBe('start')
    if (plan.kind !== 'start') return
    expect(plan.in).toEqual([
      { at: 100, gain: 0 },
      { at: 103, gain: 0.8 },
    ])
  })

  it('в тишину — только спад, и остановка в его конце', () => {
    const plan = planCrossfade({ ...BASE, current: 'коридор' })
    expect(plan.kind).toBe('stop')
    if (plan.kind !== 'stop') return
    expect(plan.out).toEqual([
      { at: 100, gain: 1 },
      { at: 102, gain: 0 },
    ])
    expect(plan.stopAt).toBe(102)
  })

  it('смена источника — это два встречных склона', () => {
    const plan = planCrossfade({ ...BASE, current: 'коридор', next: 'туалет' })
    expect(plan.kind).toBe('swap')
    if (plan.kind !== 'swap') return
    expect(plan.out[0]).toEqual({ at: 100, gain: 1 })
    expect(plan.in[0]).toEqual({ at: 100, gain: 0 })
    // Оба склона начинаются в один и тот же миг: это и делает переход
    // переходом, а не паузой между двумя записями.
    expect(plan.out[0]?.at).toBe(plan.in[0]?.at)
  })

  it('спад начинается с той громкости, на которой источник застали', () => {
    // Игрок, вбежавший в туалет и тут же выбежавший, застаёт коридор
    // на половине разгорания. Спад обязан начаться оттуда, иначе
    // громкость прыгнет вверх, чтобы потом упасть.
    const plan = planCrossfade({ ...BASE, current: 'коридор', currentGain: 0.3 })
    expect(plan.kind).toBe('stop')
    if (plan.kind !== 'stop') return
    expect(plan.out[0]?.gain).toBe(0.3)
  })

  it('мгновенных переходов не бывает', () => {
    // Нулевая длительность рампы в Web Audio — это щелчок.
    const plan = planCrossfade({ ...BASE, next: 'коридор', fadeIn: 0 })
    expect(plan.kind).toBe('start')
    if (plan.kind !== 'start') return
    expect(plan.in[1]?.at).toBeGreaterThan(100)
  })

  it('порченые числа не ломают расписание', () => {
    const plan = planCrossfade({
      ...BASE,
      current: 'коридор',
      fadeOut: Number.NaN,
    })
    expect(plan.kind).toBe('stop')
    if (plan.kind !== 'stop') return
    expect(Number.isFinite(plan.stopAt)).toBe(true)
  })

  it('атмосфера перетекает медленнее музыки', () => {
    // Смена трека — событие, её слышно. Смена воздуха в помещении
    // должна пройти незамеченной.
    expect(AMBIENCE_FADE_IN).toBeGreaterThan(MUSIC_FADE_IN)
    expect(AMBIENCE_FADE_OUT).toBeGreaterThan(MUSIC_FADE_OUT)
  })

  it('новый источник разгорается дольше, чем гаснет старый', () => {
    // Иначе на середине перехода громко звучат оба разом.
    expect(MUSIC_FADE_IN).toBeGreaterThan(MUSIC_FADE_OUT)
    expect(AMBIENCE_FADE_IN).toBeGreaterThan(AMBIENCE_FADE_OUT)
  })
})

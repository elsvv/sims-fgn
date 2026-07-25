import { describe, expect, it } from 'vitest'
import { magnitudeOf } from '../dialogue/Consequences'
import {
  describeStanding,
  RelationshipMap,
  relationshipLevel,
  standingMagnitude,
  standingOf,
} from './Relationship'

describe('уровень отношений', () => {
  it('незнакомец по умолчанию', () => {
    expect(relationshipLevel({ affection: 0, respect: 0 })).toBe('stranger')
  })

  it('враждебность при заметном минусе', () => {
    expect(relationshipLevel({ affection: -60, respect: -40 })).toBe('hostile')
  })

  it('уважение без симпатии — это знакомство, а не дружба', () => {
    expect(relationshipLevel({ affection: 5, respect: 80 })).toBe('acquaintance')
  })

  it('симпатия делает отношения дружескими', () => {
    expect(relationshipLevel({ affection: 45, respect: 20 })).toBe('friendly')
  })

  it('близкие отношения требуют и симпатии, и уважения', () => {
    expect(relationshipLevel({ affection: 75, respect: 70 })).toBe('close')
    expect(relationshipLevel({ affection: 75, respect: 10 })).not.toBe('close')
  })
})

describe('RelationshipMap', () => {
  it('незнакомые начинаются с нуля', () => {
    expect(new RelationshipMap().get('marey')).toEqual({ affection: 0, respect: 0 })
  })

  it('изменяет отношения дельтой', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 12 })
    map.adjust('marey', { respect: 8, affection: -5 })
    expect(map.get('marey')).toEqual({ affection: -5, respect: 20 })
  })

  it('зажимает в диапазон от -100 до 100', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 500 })
    expect(map.get('marey').respect).toBe(100)
    map.adjust('marey', { respect: -500 })
    expect(map.get('marey').respect).toBe(-100)
  })

  it('не путает разных людей', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 30 })
    expect(map.get('alieva')).toEqual({ affection: 0, respect: 0 })
  })

  it('описывает отношения по-русски', () => {
    const map = new RelationshipMap()
    expect(map.describeFor('marey')).toBe('Незнакомы')
    map.adjust('marey', { affection: 80, respect: 70 })
    expect(map.describeFor('marey')).toBe('Близкие отношения')
  })

  it('переживает сохранение и загрузку', () => {
    const map = new RelationshipMap()
    map.adjust('alieva', { respect: 40 })
    const restored = RelationshipMap.fromJSON(JSON.parse(JSON.stringify(map.toJSON())))
    expect(restored.get('alieva').respect).toBe(40)
  })

  it('загрузка заменяет прежние отношения, а не добавляется к ним', () => {
    // Мир загружает сохранение в существующую карту: отношения, нажитые
    // после сохранения, обязаны исчезнуть вместе с остальным.
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 30 })
    map.adjust('alieva', { affection: 20 })

    map.load({ marey: { affection: 0, respect: 5 } })
    expect(map.get('marey')).toEqual({ affection: 0, respect: 5 })
    expect(map.get('alieva')).toEqual({ affection: 0, respect: 0 })
  })

  it('загруженная карта не связана с исходными данными', () => {
    const data = { marey: { affection: 1, respect: 2 } }
    const map = RelationshipMap.fromJSON(data)
    map.adjust('marey', { respect: 10 })
    expect(data.marey.respect).toBe(2)
  })
})

/*
 * Панель людей говорила числами: «+8 / −6». Число здесь не значит ничего —
 * шкалы отношений игрок нигде не видит и сравнить эти восемь единиц ему
 * не с чем. Наружу выходят слова, а величину показывают стрелки.
 */
describe('отношения словами', () => {
  it('о том, чего не было, не рассказывают', () => {
    expect(describeStanding('affection', 0)).toBeNull()
    expect(standingOf({ affection: 0, respect: 0 })).toEqual([])
  })

  it('доли единицы отношениями не считаются', () => {
    expect(describeStanding('respect', 0.4)).toBeNull()
  })

  it('величина растёт по ступеням', () => {
    expect(standingMagnitude(8)).toBe('slight')
    expect(standingMagnitude(25)).toBe('noticeable')
    expect(standingMagnitude(70)).toBe('strong')
    expect(standingMagnitude(-70)).toBe('strong')
  })

  it('ступени отношений не те же, что у одной реплики', () => {
    // Десять единиц уважения за фразу — много, за весь модуль — начало
    // знакомства. Совпадение шкал означало бы, что панель врёт вдвое.
    expect(magnitudeOf(10)).toBe('strong')
    expect(standingMagnitude(10)).toBe('slight')
  })

  it('симпатия и уважение описаны разными словами', () => {
    const affection = describeStanding('affection', 40)
    const respect = describeStanding('respect', 40)
    expect(affection?.text).toBe('Симпатия: вас здесь любят')
    expect(respect?.text).toBe('Уважение: ценят как сильного студента')
  })

  it('в минус и в плюс говорят разное', () => {
    expect(describeStanding('respect', 20)?.text).toBe('Уважение: с вами считаются')
    expect(describeStanding('respect', -20)?.text).toBe('Уважение: на вас махнули рукой')
  })

  it('ни в одной фразе нет чисел', () => {
    for (const value of [-90, -50, -20, -5, 5, 20, 50, 90]) {
      for (const standing of standingOf({ affection: value, respect: -value })) {
        expect(standing.text, `${value}`).not.toMatch(/\d/)
      }
    }
  })

  it('направление показано стрелками: одна — чуть, три — сильно', () => {
    expect(describeStanding('affection', 5)?.marker).toBe('↑')
    expect(describeStanding('affection', 25)?.marker).toBe('↑↑')
    expect(describeStanding('affection', 80)?.marker).toBe('↑↑↑')
    expect(describeStanding('affection', -80)?.marker).toBe('↓↓↓')
    expect(describeStanding('affection', -80)?.direction).toBe('down')
  })

  it('человек с двумя измерениями получает две строки, с одним — одну', () => {
    expect(standingOf({ affection: 20, respect: -30 }).map((item) => item.dimension)).toEqual([
      'affection',
      'respect',
    ])
    expect(standingOf({ affection: 0, respect: 30 }).map((item) => item.dimension)).toEqual([
      'respect',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { RelationshipMap, relationshipLevel } from './Relationship'

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

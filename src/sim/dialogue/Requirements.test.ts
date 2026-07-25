import { describe, expect, it } from 'vitest'
import { SKILL_IDS, SKILL_NEEDS } from '../player/Skills'
import type { DialogueRequirement } from './Dialogue'
import { describeRequirement, requirementParts } from './Requirements'

describe('чего не хватает для реплики', () => {
  it('без требований подсказки нет', () => {
    expect(describeRequirement(undefined)).toBeNull()
    expect(describeRequirement({})).toBeNull()
    expect(requirementParts({})).toEqual([])
  })

  it('навык называется по-человечески, а не идентификатором', () => {
    const requirement: DialogueRequirement = { skillId: 'ancientLanguages', skillMin: 4 }
    expect(describeRequirement(requirement)).toBe('нужны древние языки')
  })

  it('у каждого навыка есть своя грамматически верная фраза', () => {
    for (const id of SKILL_IDS) {
      const phrase = describeRequirement({ skillId: id, skillMin: 1 })
      expect(phrase, id).toBe(SKILL_NEEDS[id])
      expect(phrase, id).toMatch(/^нуж/)
    }
  })

  it('незнакомый навык не роняет подсказку', () => {
    expect(describeRequirement({ skillId: 'латынь', skillMin: 2 })).toBe('нужен навык «латынь»')
  })

  it('шкала традиций описывается стороной, а не числом', () => {
    expect(describeRequirement({ factionMin: 25 })).toBe(
      'нужно быть ближе к континентальной традиции',
    )
    expect(describeRequirement({ factionMax: -25 })).toBe(
      'нужно быть ближе к аналитической традиции',
    )
  })

  it('отношения описываются отношением, а не баллом', () => {
    expect(describeRequirement({ respectMin: 20 })).toBe('нужно, чтобы вас ценили больше')
    expect(describeRequirement({ affectionMin: 20 })).toBe('нужно, чтобы к вам лучше относились')
  })

  it('книга называется, если её название известно', () => {
    const labels = { books: { phaedo: 'Платон. «Федон»' } }
    expect(describeRequirement({ book: 'phaedo' }, labels)).toBe(
      'нужно прочитать Платон. «Федон»',
    )
  })

  it('книга без названия остаётся книгой', () => {
    expect(describeRequirement({ book: 'phaedo' })).toBe('нужно прочитать книгу')
  })

  it('несколько условий перечисляются через запятую', () => {
    const phrase = describeRequirement({
      skillId: 'logic',
      skillMin: 3,
      respectMin: 10,
    })
    expect(phrase).toBe('нужна логика, нужно, чтобы вас ценили больше')
  })

  it('в подсказке нет ни одной цифры: это намёк о мире, а не о таблице', () => {
    const requirements: DialogueRequirement[] = [
      { skillId: 'ancientLanguages', skillMin: 9 },
      { factionMin: 70 },
      { factionMax: -70 },
      { respectMin: 45 },
      { affectionMin: 45 },
      { book: 'phaedo' },
    ]
    for (const requirement of requirements) {
      expect(describeRequirement(requirement)).not.toMatch(/\d/)
    }
  })
})

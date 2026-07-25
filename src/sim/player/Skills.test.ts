import { describe, expect, it } from 'vitest'
import { isAvailable, type DialogueContext } from '../dialogue/Dialogue'
import { createRelationship } from '../social/Relationship'
import {
  createSkills,
  gainSkill,
  isSkillId,
  learningEfficiency,
  MAX_SKILL,
  SKILL_IDS,
  SKILL_LABELS,
  SKILL_SOURCES,
  skillLevelLabel,
} from './Skills'

describe('навыки', () => {
  it('в игре шесть навыков', () => {
    expect(SKILL_IDS.length).toBe(6)
    expect(new Set(SKILL_IDS).size).toBe(6)
  })

  it('у каждого навыка есть подпись и источник прокачки на русском', () => {
    for (const id of SKILL_IDS) {
      expect(SKILL_LABELS[id].trim().length, id).toBeGreaterThan(0)
      expect(SKILL_LABELS[id], id).toMatch(/[А-Яа-яЁё]/)
      expect(SKILL_SOURCES[id].trim().length, id).toBeGreaterThan(0)
      expect(SKILL_SOURCES[id], id).toMatch(/[А-Яа-яЁё]/)
    }
  })

  it('подписи не повторяются', () => {
    const labels = SKILL_IDS.map((id) => SKILL_LABELS[id])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('создаются нулевыми', () => {
    const skills = createSkills()
    for (const id of SKILL_IDS) expect(skills[id], id).toBe(0)
  })

  it('принимают переопределения при создании', () => {
    expect(createSkills({ logic: 4 }).logic).toBe(4)
  })

  it('зажимают переопределения в 0..10', () => {
    expect(createSkills({ logic: 40 }).logic).toBe(MAX_SKILL)
    expect(createSkills({ logic: -5 }).logic).toBe(0)
  })

  it('прокачка возвращает новый объект и не мутирует исходный', () => {
    const before = createSkills()
    const after = gainSkill(before, 'eloquence', 2)
    expect(before.eloquence).toBe(0)
    expect(after.eloquence).toBeGreaterThan(0)
    expect(after).not.toBe(before)
  })

  it('прокачка не задевает соседние навыки', () => {
    const after = gainSkill(createSkills({ logic: 3 }), 'eloquence', 2)
    expect(after.logic).toBe(3)
  })

  it('навык не выходит за потолок', () => {
    let skills = createSkills({ endurance: 9.5 })
    for (let i = 0; i < 500; i++) skills = gainSkill(skills, 'endurance', 5)
    expect(skills.endurance).toBe(MAX_SKILL)
  })

  it('навык не уходит ниже нуля', () => {
    expect(gainSkill(createSkills({ logic: 1 }), 'logic', -10).logic).toBe(0)
  })

  it('одно и то же усилие даёт заметно меньший прирост на высоком уровне', () => {
    const lowBefore = 2
    const highBefore = 8
    const effort = 1

    const lowGain = gainSkill(createSkills({ logic: lowBefore }), 'logic', effort).logic - lowBefore
    const highGain =
      gainSkill(createSkills({ logic: highBefore }), 'logic', effort).logic - highBefore

    expect(lowGain).toBeGreaterThan(0)
    expect(highGain).toBeGreaterThan(0)
    expect(highGain).toBeLessThan(lowGain / 2)
  })

  it('замедление монотонно: чем выше уровень, тем меньше отдача', () => {
    for (let level = 0; level < MAX_SKILL; level++) {
      expect(learningEfficiency(level + 1), `${level} → ${level + 1}`).toBeLessThan(
        learningEfficiency(level),
      )
    }
  })

  it('даже на потолке отдача не нулевая — иначе десятка недостижима', () => {
    expect(learningEfficiency(MAX_SKILL)).toBeGreaterThan(0)
  })

  it('десятка достижима за конечное, но большое число занятий', () => {
    let skills = createSkills()
    let lessons = 0
    while (skills.ancientLanguages < MAX_SKILL && lessons < 100000) {
      skills = gainSkill(skills, 'ancientLanguages', 0.5)
      lessons++
    }
    expect(skills.ancientLanguages).toBe(MAX_SKILL)
    expect(lessons).toBeGreaterThan(40)
  })

  it('потеря навыка не проходит через замедление', () => {
    expect(gainSkill(createSkills({ logic: 9 }), 'logic', -1).logic).toBeCloseTo(8, 10)
  })

  it('словесная оценка растёт вместе с уровнем и всегда на русском', () => {
    const labels = [0, 2, 4, 6, 8, 10].map(skillLevelLabel)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label).toMatch(/^[а-яё]/)
  })

  it('крайние уровни описаны по-разному', () => {
    expect(skillLevelLabel(0)).toBe('не начинал')
    expect(skillLevelLabel(MAX_SKILL)).toBe('выше программы')
  })

  it('годятся как есть для проверки требований диалога', () => {
    const context: DialogueContext = {
      skills: createSkills({ ancientLanguages: 5 }),
      faction: 0,
      relationship: createRelationship(),
      readBooks: [],
      moodlets: [],
      visitedNodes: [],
      day: 0,
    }
    const requirement = { skillId: 'ancientLanguages', skillMin: 4 }

    expect(isAvailable(requirement, context)).toBe(true)
    expect(isAvailable({ ...requirement, skillMin: 7 }, context)).toBe(false)
  })
})

describe('опознание идентификатора навыка', () => {
  it('узнаёт все навыки из списка', () => {
    for (const id of SKILL_IDS) expect(isSkillId(id), id).toBe(true)
  })

  it('не узнаёт постороннюю строку', () => {
    expect(isSkillId('латынь')).toBe(false)
    expect(isSkillId('')).toBe(false)
    expect(isSkillId('Logic')).toBe(false)
  })
})

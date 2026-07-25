import { describe, expect, it } from 'vitest'
import { SKILL_LABELS } from '../player/Skills'
import {
  describeWeekend,
  findWeekendOption,
  MIN_WEEKEND_OPTIONS,
  validateWeekendOption,
  validateWeekendOptions,
  WEEKEND_SKILL_GAIN_LIMIT,
  type WeekendOption,
} from './Weekend'

function option(overrides: Partial<WeekendOption> = {}): WeekendOption {
  return {
    id: 'read',
    title: 'Читать',
    description: 'Просидеть день с текстом.',
    needDelta: { social: -30, fun: -10 },
    outcome: 'К вечеру вы прочли тридцать страниц и поняли, что первые двадцать надо перечитать.',
    ...overrides,
  }
}

function fourOptions(): WeekendOption[] {
  return ['read', 'sleep', 'walk', 'bar'].map((id, index) =>
    option({ id, title: `Вариант ${index}` }),
  )
}

describe('выбор выходного', () => {
  it('находит вариант по идентификатору', () => {
    expect(findWeekendOption(fourOptions(), 'walk')?.id).toBe('walk')
    expect(findWeekendOption(fourOptions(), 'нет-такого')).toBeUndefined()
  })
})

describe('рассказ о выходном', () => {
  it('возвращает авторский текст, а не сводку чисел', () => {
    const report = describeWeekend(option())
    expect(report.title).toBe('Читать')
    expect(report.outcome).toContain('перечитать')
  })

  it('описывает сдвиг взглядов словами', () => {
    const report = describeWeekend(option({ factionShift: 6 }))
    expect(report.changes.some((change) => change.dimension === 'faction')).toBe(true)
    expect(report.changes[0]?.text).toContain('континентальной')
  })

  it('называет навык человеческим именем', () => {
    const report = describeWeekend(
      option({ skills: [{ id: 'germanClassics', amount: 0.9 }] }),
      SKILL_LABELS,
    )
    expect(report.changes.some((change) => change.text.includes('Немецкая классика'))).toBe(true)
  })

  it('из нескольких навыков называет главный: перечень читается как накладная', () => {
    const report = describeWeekend(
      option({
        skills: [
          { id: 'ancientLanguages', amount: 0.4 },
          { id: 'germanClassics', amount: 0.9 },
        ],
      }),
      SKILL_LABELS,
    )
    const skills = report.changes.filter((change) => change.dimension === 'skill')
    expect(skills).toHaveLength(1)
    expect(skills[0]?.text).toContain('Немецкая классика')
  })

  it('нужды в список изменений не попадают: игрок и так видит полоски', () => {
    const report = describeWeekend(option({ needDelta: { energy: 55, stress: -30 } }))
    expect(report.changes).toEqual([])
  })

  it('приписки мира передаются как есть', () => {
    const report = describeWeekend(option(), SKILL_LABELS, ['Эссе «Кант» продвинулось.'])
    expect(report.notes).toEqual(['Эссе «Кант» продвинулось.'])
  })
})

describe('проверка данных', () => {
  it('корректный вариант проходит', () => {
    expect(validateWeekendOption(option())).toEqual([])
    expect(validateWeekendOptions(fourOptions())).toEqual([])
  })

  it('ловит вариант без текста', () => {
    expect(validateWeekendOption(option({ title: ' ' }))).toHaveLength(1)
    expect(validateWeekendOption(option({ description: '' }))).toHaveLength(1)
    expect(validateWeekendOption(option({ outcome: '' }))).toHaveLength(1)
  })

  it('ловит выходной, который ничего не меняет', () => {
    expect(validateWeekendOption(option({ needDelta: {} }))).toHaveLength(1)
  })

  it('ловит слишком щедрый выходной', () => {
    const greedy = option({
      skills: [{ id: 'logic', amount: WEEKEND_SKILL_GAIN_LIMIT + 1 }],
    })
    expect(validateWeekendOption(greedy)).toHaveLength(1)
  })

  it('ловит отрицательное время работы над эссе', () => {
    expect(validateWeekendOption(option({ essayMinutes: -10 }))).toHaveLength(1)
  })

  it('требует не меньше четырёх вариантов: иначе это не выбор', () => {
    const three = fourOptions().slice(0, 3)
    expect(validateWeekendOptions(three)).toHaveLength(1)
    expect(MIN_WEEKEND_OPTIONS).toBe(4)
  })

  it('ловит повторяющиеся идентификаторы и заголовки', () => {
    const twins = fourOptions()
    twins[1] = option({ id: 'read', title: 'Вариант 0' })
    expect(validateWeekendOptions(twins).length).toBeGreaterThanOrEqual(2)
  })

  it('пустой набор не ругается: мир без выходных — это тестовый мир', () => {
    expect(validateWeekendOptions([])).toEqual([])
  })
})

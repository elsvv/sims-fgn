import { describe, expect, it } from 'vitest'
import { createSkills } from '../player/Skills'
import { rankAmong } from '../study/Rating'
import {
  attendanceRate,
  buildEpilogue,
  inRange,
  matchesCondition,
  psycheLabel,
  selectEpilogue,
  validateEpilogueRules,
  type EpilogueFacts,
  type EpilogueRule,
} from './Epilogue'

function facts(overrides: Partial<EpilogueFacts> = {}): EpilogueFacts {
  return {
    courses: [
      {
        id: 'logic',
        title: 'Логика',
        short: 'Логика',
        teacherName: 'Долгоруков Виталий Владимирович',
        grade: 6,
        passed: true,
      },
    ],
    gpa: 6,
    debts: [],
    rating: null,
    people: [
      {
        id: 'dolgorukov',
        name: 'Долгоруков Виталий Владимирович',
        respect: 10,
        affection: 0,
        level: 'Знакомы',
      },
    ],
    faction: 0,
    averageStress: 30,
    skills: createSkills(),
    booksRead: 0,
    attendance: { present: 10, late: 0, absent: 0 },
    seminarsSpoken: 4,
    ...overrides,
  }
}

const FALLBACK: EpilogueRule = {
  id: 'survivor',
  title: 'Дожил до конца модуля',
  story: 'Шесть недель кончились.',
  priority: 0,
  when: {},
}

describe('диапазоны', () => {
  it('обе границы включительны', () => {
    expect(inRange(5, { min: 5 })).toBe(true)
    expect(inRange(5, { max: 5 })).toBe(true)
    expect(inRange(4, { min: 5 })).toBe(false)
    expect(inRange(6, { max: 5 })).toBe(false)
  })

  it('пустой диапазон подходит всему', () => {
    expect(inRange(-100, {})).toBe(true)
  })
})

describe('условия концовок', () => {
  it('пустое условие выполняется всегда', () => {
    expect(matchesCondition({}, facts())).toBe(true)
  })

  it('перечисленные поля соединяются через «и»', () => {
    const condition = { gpa: { min: 5 }, stress: { max: 20 } }
    expect(matchesCondition(condition, facts())).toBe(false)
    expect(matchesCondition(condition, facts({ averageStress: 10 }))).toBe(true)
  })

  it('уважение конкретного человека проверяется по нему, а не по лучшему', () => {
    const condition = { respectOf: { personId: 'mikhailovsky', min: 30 } }
    expect(matchesCondition(condition, facts())).toBe(false)

    const withMikhailovsky = facts({
      people: [
        {
          id: 'mikhailovsky',
          name: 'Михайловский Александр Владиславович',
          respect: 40,
          affection: 0,
          level: 'Знакомы',
        },
      ],
    })
    expect(matchesCondition(condition, withMikhailovsky)).toBe(true)
  })

  it('оценка по конкретной дисциплине проверяется по ней', () => {
    expect(matchesCondition({ gradeOf: { courseId: 'logic', max: 3 } }, facts())).toBe(false)
    expect(
      matchesCondition(
        { gradeOf: { courseId: 'logic', max: 3 } },
        facts({ courses: [{ ...facts().courses[0]!, grade: 2 }] }),
      ),
    ).toBe(true)
  })

  it('условие про несуществующего человека не выполняется молча', () => {
    expect(matchesCondition({ respectOf: { personId: 'нет-такого', min: 0 } }, facts())).toBe(
      false,
    )
  })

  it('навык берётся по идентификатору', () => {
    const skilled = facts({ skills: createSkills({ germanClassics: 6 }) })
    expect(matchesCondition({ skill: { id: 'germanClassics', min: 4 } }, skilled)).toBe(true)
    expect(matchesCondition({ skill: { id: 'logic', min: 4 } }, skilled)).toBe(false)
  })

  it('посещаемость считается долей, а не числом пар', () => {
    const truant = facts({ attendance: { present: 2, late: 0, absent: 8 } })
    expect(matchesCondition({ attendance: { max: 0.35 } }, truant)).toBe(true)
    expect(matchesCondition({ attendance: { max: 0.35 } }, facts())).toBe(false)
  })

  it('несостоявшийся модуль считается посещённым: делить не на что', () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0 })).toBe(1)
  })

  it('опоздание засчитывается как приход', () => {
    expect(attendanceRate({ present: 0, late: 4, absent: 0 })).toBe(1)
  })
})

describe('выбор концовки', () => {
  const rules: EpilogueRule[] = [
    FALLBACK,
    { id: 'burnout', title: 'Выгорел', story: '…', priority: 80, when: { stress: { min: 60 } } },
    {
      id: 'excellent',
      title: 'Отличник',
      story: '…',
      priority: 90,
      when: { gpa: { min: 8 } },
    },
  ]

  it('побеждает подошедшее правило с наибольшим приоритетом', () => {
    const both = facts({ gpa: 9, averageStress: 70 })
    expect(selectEpilogue(both, rules)?.id).toBe('excellent')
  })

  it('когда частное не подошло, срабатывает общее', () => {
    expect(selectEpilogue(facts(), rules)?.id).toBe('survivor')
  })

  it('порядок в каталоге не решает: решает приоритет', () => {
    const reversed = [...rules].reverse()
    const both = facts({ gpa: 9, averageStress: 70 })
    expect(selectEpilogue(both, reversed)?.id).toBe('excellent')
  })

  it('пустой каталог возвращает пустоту, а не падает', () => {
    expect(selectEpilogue(facts(), [])).toBeNull()
  })
})

describe('проверка каталога концовок', () => {
  it('корректный каталог проходит', () => {
    expect(validateEpilogueRules([FALLBACK])).toEqual([])
  })

  it('требует безусловную концовку', () => {
    const conditional: EpilogueRule = { ...FALLBACK, when: { gpa: { min: 8 } } }
    expect(validateEpilogueRules([conditional])).toHaveLength(1)
  })

  it('ловит повторы и пустые тексты', () => {
    expect(validateEpilogueRules([FALLBACK, FALLBACK])).toHaveLength(1)
    expect(validateEpilogueRules([{ ...FALLBACK, title: ' ' }])).toHaveLength(1)
    expect(validateEpilogueRules([{ ...FALLBACK, story: '' }])).toHaveLength(1)
  })
})

describe('состояние психики', () => {
  it('спокойному модулю — своё название, выжженному — своё', () => {
    expect(psycheLabel(5)).toBe('Психика цела')
    expect(psycheLabel(90)).not.toBe(psycheLabel(5))
  })

  it('каждому уровню стресса находится название и трактовка', () => {
    for (let stress = 0; stress <= 100; stress += 5) {
      expect(psycheLabel(stress).length, String(stress)).toBeGreaterThan(0)
    }
  })
})

describe('эпилог целиком', () => {
  it('берёт название и рассказ из сработавшей концовки', () => {
    const report = buildEpilogue(facts(), [FALLBACK])
    expect(report.endingId).toBe('survivor')
    expect(report.title).toBe('Дожил до конца модуля')
    expect(report.story).toBe('Шесть недель кончились.')
  })

  it('пустой каталог не оставляет игрока без эпилога', () => {
    const report = buildEpilogue(facts(), [])
    expect(report.title.length).toBeGreaterThan(0)
    expect(report.story.length).toBeGreaterThan(0)
  })

  it('в сводке есть ведомость, взгляды и психика', () => {
    const story = buildEpilogue(facts(), [FALLBACK]).paragraphs.join(' ')
    expect(story).toContain('Ведомость на конец модуля')
    expect(story).toContain('Логика — шесть')
    expect(story).toContain('Ещё не определился')
    expect(story).toContain(psycheLabel(30))
  })

  it('оценки названы словами, а не выведены таблицей', () => {
    const story = buildEpilogue(facts({ gpa: null, rating: null }), [FALLBACK]).paragraphs.join(
      ' ',
    )
    expect(story).not.toMatch(/Логика — 6/)
  })

  it('задолженности названы поимённо и с объяснением', () => {
    const story = buildEpilogue(facts({ debts: ['Логика', 'НИС'] }), [FALLBACK]).paragraphs.join(
      ' ',
    )
    expect(story).toContain('Задолженности: Логика и НИС')
    expect(story).toContain('накопленная не меняется')
  })

  it('без задолженностей о них молчит', () => {
    expect(buildEpilogue(facts(), [FALLBACK]).paragraphs.join(' ')).not.toContain(
      'Задолженности:',
    )
  })

  it('рейтинг показывает место, размер потока и словесную оценку', () => {
    const rating = rankAmong(6, [9, 8, 7, 5, 4])
    const story = buildEpilogue(facts({ rating }), [FALLBACK]).paragraphs.join(' ')
    expect(story).toContain('4 место из 6')
    expect(story).toContain(rating.label)
  })

  it('перечисляет отношения с каждым человеком', () => {
    const story = buildEpilogue(facts(), [FALLBACK]).paragraphs.join(' ')
    expect(story).toContain('Долгоруков Виталий Владимирович — знакомы')
  })

  it('пустая ведомость называется своим именем', () => {
    const story = buildEpilogue(facts({ courses: [], gpa: null }), [FALLBACK]).paragraphs.join(
      ' ',
    )
    expect(story).toContain('Ведомость пуста')
  })
})

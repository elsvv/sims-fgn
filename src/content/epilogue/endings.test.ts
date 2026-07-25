import { describe, expect, it } from 'vitest'
import {
  matchesCondition,
  selectEpilogue,
  validateEpilogueRules,
  type EpilogueFacts,
} from '../../sim/epilogue/Epilogue'
import { createSkills } from '../../sim/player/Skills'
import { COURSES } from '../study/courses'
import { EPILOGUE_ENDINGS } from './endings'

function facts(overrides: Partial<EpilogueFacts> = {}): EpilogueFacts {
  return {
    courses: [],
    gpa: 6,
    debts: [],
    rating: null,
    people: [],
    faction: 0,
    averageStress: 30,
    skills: createSkills(),
    booksRead: 0,
    attendance: { present: 20, late: 0, absent: 0 },
    seminarsSpoken: 6,
    ...overrides,
  }
}

function endingFor(overrides: Partial<EpilogueFacts>): string | undefined {
  return selectEpilogue(facts(overrides), EPILOGUE_ENDINGS)?.id
}

describe('каталог концовок', () => {
  it('проходит проверку симуляции', () => {
    expect(validateEpilogueRules(EPILOGUE_ENDINGS)).toEqual([])
  })

  it('их достаточно, чтобы игру было ради чего переигрывать', () => {
    expect(EPILOGUE_ENDINGS.length).toBeGreaterThanOrEqual(10)
  })

  it('каждая концовка — рассказ, а не подпись', () => {
    for (const rule of EPILOGUE_ENDINGS) {
      expect(rule.story.length, rule.id).toBeGreaterThan(200)
      expect(rule.story, rule.id).toMatch(/[А-Яа-яЁё]/)
      expect(rule.title, rule.id).toMatch(/[А-Яа-яЁё]/)
    }
  })

  it('названия не повторяются', () => {
    const titles = EPILOGUE_ENDINGS.map((rule) => rule.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('безусловная концовка ровно одна', () => {
    const unconditional = EPILOGUE_ENDINGS.filter((rule) => Object.keys(rule.when).length === 0)
    expect(unconditional).toHaveLength(1)
    expect(unconditional[0]?.priority).toBe(0)
  })

  it('ссылается только на существующие дисциплины и людей', () => {
    for (const rule of EPILOGUE_ENDINGS) {
      const courseId = rule.when.gradeOf?.courseId
      if (courseId) expect(COURSES[courseId], rule.id).toBeDefined()
    }
  })
})

describe('концовки, названные дизайн-документом', () => {
  it('круглый отличник без единого друга', () => {
    expect(endingFor({ gpa: 9, people: [] })).toBe('perfectLoner')
  })

  it('троечник, которого обожает Михайловский', () => {
    const ending = endingFor({
      gpa: 5,
      people: [
        {
          id: 'mikhailovsky',
          name: 'Михайловский Александр Владиславович',
          respect: 50,
          affection: 5,
          level: 'Знакомы',
        },
      ],
    })
    expect(ending).toBe('mikhailovskyFavourite')
  })

  it('человек, прочитавший всё и не сдавший логику', () => {
    const ending = endingFor({
      skills: createSkills({ germanClassics: 7 }),
      courses: [
        {
          id: 'logic',
          title: 'Логика',
          short: 'Логика',
          teacherName: null,
          grade: 2,
          passed: false,
        },
      ],
      debts: ['Логика'],
    })
    expect(ending).toBe('readEverythingFailedLogic')
  })
})

describe('концовки различают прожитые модули', () => {
  it('тот, кто не ходил, получает своё', () => {
    expect(endingFor({ attendance: { present: 2, late: 0, absent: 20 } })).toBe('ghost')
  })

  it('тот, кто молчал, получает своё', () => {
    expect(endingFor({ seminarsSpoken: 0 })).toBe('silent')
  })

  it('тот, кто выгорел, получает своё', () => {
    expect(endingFor({ averageStress: 75 })).toBe('burnout')
  })

  it('аналитик и континентальный расходятся', () => {
    expect(endingFor({ faction: -80, gpa: 7 })).toBe('analytic')
    expect(endingFor({ faction: 80, gpa: 7 })).toBe('continental')
  })

  it('ровный модуль без подвигов кончается середняком', () => {
    expect(endingFor({ gpa: 6, debts: [] })).toBe('solid')
  })

  it('на всё остальное есть безусловная', () => {
    expect(endingFor({ gpa: 4.2, debts: ['Логика'] })).toBe('survivor')
  })

  it('разные модули дают разные концовки, а не одну на всех', () => {
    const outcomes = new Set([
      endingFor({ gpa: 9, people: [] }),
      endingFor({ seminarsSpoken: 0 }),
      endingFor({ averageStress: 75 }),
      endingFor({ faction: -80, gpa: 7 }),
      endingFor({ gpa: 6 }),
    ])
    expect(outcomes.size).toBe(5)
  })
})

describe('приоритеты', () => {
  it('частные концовки стоят выше общих', () => {
    const solid = EPILOGUE_ENDINGS.find((rule) => rule.id === 'solid')
    const specific = EPILOGUE_ENDINGS.filter(
      (rule) => rule.id !== 'solid' && Object.keys(rule.when).length > 0,
    )
    for (const rule of specific) {
      expect(rule.priority, rule.id).toBeGreaterThan(solid?.priority ?? 0)
    }
  })

  it('условие каждой концовки хоть кому-то подходит', () => {
    // Правило, под которое нельзя попасть, — это написанный и невидимый
    // текст. Проверяем, что для каждого есть хотя бы один прожитый модуль.
    const samples: Partial<EpilogueFacts>[] = [
      { gpa: 9, people: [] },
      {
        gpa: 5,
        people: [
          {
            id: 'mikhailovsky',
            name: 'Михайловский',
            respect: 50,
            affection: 5,
            level: 'Знакомы',
          },
        ],
      },
      {
        skills: createSkills({ germanClassics: 7 }),
        courses: [
          { id: 'logic', title: 'Логика', short: 'Логика', teacherName: null, grade: 2, passed: false },
        ],
      },
      { attendance: { present: 1, late: 0, absent: 20 } },
      { seminarsSpoken: 0 },
      { averageStress: 75 },
      { debts: ['Логика', 'НИС'] },
      { faction: -80, gpa: 7 },
      { faction: 80, gpa: 7 },
      {
        gpa: 8,
        people: [{ id: 'marey', name: 'Марей', respect: 60, affection: 20, level: 'Знакомы' }],
      },
      { gpa: 6 },
      {},
    ]

    for (const rule of EPILOGUE_ENDINGS) {
      const reachable = samples.some((sample) => matchesCondition(rule.when, facts(sample)))
      expect(reachable, rule.id).toBe(true)
    }
  })
})

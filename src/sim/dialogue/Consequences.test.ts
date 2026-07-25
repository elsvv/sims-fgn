import { describe, expect, it } from 'vitest'
import {
  addChanges,
  changesOf,
  changesOfTotals,
  describeChoice,
  describeConversation,
  describeFactionChange,
  describeRelationshipChange,
  describeSkillChange,
  directionMarker,
  directionOf,
  emptyTotals,
  magnitudeOf,
  toneHint,
  TONE_LABELS,
  MAGNITUDE_WORDS,
  type ChangeSet,
  type DialogueTone,
} from './Consequences'

const TONES: DialogueTone[] = ['cautious', 'direct', 'bold', 'scholarly']

describe('намёк на тон реплики', () => {
  it('есть у каждого тона и написан по-русски', () => {
    for (const tone of TONES) {
      expect(toneHint(tone).length, tone).toBeGreaterThan(10)
      expect(TONE_LABELS[tone], tone).toBeTruthy()
    }
  })

  it('не содержит чисел — игрок чувствует тон, а не считает баллы', () => {
    for (const tone of TONES) {
      expect(toneHint(tone), tone).not.toMatch(/\d/)
    }
  })

  it('намёки у разных тонов разные', () => {
    expect(new Set(TONES.map(toneHint)).size).toBe(TONES.length)
  })
})

describe('словесная шкала величины', () => {
  it('ноль — это отсутствие изменения', () => {
    expect(magnitudeOf(0)).toBe('none')
  })

  it('три ступени: чуть заметно, заметно, сильно', () => {
    expect(magnitudeOf(2)).toBe('slight')
    expect(magnitudeOf(3)).toBe('slight')
    expect(magnitudeOf(4)).toBe('noticeable')
    expect(magnitudeOf(9)).toBe('noticeable')
    expect(magnitudeOf(10)).toBe('strong')
    expect(magnitudeOf(30)).toBe('strong')
  })

  it('падение меряется той же шкалой, что и рост', () => {
    expect(magnitudeOf(-2)).toBe('slight')
    expect(magnitudeOf(-6)).toBe('noticeable')
    expect(magnitudeOf(-20)).toBe('strong')
  })

  it('слова шкалы — те самые три', () => {
    expect(MAGNITUDE_WORDS.slight).toBe('чуть заметно')
    expect(MAGNITUDE_WORDS.noticeable).toBe('заметно')
    expect(MAGNITUDE_WORDS.strong).toBe('сильно')
  })
})

describe('указатель направления', () => {
  it('различает рост, падение и покой', () => {
    expect(directionOf(5)).toBe('up')
    expect(directionOf(-5)).toBe('down')
    expect(directionOf(0)).toBe('flat')
  })

  it('неброский: от одной стрелки до трёх', () => {
    expect(directionMarker(2)).toBe('↑')
    expect(directionMarker(6)).toBe('↑↑')
    expect(directionMarker(20)).toBe('↑↑↑')
    expect(directionMarker(-6)).toBe('↓↓')
    expect(directionMarker(0)).toBe('—')
  })
})

describe('описание изменений', () => {
  it('нулевое изменение не описывается вовсе', () => {
    expect(describeRelationshipChange('respect', 0)).toBeNull()
    expect(describeFactionChange(0)).toBeNull()
    expect(describeSkillChange('writing', 0)).toBeNull()
  })

  it('уважение и симпатия склоняются по-русски', () => {
    expect(describeRelationshipChange('respect', 8)?.text).toBe('Уважение заметно выросло')
    expect(describeRelationshipChange('affection', -20)?.text).toBe('Симпатия сильно упала')
    expect(describeRelationshipChange('romance', 2)?.text).toBe(
      'Романтический интерес чуть заметно вырос',
    )
  })

  it('сдвиг по шкале традиций называет сторону, а не число', () => {
    expect(describeFactionChange(12)?.text).toBe('Вас сильно качнуло к континентальной традиции')
    expect(describeFactionChange(-5)?.text).toBe('Вас заметно качнуло к аналитической традиции')
  })

  it('навык называется по-человечески, если название передали', () => {
    expect(describeSkillChange('writing', 1, { writing: 'академическое письмо' })?.text).toBe(
      'Навык «академическое письмо» чуть заметно подрос',
    )
    expect(describeSkillChange('writing', 1)?.text).toBe('Навык «writing» чуть заметно подрос')
    expect(describeSkillChange('greek', -5)?.text).toContain('просел')
  })

  it('в описании изменения нет ни одной цифры', () => {
    const all = [
      describeRelationshipChange('respect', 8),
      describeRelationshipChange('affection', -20),
      describeFactionChange(12),
      describeSkillChange('writing', 1),
    ]
    for (const item of all) {
      expect(item?.text).not.toMatch(/\d/)
    }
  })

  it('рядом с фразой есть указатель направления', () => {
    const change = describeRelationshipChange('respect', 15)
    expect(change?.marker).toBe('↑↑↑')
    expect(change?.direction).toBe('up')
    expect(change?.magnitude).toBe('strong')
  })
})

describe('накопление эффектов', () => {
  it('пустой итог — все нули', () => {
    expect(emptyTotals()).toEqual({
      respect: 0,
      affection: 0,
      romance: 0,
      faction: 0,
      skills: {},
    })
  })

  it('складывает по измерениям и не трогает исходный итог', () => {
    const first = emptyTotals()
    const second = addChanges(first, { respect: 8, affection: -3 })
    const third = addChanges(second, { respect: 4, faction: 5, skill: { id: 'writing', amount: 1 } })

    expect(first.respect).toBe(0)
    expect(second.respect).toBe(8)
    expect(third).toEqual({
      respect: 12,
      affection: -3,
      romance: 0,
      faction: 5,
      skills: { writing: 1 },
    })
  })

  it('копит несколько навыков сразу', () => {
    const totals = addChanges(
      addChanges(emptyTotals(), { skill: { id: 'greek', amount: 1 } }),
      { skill: { id: 'writing', amount: 2 } },
    )
    expect(totals.skills).toEqual({ greek: 1, writing: 2 })
  })

  it('оценка за выступление в отношения не попадает', () => {
    const withGrade: ChangeSet & { grade: number } = { respect: 1, grade: 8 }
    expect(addChanges(emptyTotals(), withGrade)).toEqual({
      respect: 1,
      affection: 0,
      romance: 0,
      faction: 0,
      skills: {},
    })
  })
})

describe('последствия выбранной реплики', () => {
  it('сначала человеческая причина, потом изменения', () => {
    const report = describeChoice('Он оценил, что вы не стали юлить.', { respect: 8 })
    expect(report.reason).toBe('Он оценил, что вы не стали юлить.')
    expect(report.changes).toHaveLength(1)
    expect(report.text).toBe('Он оценил, что вы не стали юлить. Уважение заметно выросло.')
  })

  it('без изменений остаётся одна причина', () => {
    const report = describeChoice('Он промолчал.', {})
    expect(report.changes).toEqual([])
    expect(report.text).toBe('Он промолчал.')
  })

  it('в тексте последствий нет ни respect, ни цифр', () => {
    const report = describeChoice('Он оценил прямоту.', { respect: 8, affection: -20 })
    expect(report.text).not.toMatch(/\d/)
    expect(report.text).not.toMatch(/respect|affection/i)
  })

  it('перечисляет все изменившиеся измерения', () => {
    const report = describeChoice('Разговор пошёл вразнос.', {
      respect: 5,
      affection: -12,
      faction: 4,
      skill: { id: 'greek', amount: 1 },
    })
    expect(report.changes.map((item) => item.dimension)).toEqual([
      'respect',
      'affection',
      'faction',
      'skill',
    ])
  })

  it('изменения одной реплики совпадают с разбором её эффектов', () => {
    expect(changesOf({ respect: 8 }).map((item) => item.text)).toEqual([
      'Уважение заметно выросло',
    ])
  })
})

describe('итог всего разговора', () => {
  const totals = addChanges(emptyTotals(), { respect: 18, affection: -12 })

  it('состоит из названия исхода, смысла и сводки', () => {
    const report = describeConversation({
      title: 'Осуждение',
      summary: 'Он не оправдывался — он поставил вас на место.',
      totals,
    })
    expect(report.title).toBe('Осуждение')
    expect(report.closing).toBe('В сумме: уважение сильно выросло, симпатия сильно упала.')
    expect(report.text).toBe(
      'Осуждение. Он не оправдывался — он поставил вас на место. ' +
        'В сумме: уважение сильно выросло, симпатия сильно упала.',
    )
  })

  it('говорит прямо, если ничего не изменилось', () => {
    const report = describeConversation({
      title: 'Ничья',
      summary: 'Разошлись как в море корабли.',
      totals: emptyTotals(),
    })
    expect(report.closing).toBe('В сумме между вами ничего не изменилось.')
  })

  it('в итоге нет цифр', () => {
    const report = describeConversation({ title: 'Итог', summary: 'Вот так.', totals })
    expect(report.text).not.toMatch(/\d/)
  })

  it('сводка по итогам считает навыки за весь разговор', () => {
    const withSkills = addChanges(totals, { skill: { id: 'writing', amount: 2 } })
    expect(changesOfTotals(withSkills, { writing: 'академическое письмо' }).at(-1)?.text).toBe(
      'Навык «академическое письмо» чуть заметно подрос',
    )
  })
})

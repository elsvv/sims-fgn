import { describe, expect, it } from 'vitest'
import { summarizeDay, type DayFacts, type DayLessonFact } from './DaySummary'
import { sleepThroughNight, type SleepSpot } from './Sleep'

const BED: SleepSpot = {
  id: 'bed',
  propKind: 'bed',
  label: 'Своя кровать',
  where: 'в своей кровати',
  actionLabel: 'Лечь спать',
  energyQuality: 1,
  stressRelief: 0.8,
  moodletId: null,
  afterword: null,
  forced: false,
}

const COLLAPSE: SleepSpot = {
  ...BED,
  id: 'collapse',
  propKind: null,
  where: 'там, где стояли',
  afterword: 'Это не сон, это отключение.',
  forced: true,
}

function lesson(overrides: Partial<DayLessonFact> = {}): DayLessonFact {
  return {
    courseId: 'greek',
    courseName: 'Греческий',
    kind: 'seminar',
    mark: 'present',
    grade: null,
    ...overrides,
  }
}

function facts(overrides: Partial<DayFacts> = {}): DayFacts {
  return {
    day: 0,
    dayLabel: 'Неделя 1, понедельник',
    lessons: [],
    people: [],
    skills: [],
    factionDelta: 0,
    submittedEssays: [],
    sleep: sleepThroughNight(BED, 23 * 60, 8 * 60),
    ...overrides,
  }
}

/** Весь рассказ одной строкой — так проще спрашивать, сказано ли что-то. */
function text(overrides: Partial<DayFacts> = {}): string {
  return summarizeDay(facts(overrides)).paragraphs.join(' ')
}

describe('итоги дня: заголовок и форма', () => {
  it('заголовок — подпись дня', () => {
    expect(summarizeDay(facts()).title).toBe('Неделя 1, понедельник')
  })

  it('пустым не бывает: спать ложатся каждый день', () => {
    expect(summarizeDay(facts()).paragraphs.length).toBeGreaterThan(0)
  })

  it('это рассказ, а не таблица: цифр в тексте нет, кроме времени', () => {
    const story = text({
      lessons: [lesson({ grade: 8 })],
      skills: [{ label: 'Логика', delta: 0.4 }],
      people: [{ name: 'Алиева', respectDelta: 12, affectionDelta: 0 }],
      factionDelta: -7,
    })
    // Единственные допустимые цифры — часы на будильнике.
    expect(story.replace(/\d\d:\d\d/g, '')).not.toMatch(/\d/)
  })
})

describe('итоги дня: пары', () => {
  it('день без пар так и называется', () => {
    expect(text()).toContain('Пар сегодня не было')
  })

  it('полный день отмечается одной фразой', () => {
    const story = text({ lessons: [lesson(), lesson({ courseName: 'Логика' })] })
    expect(story).toContain('Расписание вы прошли целиком')
  })

  it('пропущенные пары названы поимённо', () => {
    const story = text({
      lessons: [lesson(), lesson({ courseName: 'Логика', mark: 'absent' })],
    })
    expect(story).toContain('Без вас прошли: Логика')
    expect(story).toContain('На остальных парах вы были')
  })

  it('день, прогулянный целиком, звучит иначе, чем день с одним прогулом', () => {
    const story = text({ lessons: [lesson({ mark: 'absent' }), lesson({ mark: null })] })
    expect(story).toContain('обошлось без вас')
  })

  it('опоздания названы отдельно от прогулов', () => {
    const story = text({ lessons: [lesson({ mark: 'late' })] })
    expect(story).toContain('после звонка: Греческий')
    expect(story).not.toContain('Без вас прошли')
  })
})

describe('итоги дня: семинары', () => {
  it('выступление названо оценкой словом', () => {
    expect(text({ lessons: [lesson({ grade: 8 })] })).toContain(
      'Греческий: подняли руку и получили восьмёрку',
    )
  })

  it('провал не выдаётся за успех', () => {
    expect(text({ lessons: [lesson({ grade: 2 })] })).toContain('Лучше бы промолчали')
  })

  it('молчание на семинаре — тоже событие дня', () => {
    expect(text({ lessons: [lesson()] })).toContain('не сказали ни слова')
  })

  it('о молчании на лекции не говорят: там и не спрашивают', () => {
    expect(text({ lessons: [lesson({ kind: 'lecture' })] })).not.toContain('ни слова')
  })

  it('прогулянный семинар не считается молчанием', () => {
    expect(text({ lessons: [lesson({ mark: 'absent' })] })).not.toContain('ни слова')
  })
})

describe('итоги дня: люди и рост', () => {
  it('отношения названы фамилией и измерением', () => {
    const story = text({ people: [{ name: 'Марей', respectDelta: 12, affectionDelta: 0 }] })
    expect(story).toContain('Марей — уважение сильно выросло')
  })

  it('никаких склеенных глаголов: фамилии бывают и женские', () => {
    const story = text({ people: [{ name: 'Алиева', respectDelta: -6, affectionDelta: 0 }] })
    expect(story).toContain('Алиева — уважение заметно упало')
  })

  it('день без сдвигов об отношениях молчит', () => {
    expect(text()).not.toContain('Отношения за день')
  })

  it('навык описан сравнением с утром', () => {
    expect(text({ skills: [{ label: 'Логика', delta: 0.4 }] })).toContain(
      '«Логика» — чуть заметно лучше, чем утром',
    )
  })

  it('сдвиг по шкале традиций назван стороной, а не числом', () => {
    expect(text({ factionDelta: -8 })).toContain('аналитической традиции')
  })

  it('сданное эссе попадает в рассказ', () => {
    expect(text({ submittedEssays: ['Эссе по истории философии'] })).toContain(
      'Сдано: «Эссе по истории философии»',
    )
  })
})

describe('итоги дня: как кончился день', () => {
  it('обычная ночь — время, место и длительность', () => {
    expect(text()).toContain('Легли в 23:00 в своей кровати и проспали восемь часов')
  })

  it('вынужденный сон описан отдельно и не выглядит отдыхом', () => {
    const story = text({ sleep: sleepThroughNight(COLLAPSE, 2 * 60, 5 * 60) })
    expect(story).toContain('В 02:00 вы отключились там, где стояли')
    expect(story).toContain('Это не сон, это отключение')
    expect(story).not.toContain('проспали')
  })
})

import { describe, expect, it } from 'vitest'
import type { DialogueContext } from '../dialogue/Dialogue'
import { createSkills, type Skills } from '../player/Skills'
import { affinity } from '../social/Faction'
import { createRelationship } from '../social/Relationship'
import { PASSING_GRADE } from './Course'
import type { Lesson } from './Schedule'
import {
  availableSeminarOptions,
  averageSkill,
  isSeminarOptionAvailable,
  isUnconditionalOption,
  performSpeech,
  pickLine,
  seminarFactionShift,
  seminarGrade,
  seminarPreparation,
  seminarRefusal,
  seminarRespect,
  seminarSkillGains,
  speechQuality,
  validateSeminarOption,
  validateSeminarOptions,
  SEMINAR_FAILURE_MOODLET,
  SEMINAR_REFUSALS,
  SEMINAR_SUCCESS_MOODLET,
  type SeminarContext,
  type SeminarOption,
} from './Seminar'

/** Осторожный способ: узкая вилка, ничего не требует. */
const RETELL: SeminarOption = {
  id: 'retell',
  label: 'Пересказать прочитанное',
  hint: 'Безопасно и невысоко.',
  skills: [],
  factionShift: 0,
  floor: 3,
  ceiling: 7,
}

/** Рискованный способ: вся шкала целиком, держится на красноречии. */
const CHALLENGE: SeminarOption = {
  id: 'challenge',
  label: 'Поспорить с преподавателем',
  hint: 'И десятка, и ноль.',
  skills: ['eloquence'],
  factionShift: 8,
  opposeTeacher: true,
  floor: 0,
  ceiling: 10,
  requires: { skillId: 'eloquence', skillMin: 3 },
}

const FORMAL: SeminarOption = {
  id: 'formal',
  label: 'Построить формальный аргумент',
  hint: 'Посылки и вывод.',
  skills: ['logic'],
  factionShift: -7,
  floor: 1,
  ceiling: 9,
}

/** Континентальный преподаватель: сюда сходятся все примеры про близость взглядов. */
const CONTINENTAL_TEACHER = { position: 85, tolerance: 45 }

function context(overrides: Partial<SeminarContext> = {}): SeminarContext {
  return {
    option: RETELL,
    skills: createSkills(),
    courseSkills: ['ancientLanguages'],
    mood: 50,
    affinity: 0,
    teacherPosition: CONTINENTAL_TEACHER.position,
    ...overrides,
  }
}

/** Подготовленный студент в хорошем настроении у близкого по духу преподавателя. */
function idealContext(option: SeminarOption): SeminarContext {
  const skills: Skills = createSkills({
    ancientLanguages: 9,
    logic: 9,
    germanClassics: 9,
    academicWriting: 9,
    eloquence: 9,
    endurance: 9,
  })
  return context({
    option,
    skills,
    mood: 90,
    affinity: affinity(CONTINENTAL_TEACHER.position, CONTINENTAL_TEACHER.tolerance, 85),
  })
}

/** Неподготовленный в плохом настроении у чужого. */
function hopelessContext(option: SeminarOption): SeminarContext {
  return context({
    option,
    skills: createSkills(),
    mood: 10,
    affinity: affinity(CONTINENTAL_TEACHER.position, CONTINENTAL_TEACHER.tolerance, -100),
  })
}

describe('подготовленность к выступлению', () => {
  it('средний уровень пустого списка навыков равен нулю', () => {
    expect(averageSkill(createSkills({ logic: 10 }), [])).toBe(0)
  })

  it('усредняет перечисленные навыки', () => {
    const skills = createSkills({ logic: 8, eloquence: 4 })
    expect(averageSkill(skills, ['logic', 'eloquence'])).toBe(6)
  })

  it('нулевые навыки дают нулевую подготовленность', () => {
    expect(seminarPreparation(createSkills(), ['logic'], ['eloquence'])).toBe(0)
  })

  it('десятки по всем навыкам дают единицу', () => {
    const skills = createSkills({ logic: 10, eloquence: 10 })
    expect(seminarPreparation(skills, ['logic'], ['eloquence'])).toBe(1)
  })

  it('владение приёмом весит больше знания предмета', () => {
    const skills = createSkills({ logic: 10, eloquence: 0 })
    const subjectOnly = seminarPreparation(skills, ['logic'], ['eloquence'])
    const mannerOnly = seminarPreparation(
      createSkills({ logic: 0, eloquence: 10 }),
      ['logic'],
      ['eloquence'],
    )
    expect(mannerOnly).toBeGreaterThan(subjectOnly)
  })

  it('способ без навыков держится на одном знании предмета', () => {
    const skills = createSkills({ ancientLanguages: 8 })
    expect(seminarPreparation(skills, ['ancientLanguages'], [])).toBeCloseTo(0.8, 5)
  })

  it('дисциплина без объявленных навыков не тянет подготовленность вниз', () => {
    const skills = createSkills({ eloquence: 10 })
    expect(seminarPreparation(skills, [], ['eloquence'])).toBe(1)
  })

  it('без единого навыка с обеих сторон подготовленности нет', () => {
    expect(seminarPreparation(createSkills({ logic: 10 }), [], [])).toBe(0)
  })
})

describe('качество выступления', () => {
  it('идеальный случай почти упирается в единицу', () => {
    expect(speechQuality(idealContext(RETELL))).toBeGreaterThan(0.85)
  })

  it('безнадёжный случай почти в нуле', () => {
    expect(speechQuality(hopelessContext(RETELL))).toBeLessThan(0.1)
  })

  it('всегда лежит в 0..1', () => {
    for (const mood of [-100, 0, 50, 200]) {
      for (const closeness of [-5, -1, 0, 1, 5]) {
        const value = speechQuality(context({ mood, affinity: closeness }))
        expect(value, `${mood}/${closeness}`).toBeGreaterThanOrEqual(0)
        expect(value, `${mood}/${closeness}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('плохое настроение портит выступление подготовленному', () => {
    const good = speechQuality(idealContext(RETELL))
    const bad = speechQuality({ ...idealContext(RETELL), mood: 10 })
    expect(bad).toBeLessThan(good)
  })

  it('чужие взгляды портят выступление подготовленному', () => {
    const own = speechQuality(idealContext(RETELL))
    const alien = speechQuality({ ...idealContext(RETELL), affinity: -1 })
    expect(alien).toBeLessThan(own)
  })

  it('настроение весит меньше подготовки', () => {
    const prepared = speechQuality(
      context({ skills: createSkills({ ancientLanguages: 10 }), mood: 0 }),
    )
    const cheerful = speechQuality(context({ mood: 100 }))
    expect(prepared).toBeGreaterThan(cheerful)
  })
})

describe('оценка за выступление', () => {
  it('подготовленный в хорошем настроении у своего получает высокую оценку', () => {
    expect(seminarGrade(idealContext(CHALLENGE))).toBeGreaterThanOrEqual(9)
  })

  it('неподготовленный в плохом настроении у чужого проваливается', () => {
    expect(seminarGrade(hopelessContext(CHALLENGE))).toBeLessThanOrEqual(1)
  })

  it('осторожный пересказ не проваливается в ноль даже у безнадёжного', () => {
    expect(seminarGrade(hopelessContext(RETELL))).toBeGreaterThanOrEqual(3)
  })

  it('за осторожный пересказ десятку не ставят никогда', () => {
    expect(seminarGrade(idealContext(RETELL))).toBeLessThanOrEqual(7)
  })

  it('подготовленному спор выгоднее пересказа', () => {
    expect(seminarGrade(idealContext(CHALLENGE))).toBeGreaterThan(
      seminarGrade(idealContext(RETELL)),
    )
  })

  it('неподготовленному пересказ выгоднее спора', () => {
    expect(seminarGrade(hopelessContext(RETELL))).toBeGreaterThan(
      seminarGrade(hopelessContext(CHALLENGE)),
    )
  })

  it('всегда целое число внутри шкалы', () => {
    for (const option of [RETELL, CHALLENGE, FORMAL]) {
      for (const mood of [0, 37, 100]) {
        const grade = seminarGrade(context({ option, mood }))
        expect(Number.isInteger(grade), `${option.id}/${mood}`).toBe(true)
        expect(grade).toBeGreaterThanOrEqual(0)
        expect(grade).toBeLessThanOrEqual(10)
      }
    }
  })

  it('растёт вместе с подготовкой', () => {
    const weak = seminarGrade(context({ option: FORMAL, skills: createSkills({ logic: 1 }) }))
    const strong = seminarGrade(context({ option: FORMAL, skills: createSkills({ logic: 9 }) }))
    expect(strong).toBeGreaterThan(weak)
  })
})

describe('уважение за выступление', () => {
  it('проходной балл не меняет ничего', () => {
    expect(seminarRespect(PASSING_GRADE, 0)).toBe(0)
  })

  it('высокая оценка приносит уважение', () => {
    expect(seminarRespect(10, 0)).toBeGreaterThan(0)
  })

  it('провал стоит уважения', () => {
    expect(seminarRespect(1, 0)).toBeLessThan(0)
  })

  it('у своего тот же ответ стоит дороже, чем у чужого', () => {
    expect(seminarRespect(10, 1)).toBeGreaterThan(seminarRespect(10, -1))
  })

  it('близость взглядов не смягчает провал', () => {
    expect(seminarRespect(0, 1)).toBe(seminarRespect(0, -1))
  })
})

describe('сдвиг по шкале традиций', () => {
  it('обычный способ двигает туда, куда записано в данных', () => {
    expect(seminarFactionShift(FORMAL, 85)).toBe(-7)
    expect(seminarFactionShift(FORMAL, -85)).toBe(-7)
  })

  it('спор сносит прочь от континентального преподавателя', () => {
    expect(seminarFactionShift(CHALLENGE, 85)).toBe(-8)
  })

  it('спор с аналитиком делает игрока континентальным', () => {
    expect(seminarFactionShift(CHALLENGE, -85)).toBe(8)
  })

  it('с преподавателем без лагеря спор никуда не сносит', () => {
    expect(seminarFactionShift(CHALLENGE, 0)).toBe(0)
  })
})

describe('навыки за выступление', () => {
  it('красноречие качается всегда, даже после провала', () => {
    const gains = seminarSkillGains(FORMAL, 0)
    expect(gains.map((gain) => gain.id)).toEqual(['eloquence'])
    expect(gains[0]!.amount).toBeGreaterThan(0)
  })

  it('удачное выступление качает и навыки самого приёма', () => {
    const ids = seminarSkillGains(FORMAL, 8).map((gain) => gain.id)
    expect(ids).toContain('eloquence')
    expect(ids).toContain('logic')
  })

  it('удачное выступление даёт красноречия больше, чем провальное', () => {
    const good = seminarSkillGains(RETELL, 10)[0]!.amount
    const bad = seminarSkillGains(RETELL, 0)[0]!.amount
    expect(good).toBeGreaterThan(bad)
  })

  it('навык не задваивается, если приём держится на красноречии', () => {
    const ids = seminarSkillGains(CHALLENGE, 10).map((gain) => gain.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('результат выступления целиком', () => {
  it('удачное выступление помечено успехом и своим модификатором', () => {
    const result = performSpeech(idealContext(CHALLENGE))
    expect(result.success).toBe(true)
    expect(result.grade).toBeGreaterThanOrEqual(PASSING_GRADE)
    expect(result.respect).toBeGreaterThan(0)
    expect(result.moodletId).toBe(SEMINAR_SUCCESS_MOODLET)
  })

  it('провал помечен провалом и своим модификатором', () => {
    const result = performSpeech(hopelessContext(CHALLENGE))
    expect(result.success).toBe(false)
    expect(result.respect).toBeLessThan(0)
    expect(result.moodletId).toBe(SEMINAR_FAILURE_MOODLET)
  })

  it('несёт с собой разбор оценки', () => {
    const result = performSpeech(idealContext(FORMAL))
    expect(result.optionId).toBe('formal')
    expect(result.preparation).toBeGreaterThan(0.8)
    expect(result.quality).toBeGreaterThan(0.8)
  })

  it('ничего не меняет во входных данных', () => {
    const input = idealContext(CHALLENGE)
    const before = JSON.stringify(input)
    performSpeech(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

/* ------------------------------------------------------------------ */
/* Когда выступать можно                                               */
/* ------------------------------------------------------------------ */

const SEMINAR: Lesson = {
  id: 'greek-mon',
  courseId: 'greek',
  kind: 'seminar',
  weekday: 0,
  period: 0,
  room: 'А-204',
}

const LECTURE: Lesson = { ...SEMINAR, id: 'histphil-mon', kind: 'lecture' }

describe('право выступить', () => {
  it('на идущем семинаре в своей аудитории с отметкой ничто не мешает', () => {
    expect(
      seminarRefusal({
        lesson: SEMINAR,
        room: 'А-204',
        mark: 'present',
        alreadySpoke: false,
      }),
    ).toBeNull()
  })

  it('вне занятия выступать негде', () => {
    expect(
      seminarRefusal({ lesson: null, room: 'А-204', mark: null, alreadySpoke: false }),
    ).toBe('notSeminar')
  })

  /*
   * Лекция — своя причина, не общая. «Сейчас не семинар» верно и в полночь
   * в коридоре, и на лекции, но игроку это два разных ответа: в первом
   * случае идти некуда, во втором он уже сидит на паре и ждёт кнопки.
   */
  it('на лекции причина своя: здесь слушают', () => {
    expect(
      seminarRefusal({ lesson: LECTURE, room: 'А-204', mark: 'present', alreadySpoke: false }),
    ).toBe('lecture')
    expect(SEMINAR_REFUSALS.lecture).toContain('лекция')
  })

  it('из коридора выступать нельзя', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: 'коридор', mark: 'present', alreadySpoke: false }),
    ).toBe('wrongRoom')
  })

  it('в дверях, между помещениями, тоже нельзя', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: null, mark: 'present', alreadySpoke: false }),
    ).toBe('wrongRoom')
  })

  it('без отметки о присутствии слова не дают', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: 'А-204', mark: null, alreadySpoke: false }),
    ).toBe('notMarked')
  })

  it('прогульщику слова не дают', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: 'А-204', mark: 'absent', alreadySpoke: false }),
    ).toBe('notMarked')
  })

  it('опоздавшему слово дают', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: 'А-204', mark: 'late', alreadySpoke: false }),
    ).toBeNull()
  })

  it('дважды за одну пару не выступают', () => {
    expect(
      seminarRefusal({ lesson: SEMINAR, room: 'А-204', mark: 'present', alreadySpoke: true }),
    ).toBe('alreadySpoke')
  })

  it('у каждой причины отказа есть внятная русская подпись', () => {
    for (const [key, text] of Object.entries(SEMINAR_REFUSALS)) {
      expect(text.trim(), key).toBe(text)
      expect(text.length, key).toBeGreaterThan(10)
      expect(text, key).toMatch(/[А-Яа-яЁё]/)
    }
  })
})

/* ------------------------------------------------------------------ */
/* Доступность вариантов                                               */
/* ------------------------------------------------------------------ */

function dialogueContext(skills: Partial<Skills> = {}, faction = 0): DialogueContext {
  return {
    skills: createSkills(skills),
    faction,
    relationship: createRelationship(),
    readBooks: [],
    moodlets: [],
    visitedNodes: [],
    day: 1,
  }
}

describe('доступность вариантов выступления', () => {
  it('вариант без условий безусловен', () => {
    expect(isUnconditionalOption(RETELL)).toBe(true)
  })

  it('пустой объект требований — тоже отсутствие условий', () => {
    expect(isUnconditionalOption({ ...RETELL, requires: {} })).toBe(true)
  })

  it('вариант с требованием безусловным не считается', () => {
    expect(isUnconditionalOption(CHALLENGE)).toBe(false)
  })

  it('новичку спорить нечем', () => {
    expect(isSeminarOptionAvailable(CHALLENGE, dialogueContext())).toBe(false)
  })

  it('красноречие открывает спор', () => {
    expect(isSeminarOptionAvailable(CHALLENGE, dialogueContext({ eloquence: 4 }))).toBe(true)
  })

  it('у новичка остаются безусловные варианты', () => {
    const available = availableSeminarOptions([RETELL, CHALLENGE, FORMAL], dialogueContext())
    expect(available.map((option) => option.id)).toEqual(['retell', 'formal'])
  })
})

/* ------------------------------------------------------------------ */
/* Ответ преподавателя                                                 */
/* ------------------------------------------------------------------ */

describe('выбор реплики преподавателя', () => {
  it('из пустого набора отвечать нечем', () => {
    expect(pickLine([], 'что угодно')).toBeNull()
  })

  it('одна и та же ситуация отвечает одними и теми же словами', () => {
    const lines = ['Первая.', 'Вторая.', 'Третья.']
    expect(pickLine(lines, 'greek-mon:retell:7')).toBe(pickLine(lines, 'greek-mon:retell:7'))
  })

  it('всегда возвращает реплику из набора', () => {
    const lines = ['Первая.', 'Вторая.', 'Третья.']
    for (let i = 0; i < 50; i++) {
      expect(lines).toContain(pickLine(lines, `семинар-${i}`))
    }
  })

  it('разные ситуации отвечают по-разному', () => {
    const lines = ['Первая.', 'Вторая.', 'Третья.', 'Четвёртая.']
    const said = new Set<string | null>()
    for (let i = 0; i < 20; i++) said.add(pickLine(lines, `greek-mon:retell:${i}`))
    expect(said.size).toBeGreaterThan(1)
  })
})

/* ------------------------------------------------------------------ */
/* Проверка данных                                                     */
/* ------------------------------------------------------------------ */

describe('проверка вариантов выступления', () => {
  it('корректный вариант ошибок не даёт', () => {
    expect(validateSeminarOption(RETELL)).toEqual([])
  })

  it('ловит перевёрнутую вилку исходов', () => {
    expect(validateSeminarOption({ ...RETELL, floor: 8, ceiling: 3 })).not.toEqual([])
  })

  it('ловит вилку нулевой ширины: выбор должен что-то решать', () => {
    expect(validateSeminarOption({ ...RETELL, floor: 5, ceiling: 5 })).not.toEqual([])
  })

  it('ловит выход за шкалу оценок', () => {
    expect(validateSeminarOption({ ...RETELL, ceiling: 12 })).not.toEqual([])
  })

  it('ловит пустую подпись и пустое пояснение', () => {
    expect(validateSeminarOption({ ...RETELL, label: '  ' }).length).toBe(1)
    expect(validateSeminarOption({ ...RETELL, hint: '' }).length).toBe(1)
  })

  it('у спора сдвиг задаётся величиной, а не направлением', () => {
    expect(validateSeminarOption({ ...CHALLENGE, factionShift: -8 })).not.toEqual([])
  })

  it('корректный набор ошибок не даёт', () => {
    expect(validateSeminarOptions([RETELL, CHALLENGE, FORMAL])).toEqual([])
  })

  it('ловит повторяющиеся идентификаторы', () => {
    expect(validateSeminarOptions([RETELL, RETELL])).not.toEqual([])
  })

  it('ловит набор, где всё что-то требует: панель может опустеть', () => {
    expect(validateSeminarOptions([CHALLENGE])).not.toEqual([])
  })

  it('пустой набор — это мир без семинаров, а не ошибка', () => {
    expect(validateSeminarOptions([])).toEqual([])
  })
})

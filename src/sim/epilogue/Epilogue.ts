import type { SkillId, Skills } from '../player/Skills'
import { factionLabel, factionMeaning } from '../social/Faction'
import type { AttendanceCounts } from '../study/Attendance'
import type { RatingPlace } from '../study/Rating'
import { cardinal, enumerate } from '../text/russian'

/**
 * Эпилог модуля.
 *
 * Дизайн-документ, раздел 9: в конце показывается не экран победы, а рассказ
 * о том, кем ты стал за шесть недель. «Комбинации дают заметно разные
 * концовки: круглый отличник без единого друга; троечник, которого обожает
 * Михайловский; человек, прочитавший всё и не сдавший логику».
 *
 * Отсюда устройство модуля: концовки — данные с условиями, а не ветвление
 * в коде. Здесь живут язык описания условий, отбор подходящей концовки
 * и сборка сводки; сами тексты лежат в src/content/epilogue. Новая концовка
 * стоит одной записи в каталоге.
 */

/** Числовой диапазон условия. Обе границы включительно, обе необязательны. */
export interface Range {
  min?: number
  max?: number
}

export function inRange(value: number, range: Range): boolean {
  if (range.min !== undefined && value < range.min) return false
  if (range.max !== undefined && value > range.max) return false
  return true
}

/**
 * Условие концовки.
 *
 * Все указанные поля должны выполниться одновременно: перечисление здесь
 * читается как «и». Условия «или» не нужны — вместо них пишутся две записи
 * с одинаковым текстом, и это честнее, потому что видно, каких игроков
 * концовка ловит.
 */
export interface EpilogueCondition {
  /** Средний балл по итогам модуля. */
  gpa?: Range
  /** Сколько дисциплин ушло в задолженность. */
  debts?: Range
  /** Самое высокое уважение среди всех, с кем игрок имел дело. */
  topRespect?: Range
  /** Самая высокая симпатия. */
  topAffection?: Range
  /** Уважение конкретного человека: `{ personId: 'mikhailovsky', min: 40 }`. */
  respectOf?: Range & { personId: string }
  /** Итоговая оценка по конкретной дисциплине. */
  gradeOf?: Range & { courseId: string }
  /** Позиция на шкале философских традиций, −100..100. */
  faction?: Range
  /** Средний стресс за модуль, 0..100. */
  stress?: Range
  /** Уровень конкретного навыка, 0..10. */
  skill?: Range & { id: SkillId }
  /** Сколько книг прочитано. */
  books?: Range
  /** Доля посещённых пар, 0..1. */
  attendance?: Range
  /** Сколько раз игрок выступал на семинарах. */
  seminars?: Range
}

export interface EpilogueRule {
  id: string
  /** Название концовки: «Круглый отличник без единого друга». */
  title: string
  /** Рассказ о том, кем вы стали. */
  story: string
  /**
   * Чем выше, тем раньше проверяется. Частные концовки должны стоять выше
   * общих, иначе «человек, не сдавший логику» никогда не всплывёт из-под
   * «крепкого середняка».
   */
  priority: number
  when: EpilogueCondition
}

/* ------------------------------------------------------------------ */
/* Факты, по которым выбирается концовка                               */
/* ------------------------------------------------------------------ */

export interface EpilogueCourseFact {
  id: string
  /** Полное название, как в учебном плане. */
  title: string
  /** Короткое название для перечисления. */
  short: string
  /** Кто вёл: полное имя или null. */
  teacherName: string | null
  /** Итог модуля, 0..10, или null, если оценивать пока не по чему. */
  grade: number | null
  passed: boolean
}

export interface EpiloguePersonFact {
  id: string
  /** Полное имя с отчеством, как в ведомости. */
  name: string
  respect: number
  affection: number
  /** Словесная оценка отношений: «Хорошие отношения». */
  level: string
}

/** Всё, что мир знает о прожитом модуле. */
export interface EpilogueFacts {
  courses: readonly EpilogueCourseFact[]
  /** Средний балл или null, если ни одна дисциплина не оценена. */
  gpa: number | null
  /** Названия дисциплин, ушедших в задолженность. */
  debts: readonly string[]
  rating: RatingPlace | null
  people: readonly EpiloguePersonFact[]
  faction: number
  /** Средний стресс за модуль, 0..100. */
  averageStress: number
  skills: Skills
  booksRead: number
  attendance: AttendanceCounts
  seminarsSpoken: number
}

/** Доля пар, на которых студент был, 0..1. Без пар считается единицей. */
export function attendanceRate(counts: AttendanceCounts): number {
  const total = counts.present + counts.late + counts.absent
  if (total === 0) return 1
  return (counts.present + counts.late) / total
}

function topRespect(people: readonly EpiloguePersonFact[]): number {
  return people.reduce((best, person) => Math.max(best, person.respect), 0)
}

function topAffection(people: readonly EpiloguePersonFact[]): number {
  return people.reduce((best, person) => Math.max(best, person.affection), 0)
}

/** Выполняется ли условие на этих фактах. */
export function matchesCondition(condition: EpilogueCondition, facts: EpilogueFacts): boolean {
  if (condition.gpa && !inRange(facts.gpa ?? 0, condition.gpa)) return false
  if (condition.debts && !inRange(facts.debts.length, condition.debts)) return false
  if (condition.topRespect && !inRange(topRespect(facts.people), condition.topRespect)) {
    return false
  }
  if (condition.topAffection && !inRange(topAffection(facts.people), condition.topAffection)) {
    return false
  }
  if (condition.respectOf) {
    const person = facts.people.find((item) => item.id === condition.respectOf?.personId)
    if (!person || !inRange(person.respect, condition.respectOf)) return false
  }
  if (condition.gradeOf) {
    const course = facts.courses.find((item) => item.id === condition.gradeOf?.courseId)
    if (!course || !inRange(course.grade ?? 0, condition.gradeOf)) return false
  }
  if (condition.faction && !inRange(facts.faction, condition.faction)) return false
  if (condition.stress && !inRange(facts.averageStress, condition.stress)) return false
  if (condition.skill && !inRange(facts.skills[condition.skill.id], condition.skill)) {
    return false
  }
  if (condition.books && !inRange(facts.booksRead, condition.books)) return false
  if (condition.attendance && !inRange(attendanceRate(facts.attendance), condition.attendance)) {
    return false
  }
  if (condition.seminars && !inRange(facts.seminarsSpoken, condition.seminars)) return false
  return true
}

/**
 * Выбирает концовку.
 *
 * Побеждает подошедшее правило с наибольшим приоритетом; при равенстве —
 * то, что идёт в каталоге раньше. Порядок разрешается явно, потому что
 * молчаливая зависимость от порядка ключей в объекте — это концовка,
 * которая однажды сменится сама.
 */
export function selectEpilogue(
  facts: EpilogueFacts,
  rules: readonly EpilogueRule[],
): EpilogueRule | null {
  let best: EpilogueRule | null = null
  for (const rule of rules) {
    if (!matchesCondition(rule.when, facts)) continue
    if (best === null || rule.priority > best.priority) best = rule
  }
  return best
}

/**
 * Проверяет каталог концовок.
 *
 * Главное требование — последнее: хотя бы одна концовка обязана быть
 * безусловной. Каталог без неё однажды встретит игрока пустым экраном
 * там, где должен быть эпилог, — и именно в тот момент, когда переиграть
 * шесть недель уже нельзя.
 */
export function validateEpilogueRules(rules: readonly EpilogueRule[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const rule of rules) {
    if (seen.has(rule.id)) errors.push(`Концовка «${rule.id}» повторяется`)
    seen.add(rule.id)
    if (rule.title.trim() === '') errors.push(`Концовка «${rule.id}»: нет названия`)
    if (rule.story.trim() === '') errors.push(`Концовка «${rule.id}»: нет текста`)
  }

  if (rules.length > 0 && !rules.some((rule) => Object.keys(rule.when).length === 0)) {
    errors.push('Нет ни одной безусловной концовки — эпилог может оказаться пустым')
  }

  return errors
}

/* ------------------------------------------------------------------ */
/* Сводка модуля                                                       */
/* ------------------------------------------------------------------ */

/** Состояние психики словами. Агрегат стресса за модуль, дизайн-документ §9. */
export function psycheLabel(averageStress: number): string {
  if (averageStress < 20) return 'Психика цела'
  if (averageStress < 40) return 'Устали, но держитесь'
  if (averageStress < 60) return 'Жили на нервах'
  if (averageStress < 80) return 'Выгорели'
  return 'От вас осталась оболочка'
}

export function psycheMeaning(averageStress: number): string {
  if (averageStress < 20) {
    return 'Шесть недель прошли, а вы спали, ели и разговаривали с людьми. На философском факультете это отдельное достижение.'
  }
  if (averageStress < 40) {
    return 'Было тяжело, но не настолько, чтобы разучиться радоваться расписанию без первой пары.'
  }
  if (averageStress < 60) {
    return 'Вы привыкли жить с ощущением, что что-то не сдано. Оно почти всегда было право.'
  }
  if (averageStress < 80) {
    return 'К концу модуля вы перестали различать усталость и норму. Кофе из автомата на втором этаже не помогал уже с четвёртой недели.'
  }
  return 'Вы дошли до конца, но не помните как. Это тоже способ закрыть модуль, просто он дорогой.'
}

export interface EpilogueReport {
  /** Идентификатор сработавшей концовки. */
  endingId: string
  /** Название концовки. */
  title: string
  /** Рассказ о том, кем вы стали. */
  story: string
  /** Сводка модуля абзацами: ведомость, рейтинг, люди, взгляды, психика. */
  paragraphs: string[]
}

/** Концовка на случай пустого каталога. Игрок не должен упереться в белый экран. */
const FALLBACK: EpilogueRule = {
  id: 'fallback',
  title: 'Модуль закрыт',
  story:
    'Шесть недель кончились. Вы дошли до конца, и это уже больше, чем можно было сказать о вас в первый понедельник.',
  priority: -1,
  when: {},
}

function gradesParagraph(courses: readonly EpilogueCourseFact[]): string {
  const graded = courses.filter((course) => course.grade !== null)
  if (graded.length === 0) {
    return 'Ведомость пуста: за модуль вас не оценили ни разу. Формально это не задолженность, фактически — вас там не было.'
  }
  const items = graded.map((course) => `${course.short} — ${cardinal(course.grade ?? 0)}`)
  return `Ведомость на конец модуля: ${items.join(', ')}.`
}

function debtsParagraph(debts: readonly string[]): string | null {
  if (debts.length === 0) return null
  return `Задолженности: ${enumerate(debts)}. Пересдаётся только экзаменационная часть, накопленная не меняется — арифметику вы уже не перепишете.`
}

function ratingParagraph(rating: RatingPlace | null): string | null {
  if (!rating) return null
  return `Средний балл ${rating.gpa.toFixed(1)}, ${rating.place} место из ${rating.cohortSize} — ${rating.label}. Список висит на всех, и ваше имя в нём тоже.`
}

/**
 * Отношения на конец модуля.
 *
 * Фамилия, тире и оценка отношений: фамилии в игре и мужские, и женские,
 * а склеенный из шаблона глагол однажды выдаст «Алиева поставил».
 */
function peopleParagraph(people: readonly EpiloguePersonFact[]): string | null {
  if (people.length === 0) return null
  const lines = people.map((person) => `${person.name} — ${person.level.toLowerCase()}`)
  return `С кем вы вышли из модуля. ${lines.join('. ')}.`
}

function factionParagraph(faction: number): string {
  return `${factionLabel(faction)}. ${factionMeaning(faction)}`
}

function psycheParagraph(averageStress: number): string {
  return `${psycheLabel(averageStress)}. ${psycheMeaning(averageStress)}`
}

/** Собирает эпилог целиком: выбирает концовку и пишет сводку модуля. */
export function buildEpilogue(
  facts: EpilogueFacts,
  rules: readonly EpilogueRule[],
): EpilogueReport {
  const ending = selectEpilogue(facts, rules) ?? FALLBACK
  const paragraphs = [
    gradesParagraph(facts.courses),
    debtsParagraph(facts.debts),
    ratingParagraph(facts.rating),
    peopleParagraph(facts.people),
    factionParagraph(facts.faction),
    psycheParagraph(facts.averageStress),
  ].filter((paragraph): paragraph is string => paragraph !== null)

  return { endingId: ending.id, title: ending.title, story: ending.story, paragraphs }
}

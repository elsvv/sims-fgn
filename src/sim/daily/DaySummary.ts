import {
  describeFactionChange,
  describeRelationshipChange,
  MAGNITUDE_WORDS,
  magnitudeOf,
} from '../dialogue/Consequences'
import type { AttendanceMark } from '../study/Attendance'
import { PASSING_GRADE } from '../study/Course'
import { describeHours, enumerate, gradeWord } from '../text/russian'
import { formatClock } from '../time/GameClock'
import type { SleepOutcome } from './Sleep'

/**
 * Итоги прожитого дня.
 *
 * Дизайн-документ, раздел 3: день кончается сном, и это единственный момент,
 * когда игра говорит с игроком о прошедшем целиком. Поэтому здесь не таблица
 * приращений, а короткий рассказ: что было с парами, кто на вас как
 * посмотрел, чему вы за день научились и во сколько легли.
 *
 * Модуль чистый и ничего не знает ни о мире, ни об учебном состоянии: он
 * принимает уже собранные факты и возвращает абзацы. Из-за этого его можно
 * проверить построчно, а фразы — переписывать, не трогая симуляцию.
 */

/** Пара, которая была сегодня в расписании. */
export interface DayLessonFact {
  courseId: string
  /** Короткое название дисциплины, как в расписании: «Греческий». */
  courseName: string
  kind: 'lecture' | 'seminar'
  /** Отметка о посещении. null — отметки нет, то есть не пришёл. */
  mark: AttendanceMark | null
  /** Выступление на этой паре, если оно было. */
  grade: number | null
}

/** Насколько за день сдвинулись отношения с одним человеком. */
export interface DayPersonFact {
  /** Как его называют в списке: фамилия. */
  name: string
  respectDelta: number
  affectionDelta: number
}

/** Насколько за день вырос навык. */
export interface DaySkillFact {
  label: string
  delta: number
}

/** Всё, что мир знает о прожитом дне. */
export interface DayFacts {
  day: number
  /** Подпись дня: «Неделя 1, понедельник». */
  dayLabel: string
  lessons: readonly DayLessonFact[]
  people: readonly DayPersonFact[]
  skills: readonly DaySkillFact[]
  /** Сдвиг по шкале философских традиций за день. */
  factionDelta: number
  /** Названия эссе, сданных за день. */
  submittedEssays: readonly string[]
  sleep: SleepOutcome
}

export interface DaySummary {
  /** Заголовок экрана: подпись дня. */
  title: string
  /** Рассказ абзацами. Пустым не бывает: сон случается всегда. */
  paragraphs: string[]
}

/** Пришёл ли студент на пару — по отметке в журнале. */
function attended(mark: AttendanceMark | null): boolean {
  return mark === 'present' || mark === 'late'
}

/**
 * Как прошло расписание.
 *
 * Ни одного числительного: по-русски «из трёх пар» и «на две пары» требуют
 * падежей, которых от таблицы не добьёшься. Вместо счёта — названия
 * дисциплин, и это к тому же полезнее: игрок узнаёт не «пропустил две»,
 * а «пропустил логику».
 */
function lessonsParagraph(lessons: readonly DayLessonFact[]): string | null {
  if (lessons.length === 0) {
    return 'Пар сегодня не было. День принадлежал только вам.'
  }

  const missed = lessons.filter((lesson) => !attended(lesson.mark)).map((l) => l.courseName)
  const late = lessons.filter((lesson) => lesson.mark === 'late').map((l) => l.courseName)

  if (missed.length === 0 && late.length === 0) {
    return 'Расписание вы прошли целиком: были на всех парах от звонка до звонка.'
  }

  const sentences: string[] = []
  if (missed.length === lessons.length) {
    sentences.push('Сегодняшнее расписание обошлось без вас: вы не дошли ни на одну пару.')
  } else if (missed.length > 0) {
    sentences.push(`Без вас прошли: ${enumerate(missed)}. На остальных парах вы были.`)
  }
  if (late.length > 0) {
    sentences.push(`Вошли в аудиторию после звонка: ${enumerate(late)}.`)
  }
  return sentences.join(' ')
}

/**
 * Что было на семинарах.
 *
 * Молчание — тоже событие дня, и о нём говорится вслух: студент, который
 * шесть недель просидел на семинарах не открывая рта, должен узнать об этом
 * не в эпилоге.
 */
function seminarParagraph(lessons: readonly DayLessonFact[]): string | null {
  const spoken = lessons.filter((lesson) => lesson.grade !== null)
  if (spoken.length > 0) {
    return spoken
      .map((lesson) => {
        const grade = lesson.grade ?? 0
        const tail = grade >= PASSING_GRADE ? '' : ' Лучше бы промолчали.'
        return `${lesson.courseName}: подняли руку и получили ${gradeWord(grade)}.${tail}`
      })
      .join(' ')
  }

  const silentSeminars = lessons.filter(
    (lesson) => lesson.kind === 'seminar' && attended(lesson.mark),
  )
  if (silentSeminars.length === 0) return null
  return 'На семинарах вы не сказали ни слова. Отсидели — и всё.'
}

/**
 * Кто на вас сегодня как посмотрел.
 *
 * Фамилия, тире и фраза об измерении. Так — а не «Алиева стала уважать вас
 * больше» — потому что фамилии в игре и мужские, и женские, а склеенный
 * из шаблона глагол однажды выдаст «Алиева стал».
 */
function peopleParagraph(people: readonly DayPersonFact[]): string | null {
  const lines: string[] = []
  for (const person of people) {
    const changes = [
      describeRelationshipChange('respect', person.respectDelta),
      describeRelationshipChange('affection', person.affectionDelta),
    ].filter((change) => change !== null)
    if (changes.length === 0) continue
    lines.push(`${person.name} — ${changes.map((c) => c.text.toLowerCase()).join(', ')}`)
  }
  if (lines.length === 0) return null
  return `Отношения за день сдвинулись. ${lines.join('. ')}.`
}

/** Чему за день научились и куда за день снесло. */
function growthParagraph(
  skills: readonly DaySkillFact[],
  factionDelta: number,
): string | null {
  const sentences: string[] = []

  const grown = skills
    .filter((skill) => magnitudeOf(skill.delta) !== 'none')
    .map((skill) => {
      const magnitude = magnitudeOf(skill.delta)
      const word = magnitude === 'none' ? '' : MAGNITUDE_WORDS[magnitude]
      const side = skill.delta > 0 ? 'лучше' : 'хуже'
      return `«${skill.label}» — ${word} ${side}, чем утром`
    })

  if (grown.length > 0) sentences.push(`К вечеру: ${grown.join('; ')}.`)

  const faction = describeFactionChange(factionDelta)
  if (faction) sentences.push(`${faction.text}.`)

  return sentences.length > 0 ? sentences.join(' ') : null
}

function essaysParagraph(titles: readonly string[]): string | null {
  if (titles.length === 0) return null
  return `Сдано: ${enumerate(titles.map((title) => `«${title}»`))}.`
}

/** Чем день кончился. Этот абзац есть всегда: спать ложатся каждый день. */
function sleepParagraph(sleep: SleepOutcome): string {
  const clock = formatClock(sleep.bedtimeMinutes)
  const head = sleep.forced
    ? `В ${clock} вы отключились ${sleep.where}.`
    : `Легли в ${clock} ${sleep.where} и проспали ${describeHours(sleep.minutes)}.`
  return sleep.afterword ? `${head} ${sleep.afterword}` : head
}

/** Собирает рассказ о прожитом дне. */
export function summarizeDay(facts: DayFacts): DaySummary {
  const paragraphs = [
    lessonsParagraph(facts.lessons),
    seminarParagraph(facts.lessons),
    essaysParagraph(facts.submittedEssays),
    peopleParagraph(facts.people),
    growthParagraph(facts.skills, facts.factionDelta),
    sleepParagraph(facts.sleep),
  ].filter((paragraph): paragraph is string => paragraph !== null)

  return { title: facts.dayLabel, paragraphs }
}

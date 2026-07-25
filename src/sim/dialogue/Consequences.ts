/**
 * Последствия реплик на человеческом языке.
 *
 * Правило простое: игрок не считает баллы. До выбора он видит намёк на тон
 * реплики — дерзкая она или осторожная, — но не цифры. После выбора получает
 * фразу о том, что произошло между ним и собеседником, и неброский указатель
 * направления. Числа остаются внутри симуляции и наружу не выходят.
 *
 * Модуль ничего не знает ни о диалоговых цепочках, ни об отношениях: он
 * принимает голые изменения и возвращает слова. Поэтому им пользуется
 * DialogueChain, а не наоборот.
 */

/** Тон реплики. Четыре — это минимум, который должен быть на каждой развилке. */
export type DialogueTone = 'cautious' | 'direct' | 'bold' | 'scholarly'

export const TONE_LABELS: Record<DialogueTone, string> = {
  cautious: 'осторожно',
  direct: 'прямо',
  bold: 'дерзко',
  scholarly: 'по-учёному',
}

const TONE_HINTS: Record<DialogueTone, string> = {
  cautious: 'Осторожно — так, чтобы осталась дорога назад.',
  direct: 'Прямо, без обиняков и без извинений.',
  bold: 'Дерзко. Это заметят.',
  scholarly: 'По-учёному: перевести разговор в предмет.',
}

/** Намёк на тон реплики — всё, что игрок видит до выбора. */
export function toneHint(tone: DialogueTone): string {
  return TONE_HINTS[tone]
}

/** Словесная шкала величины изменения. */
export type Magnitude = 'none' | 'slight' | 'noticeable' | 'strong'

export const MAGNITUDE_WORDS: Record<Exclude<Magnitude, 'none'>, string> = {
  slight: 'чуть заметно',
  noticeable: 'заметно',
  strong: 'сильно',
}

export function magnitudeOf(delta: number): Magnitude {
  const size = Math.abs(delta)
  if (size === 0) return 'none'
  if (size <= 3) return 'slight'
  if (size <= 9) return 'noticeable'
  return 'strong'
}

export type Direction = 'up' | 'down' | 'flat'

export function directionOf(delta: number): Direction {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

const ARROWS: Record<Direction, string> = { up: '↑', down: '↓', flat: '—' }
const MARKER_LENGTH: Record<Exclude<Magnitude, 'none'>, number> = {
  slight: 1,
  noticeable: 2,
  strong: 3,
}

/**
 * Указатель направления: видимый, но неброский.
 * Одна стрелка — чуть заметно, три — сильно.
 */
export function directionMarker(delta: number): string {
  const magnitude = magnitudeOf(delta)
  if (magnitude === 'none') return ARROWS.flat
  return ARROWS[directionOf(delta)].repeat(MARKER_LENGTH[magnitude])
}

export type ChangeDimension = 'respect' | 'affection' | 'romance' | 'faction' | 'skill'

/** Что изменилось — уже словами. */
export interface ConsequenceChange {
  dimension: ChangeDimension
  /** Как измерение называется в интерфейсе: «Уважение», «Симпатия». */
  label: string
  /** Величина. Живёт в данных, но в текст не попадает. */
  delta: number
  direction: Direction
  magnitude: Magnitude
  /** Фраза целиком: «Уважение заметно выросло». */
  text: string
  marker: string
}

interface DimensionWords {
  label: string
  up: string
  down: string
}

const WORDS: Record<'respect' | 'affection' | 'romance', DimensionWords> = {
  respect: { label: 'Уважение', up: 'выросло', down: 'упало' },
  affection: { label: 'Симпатия', up: 'выросла', down: 'упала' },
  romance: { label: 'Романтический интерес', up: 'вырос', down: 'угас' },
}

/** Человеческие названия навыков. Живут в content, сюда приходят параметром. */
export type SkillLabels = Readonly<Record<string, string>>

function change(
  dimension: ChangeDimension,
  label: string,
  delta: number,
  text: string,
  magnitude: Exclude<Magnitude, 'none'>,
): ConsequenceChange {
  return {
    dimension,
    label,
    delta,
    direction: directionOf(delta),
    magnitude,
    text,
    marker: directionMarker(delta),
  }
}

/** Изменение по одному из измерений отношений. Ноль — значит рассказывать нечего. */
export function describeRelationshipChange(
  dimension: 'respect' | 'affection' | 'romance',
  delta: number,
): ConsequenceChange | null {
  const magnitude = magnitudeOf(delta)
  if (magnitude === 'none') return null
  const words = WORDS[dimension]
  const verb = delta > 0 ? words.up : words.down
  const text = `${words.label} ${MAGNITUDE_WORDS[magnitude]} ${verb}`
  return change(dimension, words.label, delta, text, magnitude)
}

/** Сдвиг по шкале традиций описывается направлением, а не числом. */
export function describeFactionChange(delta: number): ConsequenceChange | null {
  const magnitude = magnitudeOf(delta)
  if (magnitude === 'none') return null
  const side = delta > 0 ? 'континентальной' : 'аналитической'
  const text = `Вас ${MAGNITUDE_WORDS[magnitude]} качнуло к ${side} традиции`
  return change('faction', 'Взгляды', delta, text, magnitude)
}

export function describeSkillChange(
  skillId: string,
  delta: number,
  labels: SkillLabels = {},
): ConsequenceChange | null {
  const magnitude = magnitudeOf(delta)
  if (magnitude === 'none') return null
  const label = `Навык «${labels[skillId] ?? skillId}»`
  const verb = delta > 0 ? 'подрос' : 'просел'
  const text = `${label} ${MAGNITUDE_WORDS[magnitude]} ${verb}`
  return change('skill', label, delta, text, magnitude)
}

/** Изменения, которые способна принести одна реплика. */
export interface ChangeSet {
  respect?: number
  affection?: number
  romance?: number
  faction?: number
  skill?: { id: string; amount: number }
}

/** Накопленное за разговор. */
export interface EffectTotals {
  respect: number
  affection: number
  romance: number
  faction: number
  skills: Record<string, number>
}

export function emptyTotals(): EffectTotals {
  return { respect: 0, affection: 0, romance: 0, faction: 0, skills: {} }
}

/** Складывает изменения в новый итог — исходный не трогает. */
export function addChanges(totals: EffectTotals, changes: ChangeSet): EffectTotals {
  const skills: Record<string, number> = { ...totals.skills }
  if (changes.skill) {
    skills[changes.skill.id] = (skills[changes.skill.id] ?? 0) + changes.skill.amount
  }
  return {
    respect: totals.respect + (changes.respect ?? 0),
    affection: totals.affection + (changes.affection ?? 0),
    romance: totals.romance + (changes.romance ?? 0),
    faction: totals.faction + (changes.faction ?? 0),
    skills,
  }
}

function collect(
  source: ChangeSet | EffectTotals,
  skills: Record<string, number>,
  labels: SkillLabels,
): ConsequenceChange[] {
  const changes: ConsequenceChange[] = []
  for (const dimension of ['respect', 'affection', 'romance'] as const) {
    const described = describeRelationshipChange(dimension, source[dimension] ?? 0)
    if (described) changes.push(described)
  }
  const faction = describeFactionChange(source.faction ?? 0)
  if (faction) changes.push(faction)
  for (const [skillId, amount] of Object.entries(skills)) {
    const described = describeSkillChange(skillId, amount, labels)
    if (described) changes.push(described)
  }
  return changes
}

/** Все изменения одной реплики. */
export function changesOf(changes: ChangeSet, labels: SkillLabels = {}): ConsequenceChange[] {
  const skills = changes.skill ? { [changes.skill.id]: changes.skill.amount } : {}
  return collect(changes, skills, labels)
}

/** Все изменения за разговор целиком. */
export function changesOfTotals(
  totals: EffectTotals,
  labels: SkillLabels = {},
): ConsequenceChange[] {
  return collect(totals, totals.skills, labels)
}

/** Что игрок узнаёт сразу после выбора реплики. */
export interface ConsequenceReport {
  /** Авторская фраза: что произошло между вами и почему. */
  reason: string
  changes: ConsequenceChange[]
  /** Всё вместе, одной строкой. */
  text: string
}

function joinChanges(changes: ConsequenceChange[]): string {
  return changes.map((item) => item.text).join('. ')
}

export function describeChoice(
  reason: string,
  changes: ChangeSet,
  labels: SkillLabels = {},
): ConsequenceReport {
  const described = changesOf(changes, labels)
  const tail = described.length > 0 ? ` ${joinChanges(described)}.` : ''
  return { reason, changes: described, text: `${reason}${tail}` }
}

/** Итог всего разговора — тоже человеческим языком. */
export interface OutcomeReport {
  /** Краткое название исхода: «Братство по оружию». */
  title: string
  /** Чем всё кончилось и что это значит. */
  summary: string
  changes: ConsequenceChange[]
  /** «В сумме: уважение сильно выросло, симпатия заметно упала.» */
  closing: string
  text: string
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

export function describeConversation(
  outcome: { title: string; summary: string; totals: EffectTotals },
  labels: SkillLabels = {},
): OutcomeReport {
  const changes = changesOfTotals(outcome.totals, labels)
  const closing =
    changes.length > 0
      ? `В сумме: ${changes.map((item) => lowerFirst(item.text)).join(', ')}.`
      : 'В сумме между вами ничего не изменилось.'
  return {
    title: outcome.title,
    summary: outcome.summary,
    changes,
    closing,
    text: `${outcome.title}. ${outcome.summary} ${closing}`,
  }
}

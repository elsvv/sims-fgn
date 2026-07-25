import {
  directionOf,
  markerFor,
  type Direction,
  type Magnitude,
} from '../dialogue/Consequences'

/**
 * Отношения с персонажем по двум независимым измерениям.
 * Можно быть любимым и не уважаемым — и наоборот. С преподавателями
 * обычно качается уважение, с однокурсниками — симпатия.
 */
export interface Relationship {
  /** Насколько человек к тебе расположен, −100..100. */
  affection: number
  /** Насколько человек тебя ценит как студента, −100..100. */
  respect: number
}

export type RelationshipLevel = 'hostile' | 'stranger' | 'acquaintance' | 'friendly' | 'close'

const LEVEL_LABELS: Record<RelationshipLevel, string> = {
  hostile: 'Неприязнь',
  stranger: 'Незнакомы',
  acquaintance: 'Знакомы',
  friendly: 'Хорошие отношения',
  close: 'Близкие отношения',
}

function clamp(value: number): number {
  return Math.min(100, Math.max(-100, value))
}

export function relationshipLevel(relationship: Relationship): RelationshipLevel {
  const { affection, respect } = relationship

  if (affection <= -40 || respect <= -40) return 'hostile'
  if (affection >= 60 && respect >= 60) return 'close'
  if (affection >= 35) return 'friendly'
  if (affection >= 15 || respect >= 15) return 'acquaintance'
  return 'stranger'
}

export function createRelationship(): Relationship {
  return { affection: 0, respect: 0 }
}

/* ------------------------------------------------------------------ */
/* Как далеко зашло — словами                                          */
/* ------------------------------------------------------------------ */

/**
 * Насколько далеко зашло одно измерение отношений.
 *
 * Шкала своя, не та, которой меряют одну реплику (dialogue/Consequences.ts).
 * Там «сильно» начинается с десятки, потому что десять единиц уважения
 * за одну фразу — это много. Здесь копится весь модуль, и десятка за шесть
 * недель — едва начало знакомства. Величина округляется: пол-единицы
 * симпатии — не отношения, а остаток от умножения.
 */
export function standingMagnitude(value: number): Magnitude {
  const size = Math.abs(Math.round(value))
  if (size === 0) return 'none'
  if (size <= 12) return 'slight'
  if (size <= 35) return 'noticeable'
  return 'strong'
}

/**
 * Слова о том, как к вам относятся. Пишутся безлично: фамилии в игре
 * и мужские, и женские, а склеенный из шаблона глагол однажды выдаст
 * «Алиева посмотрел».
 */
const STANDING_WORDS: Record<
  'affection' | 'respect',
  Record<Exclude<Magnitude, 'none'>, { up: string; down: string }>
> = {
  affection: {
    slight: { up: 'к вам скорее тепло', down: 'к вам прохладно' },
    noticeable: { up: 'к вам расположены', down: 'вас недолюбливают' },
    strong: { up: 'вас здесь любят', down: 'вас тут не выносят' },
  },
  respect: {
    slight: { up: 'кое-что за вами признают', down: 'держат за слабого' },
    noticeable: { up: 'с вами считаются', down: 'на вас махнули рукой' },
    strong: { up: 'ценят как сильного студента', down: 'списали со счетов' },
  },
}

const DIMENSION_LABELS: Record<'affection' | 'respect', string> = {
  affection: 'Симпатия',
  respect: 'Уважение',
}

/** Одно измерение отношений глазами игрока: фраза и неброский указатель. */
export interface RelationshipStanding {
  dimension: 'affection' | 'respect'
  /** Название измерения: «Симпатия», «Уважение». */
  label: string
  /** Фраза целиком: «Уважение: с вами считаются». */
  text: string
  direction: Direction
  magnitude: Magnitude
  /** Стрелки: одна — чуть заметно, три — сильно. */
  marker: string
}

/**
 * Описывает одно измерение. null — рассказывать нечего: между вами пока
 * ничего не произошло.
 */
export function describeStanding(
  dimension: 'affection' | 'respect',
  value: number,
): RelationshipStanding | null {
  const magnitude = standingMagnitude(value)
  if (magnitude === 'none') return null
  const direction = directionOf(value)
  const words = STANDING_WORDS[dimension][magnitude]
  const label = DIMENSION_LABELS[dimension]
  return {
    dimension,
    label,
    text: `${label}: ${direction === 'down' ? words.down : words.up}`,
    direction,
    magnitude,
    marker: markerFor(direction, magnitude),
  }
}

/**
 * Отношения с человеком словами — то, что показывает панель людей.
 *
 * Пустой список означает, что человек вам пока никто: он в списке
 * знакомых и не появляется.
 */
export function standingOf(relationship: Relationship): RelationshipStanding[] {
  return [
    describeStanding('affection', relationship.affection),
    describeStanding('respect', relationship.respect),
  ].filter((standing): standing is RelationshipStanding => standing !== null)
}

/** Отношения со всеми сразу: ключ — идентификатор человека. */
export type RelationshipRecords = Record<string, Relationship>

export class RelationshipMap {
  private entries: RelationshipRecords = {}

  get(npcId: string): Relationship {
    return this.entries[npcId] ?? createRelationship()
  }

  set(npcId: string, relationship: Relationship): void {
    this.entries[npcId] = {
      affection: clamp(relationship.affection),
      respect: clamp(relationship.respect),
    }
  }

  adjust(npcId: string, delta: Partial<Relationship>): void {
    const current = this.get(npcId)
    this.set(npcId, {
      affection: current.affection + (delta.affection ?? 0),
      respect: current.respect + (delta.respect ?? 0),
    })
  }

  levelOf(npcId: string): RelationshipLevel {
    return relationshipLevel(this.get(npcId))
  }

  describeFor(npcId: string): string {
    return LEVEL_LABELS[this.levelOf(npcId)]
  }

  toJSON(): RelationshipRecords {
    return JSON.parse(JSON.stringify(this.entries)) as RelationshipRecords
  }

  /** Возвращает состояние на место, в уже существующую карту отношений. */
  load(entries: RelationshipRecords): void {
    this.entries = JSON.parse(JSON.stringify(entries)) as RelationshipRecords
  }

  static fromJSON(entries: RelationshipRecords): RelationshipMap {
    const map = new RelationshipMap()
    map.load(entries)
    return map
  }
}

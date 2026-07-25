import type { Relationship } from './Relationship'

/**
 * Третье измерение отношений — романтический интерес.
 *
 * ГЛАВНОЕ ОГРАНИЧЕНИЕ, ради которого написан этот модуль.
 * Романтические линии допустимы ТОЛЬКО для вымышленных однокурсников.
 * Преподаватели — реальные люди под настоящими именами, и никаких
 * романтических реплик, намёков и веток у них нет и быть не может.
 * Это не соглашение и не договорённость на словах: это свойство персонажа
 * (`romanceable`) плюс валидация, которая падает с внятной ошибкой, если
 * романтический эффект прицепили не туда. См. Romance.test.ts.
 *
 * Relationship.ts не тронут: романтическое измерение живёт здесь и
 * надстраивается над симпатией и уважением, а не переписывает их.
 */

export type PersonKind = 'teacher' | 'classmate' | 'staff'

export interface PersonProfile {
  id: string
  /** Как персонажа зовут в интерфейсе. */
  name: string
  kind: PersonKind
  /**
   * Персонаж выдуман целиком, а не списан с живого человека
   * под его настоящим именем.
   */
  fictional: boolean
  /**
   * Явное разрешение на романтическую линию. Ставится вручную и только
   * вымышленным однокурсникам. Для всех остальных — false, и валидация
   * следит, чтобы это не превратилось в опечатку.
   */
  romanceable: boolean
}

/** Отношения с романтическим измерением поверх симпатии и уважения. */
export interface RomanticRelationship extends Relationship {
  /** Романтический интерес, 0..100. */
  romance: number
}

export function withRomance(relationship: Relationship, romance: number): RomanticRelationship {
  return { ...relationship, romance: clampRomance(romance) }
}

export type RomanceLevel = 'none' | 'spark' | 'flirt' | 'infatuation'

export const ROMANCE_LABELS: Record<RomanceLevel, string> = {
  none: 'Ничего нет',
  spark: 'Искра',
  flirt: 'Флирт',
  infatuation: 'Влюблённость',
}

/** С какого значения начинается уровень. */
export const ROMANCE_THRESHOLDS: Record<RomanceLevel, number> = {
  none: 0,
  spark: 10,
  flirt: 35,
  infatuation: 65,
}

/**
 * Сколько симпатии нужно накопить, чтобы уровень вообще стал возможен.
 * Романтический интерес не растёт на пустом месте: сперва человек должен
 * быть вам рад.
 */
export const AFFECTION_GATES: Record<RomanceLevel, number> = {
  none: -100,
  spark: 15,
  flirt: 35,
  infatuation: 60,
}

export function clampRomance(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function romanceLevel(value: number): RomanceLevel {
  if (value >= ROMANCE_THRESHOLDS.infatuation) return 'infatuation'
  if (value >= ROMANCE_THRESHOLDS.flirt) return 'flirt'
  if (value >= ROMANCE_THRESHOLDS.spark) return 'spark'
  return 'none'
}

export function romanceLabel(value: number): string {
  return ROMANCE_LABELS[romanceLevel(value)]
}

/** Потолок романтического интереса при нынешней симпатии. */
export function romanceCeiling(affection: number): number {
  if (affection < AFFECTION_GATES.spark) return ROMANCE_THRESHOLDS.spark - 1
  if (affection < AFFECTION_GATES.flirt) return ROMANCE_THRESHOLDS.flirt - 1
  if (affection < AFFECTION_GATES.infatuation) return ROMANCE_THRESHOLDS.infatuation - 1
  return 100
}

export interface RomanceStep {
  value: number
  level: RomanceLevel
  /** Рост упёрся в потолок: симпатии пока не хватает. */
  capped: boolean
  /** Человеческое объяснение, если упёрлись. */
  note?: string
}

const CAPPED_NOTE = 'Дальше пока некуда: тут нужна не настойчивость, а накопленная симпатия.'

/**
 * Растит или гасит романтический интерес.
 * Вверх — не выше потолка, который задаёт симпатия; вниз — свободно.
 */
export function advanceRomance(current: number, amount: number, affection: number): RomanceStep {
  const raw = clampRomance(current + amount)
  const ceiling = romanceCeiling(affection)
  const capped = amount > 0 && raw > ceiling
  const value = capped ? Math.max(clampRomance(current), ceiling) : raw
  const step: RomanceStep = { value, level: romanceLevel(value), capped }
  if (capped) step.note = CAPPED_NOTE
  return step
}

export class RomanceForbiddenError extends Error {
  readonly personId: string

  constructor(profile: PersonProfile) {
    super(romanceForbiddenReason(profile))
    this.name = 'RomanceForbiddenError'
    this.personId = profile.id
  }
}

/** Почему именно с этим персонажем романтическая линия невозможна. */
export function romanceForbiddenReason(profile: PersonProfile): string {
  const who = `«${profile.name}» (${profile.id})`
  if (profile.kind === 'teacher') {
    return `Романтическая линия с ${who} запрещена: это преподаватель, реальный человек под настоящим именем.`
  }
  if (!profile.fictional) {
    return `Романтическая линия с ${who} запрещена: персонаж не выдуман, а списан с живого человека.`
  }
  if (profile.kind !== 'classmate') {
    return `Романтическая линия с ${who} запрещена: романтические ветки есть только у однокурсников.`
  }
  return `Романтическая линия с ${who} не разрешена: у персонажа не выставлено свойство romanceable.`
}

export function canRomance(profile: PersonProfile | undefined): boolean {
  if (!profile) return false
  return profile.kind === 'classmate' && profile.fictional && profile.romanceable
}

/**
 * Проверка самого каталога персонажей: разрешение стоит только там,
 * где оно вообще может стоять. Ловит опечатку в данных до запуска игры.
 */
export function assertProfileSane(profile: PersonProfile): void {
  if (!profile.romanceable) return
  if (!canRomance(profile)) throw new RomanceForbiddenError(profile)
}

export function validateProfiles(profiles: Record<string, PersonProfile>): string[] {
  const problems: string[] = []
  for (const [key, profile] of Object.entries(profiles)) {
    if (profile.id !== key) {
      problems.push(`Ключ каталога «${key}» не совпадает с идентификатором «${profile.id}».`)
    }
    if (profile.romanceable && !canRomance(profile)) {
      problems.push(romanceForbiddenReason(profile))
    }
  }
  return problems
}

/**
 * Романтический интерес по персонажам.
 * Держит рядом каталог профилей, поэтому не даёт вырастить интерес там,
 * где его быть не должно, — падает, а не тихо игнорирует.
 */
export class RomanceTracker {
  private readonly profiles: Record<string, PersonProfile>
  private values: Record<string, number> = {}

  constructor(profiles: Record<string, PersonProfile>) {
    const problems = validateProfiles(profiles)
    if (problems.length > 0) throw new Error(problems.join('\n'))
    this.profiles = profiles
  }

  profileOf(personId: string): PersonProfile | undefined {
    return this.profiles[personId]
  }

  allows(personId: string): boolean {
    return canRomance(this.profiles[personId])
  }

  interestIn(personId: string): number {
    return this.values[personId] ?? 0
  }

  levelOf(personId: string): RomanceLevel {
    return romanceLevel(this.interestIn(personId))
  }

  describeFor(personId: string): string {
    return romanceLabel(this.interestIn(personId))
  }

  /**
   * Двигает романтический интерес. Бросает RomanceForbiddenError, если
   * персонажу романтическая линия не положена, — молчаливого «ничего
   * не произошло» здесь быть не должно, это ошибка контента.
   */
  advance(personId: string, amount: number, affection: number): RomanceStep {
    const profile = this.profiles[personId]
    if (!profile) throw new Error(`Персонаж «${personId}» отсутствует в каталоге профилей.`)
    if (!canRomance(profile)) throw new RomanceForbiddenError(profile)
    const step = advanceRomance(this.interestIn(personId), amount, affection)
    this.values[personId] = step.value
    return step
  }

  toJSON(): Record<string, number> {
    return { ...this.values }
  }

  static fromJSON(
    profiles: Record<string, PersonProfile>,
    values: Record<string, number>,
  ): RomanceTracker {
    const tracker = new RomanceTracker(profiles)
    tracker.values = { ...values }
    return tracker
  }
}

import type { Relationship } from '../social/Relationship'

/** Всё, что нужно знать, чтобы решить, доступна ли реплика. */
export interface DialogueContext {
  /** Уровни навыков по идентификаторам, 0..10. */
  skills: Record<string, number>
  /** Позиция игрока на шкале традиций. */
  faction: number
  relationship: Relationship
  /** Идентификаторы прочитанных книг. */
  readBooks: string[]
  day: number
}

export interface DialogueRequirement {
  skillId?: string
  skillMin?: number
  factionMin?: number
  factionMax?: number
  respectMin?: number
  affectionMin?: number
  book?: string
}

export interface DialogueEffects {
  respect?: number
  affection?: number
  /** Сдвиг по шкале традиций. */
  faction?: number
  /** Прирост навыка: идентификатор и величина. */
  skill?: { id: string; amount: number }
  /** Оценка за выступление, 0..10 — если реплика прозвучала на семинаре. */
  grade?: number
}

export interface DialogueOption {
  id: string
  /** Что говорит игрок. */
  text: string
  requires?: DialogueRequirement
  effects: DialogueEffects
  /** Что отвечает собеседник. */
  reply: string
}

export interface DialogueNode {
  id: string
  speakerId: string
  /** Реплика собеседника, открывающая разговор. */
  prompt: string
  options: DialogueOption[]
}

export function isAvailable(
  requirement: DialogueRequirement,
  context: DialogueContext,
): boolean {
  if (requirement.skillId !== undefined) {
    const level = context.skills[requirement.skillId] ?? 0
    if (level < (requirement.skillMin ?? 0)) return false
  }
  if (requirement.factionMin !== undefined && context.faction < requirement.factionMin) {
    return false
  }
  if (requirement.factionMax !== undefined && context.faction > requirement.factionMax) {
    return false
  }
  if (
    requirement.respectMin !== undefined &&
    context.relationship.respect < requirement.respectMin
  ) {
    return false
  }
  if (
    requirement.affectionMin !== undefined &&
    context.relationship.affection < requirement.affectionMin
  ) {
    return false
  }
  if (requirement.book !== undefined && !context.readBooks.includes(requirement.book)) {
    return false
  }
  return true
}

/**
 * Реплики, доступные игроку прямо сейчас.
 * Реплика без условий доступна всегда — у игрока никогда не должно
 * оказаться пустого меню.
 */
export function availableOptions(
  node: DialogueNode,
  context: DialogueContext,
): DialogueOption[] {
  return node.options.filter((option) =>
    option.requires ? isAvailable(option.requires, context) : true,
  )
}

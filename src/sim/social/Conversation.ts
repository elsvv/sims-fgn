import {
  availableOptions,
  type DialogueContext,
  type DialogueEffects,
  type DialogueNode,
  type DialogueOption,
} from '../dialogue/Dialogue'
import { affinity, affinityBonus } from './Faction'
import type { Teacher } from './Teacher'

/**
 * Разговор, идущий прямо сейчас.
 *
 * Список реплик отфильтрован один раз, в момент начала разговора: если
 * пересчитывать его после каждого ответа, у игрока на глазах пропадали бы
 * и появлялись строки меню от собственного же выбора.
 */
export interface ActiveDialogue {
  /** С кем разговариваем. Идентификатор NPC, а не преподавателя. */
  npcId: string
  node: DialogueNode
  /** Реплики, доступные игроку в этом разговоре. */
  options: DialogueOption[]
  /** Что собеседник ответил. null — игрок ещё не выбрал реплику. */
  reply: string | null
}

export function openDialogue(
  npcId: string,
  node: DialogueNode,
  context: DialogueContext,
): ActiveDialogue {
  return { npcId, node, options: availableOptions(node, context), reply: null }
}

/**
 * Множитель к приросту уважения от близости взглядов.
 *
 * Здесь шкала традиций перестаёт быть числом в интерфейсе и начинает
 * работать: один и тот же умный ответ приносит убеждённому аналитику
 * у Долгорукова вчетверо больше уважения, чем у Михайловского. Собеседник
 * без позиции на шкале — однокурсник, вахтёр — считает без множителя.
 */
export function respectMultiplier(
  teacher: Teacher | undefined,
  playerFaction: number,
): number {
  if (!teacher) return 1
  return affinityBonus(
    affinity(teacher.factionPosition, teacher.factionTolerance, playerFaction),
  )
}

/** Что реально произойдёт после выбранной реплики. */
export interface DialogueGains {
  respect: number
  affection: number
  /** Сдвиг по шкале традиций. */
  faction: number
  skill: { id: string; amount: number } | null
}

/**
 * Переводит объявленные эффекты реплики в то, что применится к состоянию.
 *
 * Множитель близости действует только на прирост. Потеря уважения идёт
 * в полном размере у всех: общие взгляды помогают заслужить уважение,
 * но не защищают от сказанной глупости.
 */
export function resolveEffects(
  effects: DialogueEffects,
  multiplier: number,
): DialogueGains {
  const respect = effects.respect ?? 0
  return {
    respect: respect > 0 ? respect * multiplier : respect,
    affection: effects.affection ?? 0,
    faction: effects.faction ?? 0,
    skill: effects.skill ? { ...effects.skill } : null,
  }
}

import type { DaySummary } from '../daily/DaySummary'
import type { WeekendReport } from '../daily/Weekend'
import type { EpilogueReport } from '../epilogue/Epilogue'
import type { Moodlet } from '../needs/Moodlets'
import type { Needs } from '../needs/needs'
import type { NpcPlacement } from '../npc/Npc'
import type { Skills } from '../player/Skills'
import type { RelationshipRecords } from '../social/Relationship'
import { describeDay } from '../study/Calendar'
import type { StudyStateData } from '../study/StudyState'
import { formatClock, MINUTES_PER_DAY, type GameClockState } from '../time/GameClock'
import type { Vec2 } from '../types'
import type { ActiveInteraction, SeminarSpeechInfo } from '../World'

/**
 * Сохранение и загрузка игры.
 *
 * Модуль ничего не знает ни про localStorage, ни про файлы, ни про браузер:
 * он превращает мир в обычный объект и обратно. Где этот объект лежит —
 * дело слоя, которому такое положено (src/render/save/SaveStorage.ts).
 *
 * В сохранение идёт только нажитое игроком. Планировка этажа, программы
 * дисциплин, расписание, реплики преподавателей и тексты сцен — это
 * содержимое каталога: оно одинаково у всех, приходит из content при
 * запуске и в файле сохранения ему делать нечего. Иначе правка одной
 * запятой в реплике Марея ломала бы все чужие сохранения.
 */

/**
 * Версия схемы сохранения.
 *
 * Поднимается всякий раз, когда состав WorldState меняется так, что старый
 * файл прочитать уже нельзя. Игра не пытается угадать, что лежало в чужой
 * версии, а честно отказывается — см. SaveVersionError.
 */
export const SAVE_VERSION = 1

/** Где стоит игрок. Путь не сохраняется: маршрут — это намерение, а не состояние. */
export interface ActorPlacement {
  position: Vec2
  /** Направление взгляда в радианах. */
  facing: number
}

/** Слепок утра, с которым сравниваются вечерние итоги дня. */
export interface DayBaselineState {
  skills: Skills
  relationships: RelationshipRecords
  faction: number
}

/** Состояние суточного цикла: экраны, которые прерывают игру, и счётчики модуля. */
export interface DayCycleState {
  /** Итоги прожитого дня, ждущие прочтения. */
  summary: DaySummary | null
  /** Карточка воскресенья ждёт выбора. */
  weekendPending: boolean
  weekendReport: WeekendReport | null
  epilogue: EpilogueReport | null
  baseline: DayBaselineState
  /** Сумма стресса, взвешенная по прожитым минутам. Из неё считается средний. */
  stressSum: number
  /** Сколько игровых минут персонаж провёл бодрствуя. */
  awakeMinutes: number
}

/**
 * Состояние мира целиком.
 *
 * Чего здесь нет намеренно — идущего разговора. Разговор живёт поверх мира,
 * а не в нём: его эффекты применяются к миру на каждом шаге и уже лежат
 * в отношениях, навыках и модификаторах, а вот доступность реплик снята
 * в момент начала сцены и с тех пор нарочно не пересчитывается (см. World,
 * dialogueContext). Восстановленная сцена считала бы её заново — и посреди
 * разговора у игрока появились бы реплики, открывшиеся этим же разговором.
 * Поэтому сохранение снимает мир, а окно разговора при загрузке закрыто.
 */
export interface WorldState {
  clock: GameClockState
  needs: Needs
  skills: Skills
  /** Позиция на шкале философских традиций, −100..100. */
  faction: number
  moodlets: Moodlet[]
  player: ActorPlacement
  npcs: NpcPlacement[]
  /** Начатое действие с предметом: игрок вернётся ровно к нему. */
  activeInteraction: ActiveInteraction | null
  relationships: RelationshipRecords
  readBooks: string[]
  /** Узлы разговоров, через которые игрок прошёл, — память о прошлых разговорах. */
  visitedNodes: string[]
  /** Одноразовые сцены, которые уже сыграны. */
  playedChains: string[]
  lastSpeech: SeminarSpeechInfo | null
  /** Учебное состояние. null — мир без учёбы. */
  study: StudyStateData | null
  day: DayCycleState
}

/**
 * Что игра знает о сохранении, не разворачивая его.
 *
 * Ровно то, что видно в списке слотов: когда сохранились по-настоящему
 * и когда — в игре. Считается один раз при сохранении, чтобы список
 * слотов не разбирал по четыре мира ради четырёх строчек.
 */
export interface SaveMeta {
  /** Реальное время сохранения, миллисекунды эпохи. */
  savedAt: number
  /** Игровой день с начала модуля, начиная с нуля. */
  day: number
  /** Он же словами: «Неделя 2, среда». */
  dayLabel: string
  /** Время суток: «14:20». */
  timeLabel: string
}

export interface SaveGame {
  version: number
  meta: SaveMeta
  world: WorldState
}

/** Мир глазами сохранения: больше от него ничего не нужно. */
export interface SaveSource {
  captureState(): WorldState
}

/** Мир глазами загрузки. */
export interface SaveTarget {
  restoreState(state: WorldState): void
}

/** Файл есть, но игра его не понимает: чужая или будущая версия схемы. */
export class SaveVersionError extends Error {
  /** Версия, найденная в файле. */
  readonly found: number
  /** Версия, с которой игра умеет работать. */
  readonly expected: number

  constructor(found: number, expected: number = SAVE_VERSION) {
    super(
      found > expected
        ? `Это сохранение сделано более новой версией игры (схема ${found}, игра понимает ${expected}). Обновите игру или начните заново.`
        : `Это сохранение сделано старой версией игры (схема ${found}, игра понимает ${expected}). Перенести его не получится — придётся начать заново.`,
    )
    this.name = 'SaveVersionError'
    this.found = found
    this.expected = expected
  }
}

/** Файл есть, но это не сохранение или оно испорчено. */
export class SaveFormatError extends Error {
  constructor(reason: string) {
    super(`Сохранение не читается: ${reason}`)
    this.name = 'SaveFormatError'
  }
}

/** Глубокая копия простых данных. Всё, что попадает в сохранение, именно такое. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Метаданные считаются из самого состояния: двух источников правды о времени быть не должно. */
export function metaFor(state: WorldState, savedAt: number): SaveMeta {
  const day = Math.floor(state.clock.totalMinutes / MINUTES_PER_DAY)
  const minutes = state.clock.totalMinutes % MINUTES_PER_DAY
  return {
    savedAt,
    day,
    dayLabel: describeDay(day),
    timeLabel: formatClock(minutes),
  }
}

/**
 * Снимает сохранение с мира.
 *
 * @param savedAt реальное время, миллисекунды эпохи. Приходит снаружи:
 * симуляция не спрашивает у системы, который час, — от этого зависела бы
 * повторяемость тестов.
 */
export function createSave(source: SaveSource, savedAt: number): SaveGame {
  const world = source.captureState()
  return { version: SAVE_VERSION, meta: metaFor(world, savedAt), world }
}

/**
 * Возвращает мир в сохранённое состояние.
 * Бросает SaveVersionError, если сохранение чужой версии.
 */
export function applySave(target: SaveTarget, save: SaveGame): void {
  if (save.version !== SAVE_VERSION) throw new SaveVersionError(save.version)
  target.restoreState(clone(save.world))
}

export function encodeSave(save: SaveGame): string {
  return JSON.stringify(save)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Разделы, без которых восстанавливать нечего. */
const REQUIRED_WORLD_KEYS = ['clock', 'needs', 'skills', 'relationships', 'day'] as const

/**
 * Проверяет разобранный объект и отдаёт его как сохранение.
 *
 * Проверка нарочно неглубокая: сохранение пишет сама игра, а не человек,
 * и поле за полем сверять нечего. Поймать надо две беды — чужой файл
 * в хранилище и несовместимую версию, — и обе ловятся здесь.
 */
export function parseSave(value: unknown): SaveGame {
  if (!isRecord(value)) throw new SaveFormatError('это не объект сохранения.')

  const { version, meta, world } = value
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new SaveFormatError('в файле не указана версия схемы.')
  }
  if (version !== SAVE_VERSION) throw new SaveVersionError(version)

  if (!isRecord(meta) || typeof meta.savedAt !== 'number' || typeof meta.day !== 'number') {
    throw new SaveFormatError('в файле нет сведений о том, когда и на каком дне сохранялись.')
  }
  if (!isRecord(world)) throw new SaveFormatError('в файле нет состояния мира.')

  const missing = REQUIRED_WORLD_KEYS.filter((key) => world[key] === undefined)
  if (missing.length > 0) {
    throw new SaveFormatError(`в состоянии мира не хватает разделов: ${missing.join(', ')}.`)
  }

  // Проверенное выше — это форма сохранения; остальное игра писала сама.
  return value as unknown as SaveGame
}

/** Разбирает текст из хранилища. Бросает SaveFormatError или SaveVersionError. */
export function decodeSave(text: string): SaveGame {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SaveFormatError('это не JSON.')
  }
  return parseSave(parsed)
}

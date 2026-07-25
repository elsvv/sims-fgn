import {
  createSave,
  decodeSave,
  encodeSave,
  type SaveGame,
  type SaveMeta,
  type SaveSource,
} from '../../sim/save/SaveGame'

/**
 * Где живут сохранения.
 *
 * Симуляция про браузер ничего не знает и знать не должна: она умеет
 * превращать мир в объект и обратно (sim/save/SaveGame.ts), а localStorage —
 * это уже слой представления, и хранилище лежит здесь.
 *
 * Само хранилище передаётся снаружи и описано минимальным интерфейсом.
 * Так модуль проверяется в Node без браузера, и так же он переживёт день,
 * когда сохранения понадобится положить не в localStorage, а куда-то ещё.
 */

/** Общий префикс ключей: чужие ключи на том же домене не наши. */
export const STORAGE_PREFIX = 'sims-fgn/save/'

/** Слот автосохранения. Его пишет игра, а не игрок. */
export const AUTO_SLOT = 'auto'

/** Слоты, которыми распоряжается игрок. */
export const MANUAL_SLOTS: readonly string[] = ['1', '2', '3']

export const SLOT_IDS: readonly string[] = [AUTO_SLOT, ...MANUAL_SLOTS]

/** Всё, что нужно от хранилища. localStorage подходит как есть. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Слот глазами интерфейса: что в нём лежит и можно ли это загрузить. */
export interface SlotInfo {
  id: string
  /** Подпись слота: «Автосохранение», «Слот 2». */
  label: string
  auto: boolean
  /** Пусто — в слоте ничего нет. */
  meta: SaveMeta | null
  /** Когда сохранились по-настоящему: «24 июля, 19:03». */
  savedAtLabel: string | null
  /** Где остановились в игре: «Неделя 2, среда, 14:20». */
  progressLabel: string | null
  /**
   * В слоте что-то есть, но прочитать это нельзя, и вот почему.
   * Такой слот показывается, но не загружается: молча стереть чужое
   * сохранение хуже, чем честно сказать, что оно не читается.
   */
  problem: string | null
}

/** Итог записи: место в localStorage кончается, и об этом надо сказать словами. */
export type WriteResult = { ok: true } | { ok: false; reason: string }

/** Подпись слота для интерфейса. */
export function slotLabel(slotId: string): string {
  return slotId === AUTO_SLOT ? 'Автосохранение' : `Слот ${slotId}`
}

const SAVED_AT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** Реальное время сохранения по-русски: «24 июля, 19:03». */
export function formatSavedAt(savedAt: number): string {
  return SAVED_AT.format(new Date(savedAt))
}

/** Игровое время сохранения: «Неделя 2, среда, 14:20». */
export function formatProgress(meta: SaveMeta): string {
  return `${meta.dayLabel}, ${meta.timeLabel}`
}

/**
 * Пора ли автосохраняться.
 *
 * Правило одно: сменился игровой день. Момент выбран не наугад — день
 * кончается сном, а сон в этой игре и есть точка, из которой не жалко
 * переиграть. null означает, что игра только что открылась: тогда не пора,
 * иначе первое же открытие затирало бы автосохранение прошлой партии.
 */
export function shouldAutoSave(previousDay: number | null, day: number): boolean {
  return previousDay !== null && previousDay !== day
}

/**
 * Хранилище браузера, если оно есть и работает.
 *
 * Возвращает null в приватном режиме, в Node и всюду, где localStorage
 * запрещён политикой: игра при этом должна идти дальше без сохранений,
 * а не падать белым экраном.
 */
export function browserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    // Доступ к localStorage может быть разрешён на чтение и запрещён
    // на запись. Единственный способ узнать это — попробовать.
    const probe = `${STORAGE_PREFIX}probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

export class SaveStorage {
  private readonly storage: StorageLike
  private readonly prefix: string

  constructor(storage: StorageLike, prefix: string = STORAGE_PREFIX) {
    this.storage = storage
    this.prefix = prefix
  }

  private keyOf(slotId: string): string {
    return `${this.prefix}${slotId}`
  }

  /** Текст слота или null, если слот пуст. */
  raw(slotId: string): string | null {
    try {
      return this.storage.getItem(this.keyOf(slotId))
    } catch {
      return null
    }
  }

  has(slotId: string): boolean {
    return this.raw(slotId) !== null
  }

  /**
   * Читает слот. Пусто — null.
   * Бросает SaveVersionError или SaveFormatError, если прочитать нельзя:
   * загрузка обязана сказать почему, а не молча ничего не сделать.
   */
  read(slotId: string): SaveGame | null {
    const text = this.raw(slotId)
    return text === null ? null : decodeSave(text)
  }

  /**
   * Пишет слот. Ошибку не бросает: место в хранилище может кончиться
   * в любой момент, и это не повод ронять игру посреди дня.
   */
  write(slotId: string, save: SaveGame): WriteResult {
    try {
      this.storage.setItem(this.keyOf(slotId), encodeSave(save))
      return { ok: true }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'хранилище недоступно'
      return { ok: false, reason: `не удалось записать сохранение: ${reason}` }
    }
  }

  remove(slotId: string): void {
    try {
      this.storage.removeItem(this.keyOf(slotId))
    } catch {
      // Стереть не вышло — слот останется на месте. Ронять из-за этого
      // игру не за что.
    }
  }

  /** Что показать про слот, не загружая его. */
  describe(slotId: string): SlotInfo {
    const empty: SlotInfo = {
      id: slotId,
      label: slotLabel(slotId),
      auto: slotId === AUTO_SLOT,
      meta: null,
      savedAtLabel: null,
      progressLabel: null,
      problem: null,
    }

    const text = this.raw(slotId)
    if (text === null) return empty

    try {
      const save = decodeSave(text)
      return {
        ...empty,
        meta: save.meta,
        savedAtLabel: formatSavedAt(save.meta.savedAt),
        progressLabel: formatProgress(save.meta),
      }
    } catch (error) {
      return { ...empty, problem: error instanceof Error ? error.message : 'слот не читается' }
    }
  }

  /** Все слоты по порядку: сначала автосохранение, потом ручные. */
  list(slotIds: readonly string[] = SLOT_IDS): SlotInfo[] {
    return slotIds.map((slotId) => this.describe(slotId))
  }
}

/**
 * Автосохранение: пишет мир в свой слот, если игровой день сменился.
 *
 * Вся мысль автосохранения собрана здесь, а не в React-эффекте, ровно
 * затем, чтобы её можно было проверить тестом: эффект остаётся одной
 * строкой, а решать, когда и что писать, — дело этой функции.
 *
 * Возвращает true, если сохранение состоялось.
 */
export function autoSave(
  storage: SaveStorage | null,
  world: SaveSource,
  previousDay: number | null,
  day: number,
  savedAt: number,
): boolean {
  if (storage === null || !shouldAutoSave(previousDay, day)) return false
  return storage.write(AUTO_SLOT, createSave(world, savedAt)).ok
}

/** Хранилище в памяти. Нужно тестам и подходит там, где localStorage запрещён. */
export class MemoryStorage implements StorageLike {
  private readonly items = new Map<string, string>()

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }
}

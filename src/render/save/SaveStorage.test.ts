import { describe, expect, it } from 'vitest'
import {
  createSave,
  SaveFormatError,
  SaveVersionError,
  SAVE_VERSION,
  type SaveGame,
} from '../../sim/save/SaveGame'
import { World } from '../../sim/World'
import type { FloorPlan } from '../../sim/world/FloorPlan'
import {
  AUTO_SLOT,
  autoSave,
  browserStorage,
  formatProgress,
  formatSavedAt,
  MANUAL_SLOTS,
  MemoryStorage,
  SaveStorage,
  shouldAutoSave,
  slotLabel,
  SLOT_IDS,
  STORAGE_PREFIX,
  type StorageLike,
} from './SaveStorage'

/**
 * Хранилище сохранений: слоты, чужие файлы и отказы браузера.
 *
 * Сам круг «сохранить — загрузить» проверяет sim/save/SaveGame.test.ts.
 * Здесь проверяется то, чего симуляция не знает: что слоты не путаются
 * между собой, что список читается без разворачивания миров и что игра
 * переживает и переполненное хранилище, и чужое содержимое в нём.
 */

const PLAN: FloorPlan = {
  id: 'store',
  name: 'Этаж для хранилища',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['...', '...'],
  props: [],
  rooms: [{ id: 'коридор', name: 'Коридор', col0: 0, row0: 0, col1: 2, row1: 1 }],
}

/** Мир на нужной минуте: подпись дня в слоте берётся из него. */
function worldAt(totalMinutes: number): World {
  const world = new World(PLAN, { col: 0, row: 0 })
  world.clock.load({ totalMinutes, speed: 1 })
  return world
}

const MONDAY_MORNING = 7 * 60 + 20
/** Среда второй недели, 14:20. */
const SECOND_WEEK = (7 + 2) * 1440 + 14 * 60 + 20

/** 24 июля 2026 года, 19:03 по местному времени. */
const SAVED_AT = new Date(2026, 6, 24, 19, 3).getTime()

function storageWith(): { storage: MemoryStorage; slots: SaveStorage } {
  const storage = new MemoryStorage()
  return { storage, slots: new SaveStorage(storage) }
}

describe('SaveStorage: слоты', () => {
  it('пустой слот виден и ничем не занят', () => {
    const { slots } = storageWith()
    const info = slots.describe('1')

    expect(info).toEqual({
      id: '1',
      label: 'Слот 1',
      auto: false,
      meta: null,
      savedAtLabel: null,
      progressLabel: null,
      problem: null,
    })
    expect(slots.has('1')).toBe(false)
    expect(slots.read('1')).toBeNull()
  })

  it('записанное читается обратно', () => {
    const { slots } = storageWith()
    const save = createSave(worldAt(SECOND_WEEK), SAVED_AT)

    expect(slots.write('1', save)).toEqual({ ok: true })
    expect(slots.has('1')).toBe(true)
    expect(slots.read('1')).toEqual(save)
  })

  it('слоты не мешают друг другу', () => {
    const { slots } = storageWith()
    slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))
    slots.write('2', createSave(worldAt(SECOND_WEEK), SAVED_AT))

    expect(slots.read('1')?.meta.day).toBe(0)
    expect(slots.read('2')?.meta.day).toBe(9)
    expect(slots.read('3')).toBeNull()
  })

  it('запись в слот перезаписывает прежнее сохранение', () => {
    const { slots } = storageWith()
    slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))
    slots.write('1', createSave(worldAt(SECOND_WEEK), SAVED_AT))
    expect(slots.read('1')?.meta.day).toBe(9)
  })

  it('стёртый слот снова пуст', () => {
    const { slots } = storageWith()
    slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))
    slots.remove('1')
    expect(slots.has('1')).toBe(false)
    expect(slots.describe('1').meta).toBeNull()
  })

  it('ключи в хранилище помечены игрой: чужие рядом не пострадают', () => {
    const { storage, slots } = storageWith()
    storage.setItem('чужой-ключ', 'не трогать')
    slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))

    expect(storage.getItem(`${STORAGE_PREFIX}1`)).not.toBeNull()
    expect(storage.getItem('чужой-ключ')).toBe('не трогать')
  })

  it('список отдаёт все слоты, начиная с автосохранения', () => {
    const { slots } = storageWith()
    const list = slots.list()

    expect(list.map((slot) => slot.id)).toEqual([...SLOT_IDS])
    expect(list[0]?.id).toBe(AUTO_SLOT)
    expect(list[0]?.auto).toBe(true)
    expect(list.filter((slot) => slot.auto)).toHaveLength(1)
    expect(MANUAL_SLOTS).toHaveLength(3)
  })

  it('подписи слотов по-русски', () => {
    expect(slotLabel(AUTO_SLOT)).toBe('Автосохранение')
    expect(slotLabel('2')).toBe('Слот 2')
  })
})

describe('SaveStorage: что видно в списке', () => {
  it('дата сохранения и игровой день — без разворачивания мира', () => {
    const { slots } = storageWith()
    slots.write('2', createSave(worldAt(SECOND_WEEK), SAVED_AT))
    const info = slots.describe('2')

    expect(info.meta?.day).toBe(9)
    expect(info.progressLabel).toBe('Неделя 2, среда, 14:20')
    expect(info.savedAtLabel).toContain('24')
    expect(info.savedAtLabel).toContain('июля')
    expect(info.problem).toBeNull()
  })

  it('игровое время читается словами, а не номером дня', () => {
    const meta = createSave(worldAt(MONDAY_MORNING), SAVED_AT).meta
    expect(formatProgress(meta)).toBe('Неделя 1, понедельник, 07:20')
  })

  it('реальное время сохранения читается по-русски', () => {
    expect(formatSavedAt(SAVED_AT)).toMatch(/24 июля/)
  })
})

describe('SaveStorage: чужое и битое содержимое', () => {
  it('мусор в слоте виден как проблема, а не как пустота', () => {
    const { storage, slots } = storageWith()
    storage.setItem(`${STORAGE_PREFIX}1`, 'вообще не json')

    const info = slots.describe('1')
    expect(info.meta).toBeNull()
    expect(info.problem).toMatch(/не читается/)
    expect(slots.has('1')).toBe(true)
    expect(() => slots.read('1')).toThrow(SaveFormatError)
  })

  it('сохранение чужой версии объясняет себя, а не молчит', () => {
    const { storage, slots } = storageWith()
    const save: SaveGame = createSave(worldAt(MONDAY_MORNING), SAVED_AT)
    storage.setItem(
      `${STORAGE_PREFIX}1`,
      JSON.stringify({ ...save, version: SAVE_VERSION + 1 }),
    )

    expect(slots.describe('1').problem).toMatch(/более новой версией игры/)
    expect(() => slots.read('1')).toThrow(SaveVersionError)
  })

  it('битый слот не мешает читать соседние', () => {
    const { storage, slots } = storageWith()
    storage.setItem(`${STORAGE_PREFIX}1`, '{')
    slots.write('2', createSave(worldAt(SECOND_WEEK), SAVED_AT))

    const list = slots.list()
    expect(list.find((slot) => slot.id === '1')?.problem).not.toBeNull()
    expect(list.find((slot) => slot.id === '2')?.problem).toBeNull()
    expect(list.find((slot) => slot.id === '2')?.meta?.day).toBe(9)
  })
})

describe('SaveStorage: отказавшее хранилище', () => {
  /** Хранилище, в которое нельзя писать: переполнено или запрещено политикой. */
  const readOnly: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('запрещено')
    },
  }

  it('переполненное хранилище не роняет игру, а объясняет отказ', () => {
    const slots = new SaveStorage(readOnly)
    const result = slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/QuotaExceededError/)
  })

  it('несработавшее стирание тоже не роняет игру', () => {
    expect(() => new SaveStorage(readOnly).remove('1')).not.toThrow()
  })

  it('хранилище, падающее на чтении, считается пустым', () => {
    const slots = new SaveStorage({
      getItem: () => {
        throw new Error('доступ запрещён')
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    expect(slots.has('1')).toBe(false)
    expect(slots.describe('1').meta).toBeNull()
  })
})

describe('SaveStorage: хранилище браузера', () => {
  /** Подставляет globalThis.localStorage на время одной проверки. */
  function withLocalStorage(fake: StorageLike | undefined, check: () => void): void {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })
    try {
      check()
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  }

  it('находит рабочее хранилище браузера', () => {
    const fake = new MemoryStorage()
    withLocalStorage(fake, () => {
      expect(browserStorage()).toBe(fake)
      // Проба не оставляет за собой мусора.
      expect(fake.getItem(`${STORAGE_PREFIX}probe`)).toBeNull()
    })
  })

  it('не берёт хранилище, в которое нельзя писать', () => {
    withLocalStorage({ getItem: () => null, setItem: () => { throw new Error('нельзя') }, removeItem: () => undefined }, () => {
      expect(browserStorage()).toBeNull()
    })
  })

  it('без браузера обходится без ошибки', () => {
    withLocalStorage(undefined, () => {
      expect(browserStorage()).toBeNull()
    })
  })
})

describe('SaveStorage: автосохранение', () => {
  it('срабатывает на смене игрового дня', () => {
    expect(shouldAutoSave(0, 1)).toBe(true)
    expect(shouldAutoSave(5, 6)).toBe(true)
  })

  it('не срабатывает внутри одного дня', () => {
    expect(shouldAutoSave(3, 3)).toBe(false)
  })

  it('не срабатывает на первом же кадре после открытия игры', () => {
    // Иначе открытая и тут же закрытая вкладка затирала бы автосохранение
    // прошлой партии состоянием первого утра.
    expect(shouldAutoSave(null, 0)).toBe(false)
    expect(shouldAutoSave(null, 9)).toBe(false)
  })

  it('пишет мир в свой слот на смене дня', () => {
    const { slots } = storageWith()
    const world = worldAt(SECOND_WEEK)

    expect(autoSave(slots, world, 8, 9, SAVED_AT)).toBe(true)
    expect(slots.read(AUTO_SLOT)?.meta.day).toBe(9)
    expect(slots.describe(AUTO_SLOT).progressLabel).toBe('Неделя 2, среда, 14:20')
  })

  it('внутри дня и на первом кадре ничего не пишет', () => {
    const { slots } = storageWith()
    const world = worldAt(SECOND_WEEK)

    expect(autoSave(slots, world, 9, 9, SAVED_AT)).toBe(false)
    expect(autoSave(slots, world, null, 9, SAVED_AT)).toBe(false)
    expect(slots.has(AUTO_SLOT)).toBe(false)
  })

  it('пишет только в свой слот: ручные не трогает', () => {
    const { slots } = storageWith()
    slots.write('1', createSave(worldAt(MONDAY_MORNING), SAVED_AT))

    autoSave(slots, worldAt(SECOND_WEEK), 8, 9, SAVED_AT)
    expect(slots.read('1')?.meta.day).toBe(0)
    expect(slots.read(AUTO_SLOT)?.meta.day).toBe(9)
  })

  it('без хранилища молча не сохраняется', () => {
    expect(autoSave(null, worldAt(SECOND_WEEK), 8, 9, SAVED_AT)).toBe(false)
  })
})

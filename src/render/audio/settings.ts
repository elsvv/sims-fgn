import { browserStorage, type StorageLike } from '../save/SaveStorage'

/**
 * Настройки звука.
 *
 * Хранятся отдельно от сохранений и переживают «начать заново»: человек,
 * убравший звук, сделал это не на одну партию. По той же причине ключ
 * не входит в префикс сохранений — стереть все слоты и остаться без
 * настроек было бы неожиданностью.
 */

/** Шины микшера. Порядок тот же, что в панели звука. */
export type AudioBus = 'music' | 'ambience' | 'sfx' | 'voice'

export const AUDIO_BUSES: readonly AudioBus[] = ['music', 'ambience', 'sfx', 'voice']

/** Подписи шин для панели. */
export const BUS_LABELS: Readonly<Record<AudioBus, string>> = {
  music: 'Музыка',
  ambience: 'Атмосфера',
  sfx: 'Звуки',
  voice: 'Голоса',
}

export type AudioSettings = Readonly<Record<AudioBus, number>> & {
  /** Общий выключатель. Перекрывает все громкости разом. */
  readonly enabled: boolean
}

export const AUDIO_SETTINGS_KEY = 'sims-fgn/audio/v1'

/**
 * Значения по умолчанию.
 *
 * Звук включён, но негромко: игру запускают не ради него, и первое
 * впечатление не должно начинаться с рывка к регулятору громкости
 * системы. Музыка тише атмосферы нарочно — атмосфера здесь несёт место
 * действия, а музыка только настроение, и надоедает она первой.
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  music: 0.4,
  ambience: 0.55,
  sfx: 0.7,
  voice: 0.7,
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Разбор чужих данных: в localStorage может лежать что угодно — мусор
 * от прошлой версии, чужой ключ, обрезанный JSON. Всё, что не число
 * от нуля до единицы, заменяется значением по умолчанию, а не роняет игру.
 */
export function normalizeAudioSettings(value: unknown): AudioSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_AUDIO_SETTINGS
  const raw = value as Record<string, unknown>
  const volume = (bus: AudioBus): number => {
    const item = raw[bus]
    return typeof item === 'number' ? clampVolume(item) : DEFAULT_AUDIO_SETTINGS[bus]
  }
  return {
    // Выключенным звук считается только по явному false: отсутствие поля —
    // это старый формат, а не просьба молчать.
    enabled: raw['enabled'] !== false,
    music: volume('music'),
    ambience: volume('ambience'),
    sfx: volume('sfx'),
    voice: volume('voice'),
  }
}

export function loadAudioSettings(
  storage: StorageLike | null = browserStorage(),
): AudioSettings {
  if (storage === null) return DEFAULT_AUDIO_SETTINGS
  try {
    const raw = storage.getItem(AUDIO_SETTINGS_KEY)
    if (raw === null) return DEFAULT_AUDIO_SETTINGS
    return normalizeAudioSettings(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

/** Пишет настройки. false — записать не вышло, и это не повод ронять игру. */
export function saveAudioSettings(
  settings: AudioSettings,
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (storage === null) return false
  try {
    storage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    // Приватный режим браузера или кончившееся место: настройка
    // не переживёт вкладку, и ладно.
    return false
  }
}

/** Настройки с одной изменённой громкостью. */
export function withVolume(
  settings: AudioSettings,
  bus: AudioBus,
  value: number,
): AudioSettings {
  return { ...settings, [bus]: clampVolume(value) }
}

/**
 * Итоговая громкость шины с учётом выключателя.
 *
 * Выключатель не обнуляет ползунки: включив звук обратно, игрок должен
 * получить ровно то, что настроил, а не ноль на всех шинах.
 */
export function busVolume(settings: AudioSettings, bus: AudioBus): number {
  return settings.enabled ? settings[bus] : 0
}

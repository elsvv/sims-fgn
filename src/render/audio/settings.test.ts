import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../save/SaveStorage'
import {
  AUDIO_BUSES,
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_SETTINGS,
  busVolume,
  clampVolume,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
  withVolume,
} from './settings'

describe('настройки звука', () => {
  it('громкость зажимается в ноль-единицу', () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(2)).toBe(1)
    expect(clampVolume(0.3)).toBe(0.3)
    expect(clampVolume(Number.NaN)).toBe(0)
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('по умолчанию звук включён и негромок', () => {
    expect(DEFAULT_AUDIO_SETTINGS.enabled).toBe(true)
    for (const bus of AUDIO_BUSES) {
      expect(DEFAULT_AUDIO_SETTINGS[bus], bus).toBeGreaterThan(0)
      expect(DEFAULT_AUDIO_SETTINGS[bus], bus).toBeLessThan(0.8)
    }
  })

  it('музыка тише атмосферы', () => {
    // Атмосфера несёт место действия, музыка — только настроение,
    // и надоедает она первой.
    expect(DEFAULT_AUDIO_SETTINGS.music).toBeLessThan(DEFAULT_AUDIO_SETTINGS.ambience)
  })

  it('настройки переживают запись и чтение', () => {
    const storage = new MemoryStorage()
    const settings = { enabled: false, music: 0.1, ambience: 0.2, sfx: 0.3, voice: 0.4 }
    expect(saveAudioSettings(settings, storage)).toBe(true)
    expect(loadAudioSettings(storage)).toEqual(settings)
  })

  it('пустое хранилище даёт настройки по умолчанию', () => {
    expect(loadAudioSettings(new MemoryStorage())).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('без хранилища игра идёт с настройками по умолчанию', () => {
    // Приватный режим браузера: сохранять некуда, но играть можно.
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS)
    expect(saveAudioSettings(DEFAULT_AUDIO_SETTINGS, null)).toBe(false)
  })

  it('мусор в хранилище не роняет игру', () => {
    const storage = new MemoryStorage()
    storage.setItem(AUDIO_SETTINGS_KEY, 'не json')
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('чужие данные разбираются по одному полю', () => {
    expect(normalizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS)
    expect(normalizeAudioSettings(42)).toEqual(DEFAULT_AUDIO_SETTINGS)
    expect(normalizeAudioSettings({ music: 'громко' }).music).toBe(
      DEFAULT_AUDIO_SETTINGS.music,
    )
    expect(normalizeAudioSettings({ music: 5 }).music).toBe(1)
    expect(normalizeAudioSettings({ music: -5 }).music).toBe(0)
  })

  it('старый формат без выключателя считается включённым', () => {
    // Отсутствие поля — это версия настроек, в которой выключателя ещё
    // не было, а не просьба молчать.
    expect(normalizeAudioSettings({ music: 0.5 }).enabled).toBe(true)
    expect(normalizeAudioSettings({ enabled: false }).enabled).toBe(false)
  })

  it('выключатель обнуляет шины, не трогая ползунков', () => {
    const settings = { ...DEFAULT_AUDIO_SETTINGS, enabled: false }
    for (const bus of AUDIO_BUSES) expect(busVolume(settings, bus), bus).toBe(0)
    // Включат обратно — получат ровно то, что настроили.
    expect(busVolume({ ...settings, enabled: true }, 'music')).toBe(
      DEFAULT_AUDIO_SETTINGS.music,
    )
  })

  it('изменение одной громкости не задевает остальных', () => {
    const next = withVolume(DEFAULT_AUDIO_SETTINGS, 'voice', 0.25)
    expect(next.voice).toBe(0.25)
    expect(next.music).toBe(DEFAULT_AUDIO_SETTINGS.music)
    expect(next.enabled).toBe(true)
    expect(withVolume(DEFAULT_AUDIO_SETTINGS, 'voice', 3).voice).toBe(1)
  })
})

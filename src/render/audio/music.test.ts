import { describe, expect, it } from 'vitest'
import { MUSIC_TRACKS } from './catalog'
import {
  DUCK_GAIN,
  IDLE_MUSIC,
  MUSIC_PLAYLISTS,
  MUSIC_REST_SECONDS,
  NIGHT_ENDS_AT,
  NIGHT_STARTS_AT,
  advanceMusic,
  duckFor,
  isNight,
  musicMoodFor,
  type MusicSituation,
  type MusicState,
} from './music'

const NOON: MusicSituation = {
  dayScreen: null,
  dayKind: 'study',
  minutes: 12 * 60,
  inLesson: false,
}

describe('настроение музыки', () => {
  it('обычный день', () => {
    expect(musicMoodFor(NOON)).toBe('day')
    expect(musicMoodFor({ ...NOON, dayKind: 'weekend' })).toBe('day')
  })

  it('на своей паре играет музыка пары', () => {
    expect(musicMoodFor({ ...NOON, inLesson: true })).toBe('lesson')
  })

  it('пара, идущая без игрока, музыку не меняет', () => {
    // inLesson означает «сидит в той самой аудитории», а не «идёт пара».
    expect(musicMoodFor({ ...NOON, inLesson: false })).toBe('day')
  })

  it('в сессию играет сессия', () => {
    expect(musicMoodFor({ ...NOON, dayKind: 'session' })).toBe('session')
  })

  it('ночь сильнее сессии', () => {
    // В четыре утра над конспектом играет ночь: играющему сейчас четыре утра.
    expect(musicMoodFor({ ...NOON, dayKind: 'session', minutes: 4 * 60 })).toBe('night')
  })

  it('эпилог сильнее всего', () => {
    expect(
      musicMoodFor({ ...NOON, dayScreen: 'epilogue', minutes: 2 * 60, inLesson: true }),
    ).toBe('epilogue')
  })

  it('итоги дня и воскресенье играют по времени суток', () => {
    // Эти экраны — часть дня, а не конец истории.
    expect(musicMoodFor({ ...NOON, dayScreen: 'summary' })).toBe('day')
    expect(musicMoodFor({ ...NOON, dayScreen: 'weekend', minutes: 23 * 60 })).toBe('night')
  })

  it('ночь считается от вечера до утра через полночь', () => {
    expect(isNight(NIGHT_STARTS_AT)).toBe(true)
    expect(isNight(NIGHT_STARTS_AT - 1)).toBe(false)
    expect(isNight(0)).toBe(true)
    expect(isNight(NIGHT_ENDS_AT)).toBe(false)
    expect(isNight(NIGHT_ENDS_AT - 1)).toBe(true)
  })
})

describe('чередование треков и паузы', () => {
  it('без настроения ничего не играет', () => {
    expect(advanceMusic(IDLE_MUSIC, null, 0)).toEqual(IDLE_MUSIC)
  })

  it('первый трек настроения начинается сразу', () => {
    const state = advanceMusic(IDLE_MUSIC, 'day', 10)
    expect(state.trackId).toBe('day')
    expect(state.endsAt).toBe(10 + MUSIC_TRACKS.day!.seconds)
  })

  it('пока трек идёт, состояние не меняется', () => {
    const started = advanceMusic(IDLE_MUSIC, 'day', 0)
    expect(advanceMusic(started, 'day', 5)).toBe(started)
  })

  it('после трека наступает пауза, а не следующий трек', () => {
    // Музыка, играющая без перерыва, за час превращается в шум,
    // который первым делом выключают.
    const started = advanceMusic(IDLE_MUSIC, 'day', 0)
    const resting = advanceMusic(started, 'day', started.endsAt)
    expect(resting.trackId).toBeNull()
    expect(resting.quietUntil).toBe(started.endsAt + MUSIC_REST_SECONDS.day)
  })

  it('после паузы идёт следующий трек по кругу', () => {
    let state: MusicState = advanceMusic(IDLE_MUSIC, 'day', 0)
    expect(state.trackId).toBe('day')
    state = advanceMusic(state, 'day', state.endsAt)
    state = advanceMusic(state, 'day', state.quietUntil)
    expect(state.trackId).toBe('lounge')
    state = advanceMusic(state, 'day', state.endsAt)
    state = advanceMusic(state, 'day', state.quietUntil)
    expect(state.trackId).toBe('day')
  })

  it('в паузе тишина не обрывается раньше срока', () => {
    const started = advanceMusic(IDLE_MUSIC, 'day', 0)
    const resting = advanceMusic(started, 'day', started.endsAt)
    expect(advanceMusic(resting, 'day', resting.quietUntil - 1)).toBe(resting)
  })

  it('смена настроения не досиживает паузу', () => {
    const started = advanceMusic(IDLE_MUSIC, 'day', 0)
    const resting = advanceMusic(started, 'day', started.endsAt)
    const lesson = advanceMusic(resting, 'lesson', resting.endsAt + 1)
    expect(lesson.trackId).toBe('lesson')
    expect(lesson.mood).toBe('lesson')
  })

  it('возврат к прежнему настроению начинается с его первого трека', () => {
    let state = advanceMusic(IDLE_MUSIC, 'day', 0)
    state = advanceMusic(state, 'lesson', 10)
    state = advanceMusic(state, 'day', 20)
    expect(state.trackId).toBe('day')
  })

  it('настроение, пропавшее совсем, останавливает музыку', () => {
    const started = advanceMusic(IDLE_MUSIC, 'day', 0)
    expect(advanceMusic(started, null, 5)).toEqual(IDLE_MUSIC)
  })

  it('пауза на паре длиннее самого трека', () => {
    // На паре читают текст и слушают преподавателя: там музыка мешает
    // сильнее всего.
    const track = MUSIC_PLAYLISTS.lesson[0]
    expect(track).toBeDefined()
    if (track === undefined) return
    expect(MUSIC_REST_SECONDS.lesson).toBeGreaterThan(MUSIC_TRACKS[track]!.seconds)
  })

  it('в эпилоге пауза почти незаметна', () => {
    expect(MUSIC_REST_SECONDS.epilogue).toBeLessThan(15)
  })
})

describe('приглушение фона', () => {
  it('под разговор фон уходит назад, но не в тишину', () => {
    expect(duckFor(true)).toBe(DUCK_GAIN)
    expect(DUCK_GAIN).toBeGreaterThan(0)
    expect(DUCK_GAIN).toBeLessThan(1)
  })

  it('без разговора фон звучит как настроен', () => {
    expect(duckFor(false)).toBe(1)
  })
})

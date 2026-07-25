import type { DayKind } from '../../sim/study/Calendar'
import { MUSIC_TRACKS, type MusicMood } from './catalog'

/**
 * Что играет и когда молчит.
 *
 * Две отдельные задачи, обе — чистые функции:
 *
 * 1. `musicMoodFor` — по обстоятельствам выбирает настроение.
 * 2. `advanceMusic` — по настроению и времени решает, какой трек сейчас
 *    звучит, а когда положено помолчать.
 *
 * Вторая существует ради одного требования: музыка не должна надоедать.
 * Трек, зациклённый без пауз, за час игры превращается в шум, который
 * первым делом выключают. Поэтому треки внутри настроения чередуются,
 * а между повторами стоит тишина, длина которой — свойство настроения:
 * на паре она полторы минуты, в эпилоге — восемь секунд.
 */

/** Начало и конец ночи, минуты с полуночи. */
export const NIGHT_STARTS_AT = 22 * 60
export const NIGHT_ENDS_AT = 7 * 60

export function isNight(minutes: number): boolean {
  return minutes >= NIGHT_STARTS_AT || minutes < NIGHT_ENDS_AT
}

/** Обстоятельства, от которых зависит настроение музыки. */
export interface MusicSituation {
  /** Экран, прервавший игру: итоги дня, воскресенье, эпилог. */
  readonly dayScreen: 'summary' | 'weekend' | 'epilogue' | null
  readonly dayKind: DayKind
  /** Минуты с полуночи. */
  readonly minutes: number
  /** Игрок сидит на своей паре. */
  readonly inLesson: boolean
}

/**
 * Настроение музыки.
 *
 * Порядок правил и есть содержание функции:
 *   1. Эпилог сильнее всего остального — это конец истории, и время
 *      суток к нему отношения не имеет.
 *   2. Ночь сильнее сессии: в четыре утра над конспектом играет ночь,
 *      а не сессия, потому что играющему сейчас четыре утра.
 *   3. Пара сильнее обычного дня — но только если игрок на ней сидит.
 *      Пара, идущая где-то без него, музыку менять не вправе.
 */
export function musicMoodFor(situation: MusicSituation): MusicMood {
  if (situation.dayScreen === 'epilogue') return 'epilogue'
  if (isNight(situation.minutes)) return 'night'
  if (situation.inLesson) return 'lesson'
  if (situation.dayKind === 'session') return 'session'
  return 'day'
}

/**
 * Треки настроения по кругу.
 *
 * У обычного дня их два: это самое долгое настроение в игре, и одного
 * трека на него не хватает. У остальных по одному — их слушают редко
 * и коротко.
 */
export const MUSIC_PLAYLISTS: Readonly<Record<MusicMood, readonly string[]>> = {
  day: ['day', 'lounge'],
  lesson: ['lesson'],
  session: ['session'],
  night: ['night'],
  epilogue: ['epilogue'],
}

/** Сколько секунд тишины между повторами. */
export const MUSIC_REST_SECONDS: Readonly<Record<MusicMood, number>> = {
  // Обычный день: пауза примерно вполовину короче трека — музыка
  // остаётся фоном, а не занавесом.
  day: 55,
  // На паре музыка мешает больше всего: там читают текст на экране
  // и слушают преподавателя, поэтому пауза длиннее самого трека.
  lesson: 90,
  session: 45,
  night: 40,
  // Эпилог читают под музыку целиком: тишина посреди концовки —
  // это ощущение, что игра сломалась.
  epilogue: 8,
}

/** Что звучит прямо сейчас и что будет дальше. */
export interface MusicState {
  readonly mood: MusicMood | null
  /** Трек, который должен звучать. null — пауза между повторами. */
  readonly trackId: string | null
  /** Когда трек кончится, секунды звукового контекста. */
  readonly endsAt: number
  /** До какого момента тишина. */
  readonly quietUntil: number
  /** Сколько треков настроения уже начато: по этому счётчику берётся следующий. */
  readonly played: number
}

export const IDLE_MUSIC: MusicState = {
  mood: null,
  trackId: null,
  endsAt: 0,
  quietUntil: 0,
  played: 0,
}

function startTrack(mood: MusicMood, played: number, now: number): MusicState {
  const playlist = MUSIC_PLAYLISTS[mood]
  const id = playlist[played % playlist.length] ?? playlist[0]
  const track = id === undefined ? undefined : MUSIC_TRACKS[id]
  if (track === undefined) return { ...IDLE_MUSIC, mood }
  return {
    mood,
    trackId: track.id,
    endsAt: now + track.seconds,
    quietUntil: 0,
    played: played + 1,
  }
}

/**
 * Следующее состояние музыки.
 *
 * Зовётся часто и обязано быть дешёвым и устойчивым: одно и то же
 * состояние при том же времени возвращается тем же объектом по значению,
 * поэтому микшер, сравнив идентификаторы, ничего не делает.
 *
 * @param now время звукового контекста в секундах.
 */
export function advanceMusic(
  state: MusicState,
  mood: MusicMood | null,
  now: number,
): MusicState {
  if (mood === null) return state.mood === null ? state : IDLE_MUSIC

  // Настроение переменилось — новый трек начинается сразу. Досиживать
  // паузу нельзя: смена настроения это событие, и тишина в ответ на него
  // читается как поломка.
  if (mood !== state.mood) return startTrack(mood, 0, now)

  if (state.trackId !== null) {
    if (now < state.endsAt) return state
    return { ...state, trackId: null, endsAt: 0, quietUntil: now + MUSIC_REST_SECONDS[mood] }
  }

  if (now < state.quietUntil) return state
  return startTrack(mood, state.played, now)
}

/**
 * Насколько приглушить музыку и атмосферу.
 *
 * Пока на экране разговор, фон уходит назад: реплики озвучены голосом,
 * и голос должен быть слышен. Возвращается множитель, а не новая
 * громкость, — настройки игрока при этом остаются нетронутыми.
 */
export const DUCK_GAIN = 0.45

export function duckFor(inConversation: boolean): number {
  return inConversation ? DUCK_GAIN : 1
}

/**
 * Каталог звука: что чем озвучено и насколько громко.
 *
 * Данные, а не логика. Пути ведут в public/audio/, откуда игра их и берёт;
 * файлы туда кладёт tools/build-audio.mjs, лицензии — public/audio/LICENSE.md.
 *
 * Коэффициенты `gain` — это замысел, а не поправка на чужой микрофон:
 * записи уже выровнены по громкости при сборке, поэтому «0.35» здесь
 * читается как «шаги должны быть вдвое тише щелчка автомата», а не как
 * «эту запись писали слишком близко».
 */

/** Настроение музыки. Определяется обстоятельствами, см. music.ts. */
export type MusicMood = 'day' | 'lesson' | 'session' | 'night' | 'epilogue'

/** Слой атмосферы. Определяется помещением, см. ambience.ts. */
export type AmbienceId =
  | 'corridor'
  | 'corridor-busy'
  | 'lecture'
  | 'lecture-class'
  | 'toilet'
  | 'elevator-hall'

/** Разовые звуки, которые лежат файлами. */
export type SampleId =
  | 'step-1'
  | 'step-2'
  | 'step-3'
  | 'coffee'
  | 'flush'
  | 'tap'
  | 'elevator-doors'
  | 'elevator-ding'
  | 'chair'
  | 'page'
  | 'paper'
  | 'pen'

/**
 * Разовые звуки, которых нет файлами.
 *
 * Разведка (research/assets-audio.md, §2.1) разложила это по одному
 * правилу: чистые тоны и щелчки дешевле синтезировать, узнаваемые
 * предметные события — записать. Звонок, интерфейсный щелчок, стук
 * автомата и две оценки — по эту сторону границы; см. synth.ts.
 */
export type SynthId = 'click' | 'bell' | 'clunk' | 'attention' | 'grade-good' | 'grade-bad'

export type SoundId = SampleId | SynthId

export interface MusicTrack {
  readonly id: string
  readonly src: string
  readonly gain: number
  /**
   * Длина в секундах. Замерена при сборке (tools/build-audio.mjs печатает
   * её в отчёте) и лежит здесь, потому что по ней планируется пауза перед
   * следующим повтором, — а спрашивать длину у <audio> значит ждать
   * загрузки метаданных и строить расписание на «когда-нибудь».
   */
  readonly seconds: number
}

export const MUSIC_TRACKS: Readonly<Record<string, MusicTrack>> = {
  day: { id: 'day', src: '/audio/music/day.mp3', gain: 1, seconds: 165 },
  lounge: { id: 'lounge', src: '/audio/music/lounge.mp3', gain: 0.9, seconds: 60 },
  lesson: { id: 'lesson', src: '/audio/music/lesson.mp3', gain: 0.75, seconds: 45 },
  session: { id: 'session', src: '/audio/music/session.mp3', gain: 0.95, seconds: 235 },
  night: { id: 'night', src: '/audio/music/night.mp3', gain: 0.85, seconds: 124 },
  epilogue: { id: 'epilogue', src: '/audio/music/epilogue.mp3', gain: 1, seconds: 132 },
}

export interface AmbienceLayer {
  readonly id: AmbienceId
  readonly src: string
  readonly gain: number
}

/**
 * Громкости слоёв отражают помещения, а не записи. В аудитории между
 * парами тише всего — это единственное место этажа, где можно побыть
 * одному. Лифтовый холл громче коридора: там работает механизм.
 */
export const AMBIENCE_LAYERS: Readonly<Record<AmbienceId, AmbienceLayer>> = {
  corridor: { id: 'corridor', src: '/audio/ambience/corridor.mp3', gain: 0.7 },
  'corridor-busy': { id: 'corridor-busy', src: '/audio/ambience/corridor-busy.mp3', gain: 0.85 },
  lecture: { id: 'lecture', src: '/audio/ambience/lecture.mp3', gain: 0.5 },
  'lecture-class': { id: 'lecture-class', src: '/audio/ambience/lecture-class.mp3', gain: 0.65 },
  toilet: { id: 'toilet', src: '/audio/ambience/toilet.mp3', gain: 0.6 },
  'elevator-hall': { id: 'elevator-hall', src: '/audio/ambience/elevator-hall.mp3', gain: 0.8 },
}

export interface SoundDef {
  /** Путь к файлу либо null — тогда звук синтезируется. */
  readonly src: string | null
  readonly gain: number
}

export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = {
  // Шаг звучит десятки раз в минуту, поэтому он тише всего в игре:
  // на разовом прослушивании такой звук кажется слишком тихим, а через
  // пять минут ходьбы по коридору — единственным терпимым.
  'step-1': { src: '/audio/sfx/step-1.mp3', gain: 0.3 },
  'step-2': { src: '/audio/sfx/step-2.mp3', gain: 0.3 },
  'step-3': { src: '/audio/sfx/step-3.mp3', gain: 0.3 },

  coffee: { src: '/audio/sfx/coffee.mp3', gain: 0.75 },
  flush: { src: '/audio/sfx/flush.mp3', gain: 0.6 },
  tap: { src: '/audio/sfx/tap.mp3', gain: 0.55 },
  'elevator-doors': { src: '/audio/sfx/elevator-doors.mp3', gain: 0.7 },
  'elevator-ding': { src: '/audio/sfx/elevator-ding.mp3', gain: 0.65 },
  chair: { src: '/audio/sfx/chair.mp3', gain: 0.5 },
  page: { src: '/audio/sfx/page.mp3', gain: 0.5 },
  paper: { src: '/audio/sfx/paper.mp3', gain: 0.45 },
  pen: { src: '/audio/sfx/pen.mp3', gain: 0.4 },

  click: { src: null, gain: 0.35 },
  bell: { src: null, gain: 0.5 },
  clunk: { src: null, gain: 0.55 },
  attention: { src: null, gain: 0.45 },
  'grade-good': { src: null, gain: 0.5 },
  'grade-bad': { src: null, gain: 0.5 },
}

/** Три записи одного и того же шага: ходьба не должна звучать метрономом. */
export const STEP_SOUNDS: readonly SampleId[] = ['step-1', 'step-2', 'step-3']

export const SYNTH_IDS: readonly SynthId[] = [
  'click',
  'bell',
  'clunk',
  'attention',
  'grade-good',
  'grade-bad',
]

/**
 * Синтезируется ли этот звук.
 *
 * Список выше и `src: null` в каталоге — два описания одного и того же
 * факта, и разъехаться они не имеют права: звук, объявленный
 * синтезированным, но с файлом, просто не зазвучит. Совпадение сторожит
 * catalog.test.ts.
 */
export function isSynth(id: SoundId): id is SynthId {
  return (SYNTH_IDS as readonly SoundId[]).includes(id)
}

/** Чей голос взят за основу вокализа. */
export type VoiceBank = 'marey' | 'alieva'

/** Интонация вокализа. Ровно то, что отрендерено в public/audio/voice. */
export type VoiceEmotion = 'statement' | 'question' | 'cheerful' | 'displeased'

export function voiceSrc(bank: VoiceBank, emotion: VoiceEmotion): string {
  return `/audio/voice/${bank}-${emotion}.mp3`
}

export const VOICE_BANKS: readonly VoiceBank[] = ['marey', 'alieva']
export const VOICE_EMOTIONS: readonly VoiceEmotion[] = [
  'statement',
  'question',
  'cheerful',
  'displeased',
]

/** Все восемь вокализов: их тянут разом, вместе они весят 170 КБ. */
export function allVoiceSrc(): readonly string[] {
  return VOICE_BANKS.flatMap((bank) => VOICE_EMOTIONS.map((emotion) => voiceSrc(bank, emotion)))
}

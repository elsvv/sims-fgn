import type { Vec2 } from '../../sim/types'
import type { SoundId } from './catalog'
import { seedFrom, syllablesForText } from './phrase'
import { isVoiceId, type VoiceEmotion, type VoiceId } from './voices'

/**
 * Что в мире случилось такого, что должно быть слышно.
 *
 * Симуляция про звук не знает и знать не должна: она сообщает, что
 * происходит, а слышимым это делает слой представления. Поэтому здесь
 * нет ни одного вызова в sim — только разбор двух снятых подряд кадров
 * состояния. Кадр (`AudioFrame`) собирается в useGameAudio.ts из снимка
 * мира; в этом файле он уже просто данные, и потому всё проверяется
 * тестом без мира, без React и без браузера.
 */

/** Тон реплики: то, что слышно поверх слов. */
export type LineTone = 'plain' | 'warm' | 'cold'

/** Реплика, показанная на экране. */
export interface AudioLine {
  /** Отличает одну реплику от другой: узел плюс чья очередь говорить. */
  readonly key: string
  /** Кто говорит: идентификатор преподавателя. */
  readonly speakerId: string
  readonly text: string
  readonly tone: LineTone
}

/** Действие с предметом. */
export interface AudioInteraction {
  /** Предмет плюс действие: два разных кофе подряд — два разных ключа. */
  readonly key: string
  readonly interactionId: string
  /** Где стоит предмет, в метрах мира. */
  readonly at: Vec2
  /** Персонаж дошёл и делает. Пока он идёт — ещё нет. */
  readonly working: boolean
}

/** Выступление на семинаре и то, чем преподаватель на него ответил. */
export interface AudioSpeech {
  /** Ключ пары с вариантом: два выступления подряд — два разных ключа. */
  readonly key: string
  readonly success: boolean
  /** Кто отвечает. null — отвечать некому, преподавателя нет. */
  readonly teacherId: string | null
  /** Реплика преподавателя: по ней считается длина вокализа. */
  readonly reply: string | null
  /** Где он стоит. */
  readonly at: Vec2 | null
}

/** Преподаватель, ближе которого рядом никого нет. */
export interface AudioNeighbour {
  readonly id: string
  readonly at: Vec2
  /** Расстояние до игрока, метры. */
  readonly distance: number
  /** Хорошие ли отношения: от этого зависит, как он здоровается. */
  readonly warm: boolean
}

/** Состояние мира глазами звука. Всё, что нужно, и ничего сверх. */
export interface AudioFrame {
  readonly playerAt: Vec2
  readonly moving: boolean
  /**
   * Пара, идущая по расписанию прямо сейчас: «greek|А-204».
   * null — сейчас пар нет. Считается по расписанию, а не по тому, где
   * стоит игрок: звонок слышен всему этажу, в том числе прогульщику.
   */
  readonly lessonKey: string | null
  readonly interaction: AudioInteraction | null
  /** Выступление на семинаре: ключ пары с вариантом и чем оно кончилось. */
  readonly speech: AudioSpeech | null
  readonly line: AudioLine | null
  /** Ближайший преподаватель. null — рядом никого. */
  readonly neighbour: AudioNeighbour | null
}

/** Разовый звук, который надо издать. */
export interface SoundCue {
  readonly id: SoundId
  /** Где это случилось. null — звук без места: звонок, оценка, интерфейс. */
  readonly at: Vec2 | null
  /** Задержка перед запуском, секунды. Ею выстраиваются пары звуков. */
  readonly delay: number
}

/**
 * Вокализ: всё, что нужно синтезатору, и ничего про Web Audio.
 *
 * Здесь нет ни громкости голоса, ни его высоты: они лежат в пресете
 * человека (voices.ts) и достаются по `voiceId`. Событие сообщает,
 * кто говорит, с какой интонацией и как долго, — остальное дело синтеза.
 */
export interface VoiceCue {
  readonly voiceId: VoiceId
  readonly emotion: VoiceEmotion
  /** Сколько слогов бормотать. Считается по длине реплики. */
  readonly syllables: number
  /** Зерно: одна реплика всегда звучит одинаково, разные — по-разному. */
  readonly seed: number
  /** Где стоит говорящий. null — звук без места, слышен в полную силу. */
  readonly at: Vec2 | null
  /** Задержка перед началом, секунды. */
  readonly delay: number
  /**
   * Можно ли перебить того, кто уже говорит.
   *
   * Реплика разговора перебивает: игрок читает её прямо сейчас, и она
   * важнее всего, что звучало до неё. Приветствие — нет: на быстрой
   * промотке преподаватели носятся по этажу, и здоровающиеся наперебой
   * шестеро дали бы не жизнь, а заикание.
   */
  readonly interrupts: boolean
}

export interface AudioEvents {
  readonly cues: readonly SoundCue[]
  readonly voice: VoiceCue | null
}

const NOTHING: AudioEvents = { cues: [], voice: null }

/**
 * Чем озвучено каждое действие каталога предметов.
 *
 * Ключ — идентификатор действия из src/content/props/propCatalog.ts.
 * Действия, которых здесь нет, беззвучны нарочно: «посидеть на скамейке»
 * и «поболтать с однокурсниками» не издают ничего такого, что стоило бы
 * отдельного звука, а звук ради галочки хуже тишины.
 */
const INTERACTION_SOUNDS: Readonly<Record<string, readonly (readonly [SoundId, number])[]>> = {
  drinkCoffee: [['coffee', 0]],
  buySnack: [['clunk', 0]],
  vendingLunch: [['clunk', 0]],
  drinkWater: [['tap', 0]],
  relieve: [['flush', 0]],
  washUp: [['tap', 0]],
  // Лифт: сначала приезжает и звенит, потом открывает двери. Полсекунды
  // между тем и другим — это и есть «лифт приехал», без них два звука
  // сливаются в один невнятный.
  waitForElevator: [
    ['elevator-ding', 0],
    ['elevator-doors', 0.55],
  ],
  takeSeat: [['chair', 0]],
  sitAndListen: [['chair', 0]],
  readBoard: [['paper', 0]],
  readNotices: [['paper', 0]],
  readBeforeClass: [['page', 0]],
  readGermanClassics: [['page', 0]],
  writeEssay: [['pen', 0]],
  translateGreek: [['pen', 0]],
  solveLogicProblems: [['pen', 0]],
  scrollPhone: [['click', 0]],
}

/** Через сколько секунд после гонга объявляется оценка. */
const GRADE_DELAY = 0.9

/**
 * Интонация по тексту реплики.
 *
 * Тон разговора сильнее знаков препинания: «И где ваш перевод?» —
 * это не вопрос, это выговор, и звучать оно должно недовольством.
 * Дальше вопросительный знак, дальше восклицательный, и только потом
 * ровное утверждение.
 *
 * Хвост реплики может кончаться кавычкой или многоточием, поэтому
 * смотрится не последний символ, а последний знак препинания.
 */
export function voiceEmotionFor(line: Pick<AudioLine, 'text' | 'tone'>): VoiceEmotion {
  if (line.tone === 'cold') return 'displeased'
  const text = line.text.trim()
  if (/\?[)»"'!.…\s]*$/u.test(text)) return 'question'
  if (line.tone === 'warm') return 'cheerful'
  if (/![)»"'.…\s]*$/u.test(text)) return 'cheerful'
  return 'statement'
}

/**
 * Расстояние, ближе которого преподаватель здоровается, метры.
 *
 * Полтора корпуса: столько между людьми, когда один подошёл к другому,
 * а не прошёл мимо.
 */
export const GREETING_ENTER = 2.5

/**
 * Расстояние, дальше которого встреча считается законченной, метры.
 *
 * Второй порог нужен ровно затем, чтобы игрок, топчущийся ровно на
 * границе первого, не выслушивал «здравствуйте» десять раз в секунду.
 * Поздороваются снова только после того, как он отойдёт по-настоящему.
 */
export const GREETING_LEAVE = 4.5

/** Приветствие короткое: два-три слога, а не речь. */
export const GREETING_SYLLABLES = 3

/** Через сколько секунд после оценки отвечает преподаватель. */
const REACTION_DELAY = GRADE_DELAY + 0.55

function cue(id: SoundId, at: Vec2 | null, delay = 0): SoundCue {
  return { id, at, delay }
}

/**
 * Что стало слышно между двумя кадрами.
 *
 * На первом кадре (`previous === null`) не срабатывает ничего. Загрузка
 * игры — это не событие мира: сохранение, снятое посреди пары, иначе
 * встречало бы игрока звонком, которого никто не давал.
 */
export function detectAudioEvents(
  previous: AudioFrame | null,
  current: AudioFrame,
): AudioEvents {
  if (previous === null) return NOTHING

  const cues: SoundCue[] = []

  // Звонок с пары. Места у него нет: он звенит на весь этаж.
  if (current.lessonKey !== null && current.lessonKey !== previous.lessonKey) {
    cues.push(cue('bell', null))
  }

  // Действие с предметом озвучивается в тот миг, когда персонаж до него
  // дошёл, а не когда игрок ткнул в меню: между тем и другим он идёт
  // через весь коридор, и смыв в начале пути звучал бы пророчеством.
  const now = current.interaction
  const before = previous.interaction
  const started = now !== null && now.working && !(before?.working === true && before.key === now.key)
  if (started && now !== null) {
    for (const [id, delay] of INTERACTION_SOUNDS[now.interactionId] ?? []) {
      cues.push(cue(id, now.at, delay))
    }
  }

  // Выступление на семинаре: сначала гонг, через секунду — оценка.
  const speech = current.speech
  if (speech !== null && speech.key !== previous.speech?.key) {
    cues.push(cue('attention', null))
    cues.push(cue(speech.success ? 'grade-good' : 'grade-bad', null, GRADE_DELAY))
  }

  const voice = voiceOf(previous, current)
  return cues.length === 0 && voice === null ? NOTHING : { cues, voice }
}

/**
 * Кто из троих говорит.
 *
 * Голос в игре один и перебивать сам себя не имеет права, поэтому из
 * трёх поводов заговорить выбирается ровно один. Порядок не случаен:
 * реплика на экране важнее всего — её игрок читает прямо сейчас;
 * ответ на семинаре важнее приветствия; приветствие уступает всему.
 */
function voiceOf(previous: AudioFrame, current: AudioFrame): VoiceCue | null {
  return (
    lineVoice(previous.line, current.line) ??
    speechVoice(previous.speech, current.speech) ??
    greetingVoice(previous.neighbour, current.neighbour)
  )
}

/** Вокализ под новую реплику. Та же реплика второй раз не озвучивается. */
function lineVoice(previous: AudioLine | null, current: AudioLine | null): VoiceCue | null {
  if (current === null || current.key === previous?.key) return null
  if (!isVoiceId(current.speakerId)) return null
  const syllables = syllablesForText(current.text)
  if (syllables === 0) return null
  return {
    voiceId: current.speakerId,
    emotion: voiceEmotionFor(current),
    syllables,
    // Зерно от ключа и текста сразу: ключ разводит одинаковые реплики
    // разных узлов, текст — одинаковые узлы с разным текстом.
    seed: seedFrom(`${current.speakerId}|${current.key}|${current.text}`),
    at: null,
    delay: 0,
    interrupts: true,
  }
}

/**
 * Реакция преподавателя на выступление.
 *
 * Звучит не сразу: сначала гонг, потом оценка, и только потом человек
 * открывает рот. Одновременно с оценкой это читалось бы как одно
 * событие, а не как «сказал — выслушали — ответили».
 */
function speechVoice(previous: AudioSpeech | null, current: AudioSpeech | null): VoiceCue | null {
  if (current === null || current.key === previous?.key) return null
  const teacher = current.teacherId
  if (teacher === null || !isVoiceId(teacher) || current.reply === null) return null
  const syllables = syllablesForText(current.reply)
  if (syllables === 0) return null
  return {
    voiceId: teacher,
    // Похвала или выговор — это и есть эмоция, гадать по знакам
    // препинания здесь незачем: результат известен точно.
    emotion: current.success ? 'cheerful' : 'displeased',
    syllables,
    seed: seedFrom(`${teacher}|${current.key}|${current.reply}`),
    at: current.at,
    delay: REACTION_DELAY,
    interrupts: true,
  }
}

/**
 * Приветствие при подходе.
 *
 * Здоровается тот, к кому подошли, и здоровается один раз за встречу.
 * Тёплое приветствие достаётся не всем: преподаватель, который вас
 * знает и к вам расположен, звучит иначе, чем тот, кому вы пока никто.
 */
function greetingVoice(
  previous: AudioNeighbour | null,
  current: AudioNeighbour | null,
): VoiceCue | null {
  if (current === null || current.distance > GREETING_ENTER) return null
  if (!isVoiceId(current.id)) return null
  const met = previous !== null && previous.id === current.id && previous.distance <= GREETING_LEAVE
  if (met) return null
  return {
    voiceId: current.id,
    emotion: current.warm ? 'cheerful' : 'statement',
    syllables: GREETING_SYLLABLES,
    // Человек здоровается всегда одинаково — но по-разному в зависимости
    // от того, рад он вам или просто вежлив.
    seed: seedFrom(`привет|${current.id}|${current.warm ? 'тепло' : 'ровно'}`),
    at: current.at,
    delay: 0,
    interrupts: false,
  }
}

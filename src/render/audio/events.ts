import type { Vec2 } from '../../sim/types'
import type { SoundId, VoiceBank, VoiceEmotion } from './catalog'

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
  readonly speech: { readonly key: string; readonly success: boolean } | null
  readonly line: AudioLine | null
}

/** Разовый звук, который надо издать. */
export interface SoundCue {
  readonly id: SoundId
  /** Где это случилось. null — звук без места: звонок, оценка, интерфейс. */
  readonly at: Vec2 | null
  /** Задержка перед запуском, секунды. Ею выстраиваются пары звуков. */
  readonly delay: number
}

/** Вокализ под реплику. */
export interface VoiceCue {
  readonly bank: VoiceBank
  readonly emotion: VoiceEmotion
  /** Скорость воспроизведения: она же высота голоса. */
  readonly rate: number
  readonly gain: number
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
 * Кто каким голосом говорит.
 *
 * Записанных вокализов два: мужской (Марей) и женский (Алиева).
 * Остальные говорят теми же записями, но с другой скоростью — она тянет
 * за собой и высоту тона, поэтому одного числа хватает, чтобы Долгоруков
 * не звучал Мареем. За пределами 0.85–1.25 симлиш перестаёт звучать
 * по-человечески и становится бурундуком или трактором.
 *
 * Поправка громкости — оттуда же: сдвинутый по высоте голос слышно
 * иначе, чем исходный, и без неё быстрые голоса лезут вперёд.
 */
export interface VoiceProfile {
  readonly bank: VoiceBank
  readonly rate: number
  readonly gain: number
}

export const VOICES: Readonly<Record<string, VoiceProfile>> = {
  marey: { bank: 'marey', rate: 1, gain: 1 },
  mikhailovsky: { bank: 'marey', rate: 1.1, gain: 0.95 },
  pavlov: { bank: 'marey', rate: 1.17, gain: 0.92 },
  dolgorukov: { bank: 'marey', rate: 0.9, gain: 1 },
  alieva: { bank: 'alieva', rate: 1, gain: 1 },
  krechetova: { bank: 'alieva', rate: 0.93, gain: 1 },
}

/** Голос, которым говорит этот человек. Незнакомого никто не озвучивает. */
export function voiceProfileFor(speakerId: string): VoiceProfile | null {
  return VOICES[speakerId] ?? null
}

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

  const voice = voiceFor(previous.line, current.line)
  return cues.length === 0 && voice === null ? NOTHING : { cues, voice }
}

/** Вокализ под новую реплику. Та же реплика второй раз не озвучивается. */
function voiceFor(previous: AudioLine | null, current: AudioLine | null): VoiceCue | null {
  if (current === null || current.key === previous?.key) return null
  const profile = voiceProfileFor(current.speakerId)
  if (profile === null) return null
  return {
    bank: profile.bank,
    emotion: voiceEmotionFor(current),
    rate: profile.rate,
    gain: profile.gain,
  }
}

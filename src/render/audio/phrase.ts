import {
  EMOTION_SHAPES,
  type Voice,
  type VoiceEmotion,
} from './voices'

/**
 * Разбор реплики в план фразы.
 *
 * Здесь решается всё, что можно решить без звука: сколько слогов, какие,
 * с какими согласными, как долго каждый тянется и на какой высоте.
 * Web Audio в этом файле нет ни строчки — он получает готовый план и
 * только раскладывает его по узлам (simlish.ts). Отсюда и главное
 * свойство: план целиком проверяется тестом, без браузера.
 *
 * Всё случайное берётся из зерна, посчитанного по тексту реплики.
 * Одна и та же реплика всегда звучит одинаково — а разные реплики
 * звучат по-разному, и повторов не будет никогда. Это то самое
 * преимущество синтеза над набором сэмплов, ради которого разведка
 * (research/assets-audio.md, §1.4 п.3) и советовала процедурный путь.
 */

/** Гласный: три форманты в герцах, для взрослого мужского тракта. */
export interface Formants {
  readonly f1: number
  readonly f2: number
  readonly f3: number
}

/**
 * Русские гласные. Замерено на прототипе: фильтры встают куда сказано
 * с погрешностью 1–2 % (research/assets-audio.md, §1.7).
 */
export const VOWELS: Readonly<Record<string, Formants>> = {
  а: { f1: 700, f2: 1150, f3: 2600 },
  о: { f1: 480, f2: 850, f3: 2500 },
  у: { f1: 320, f2: 700, f3: 2450 },
  э: { f1: 500, f2: 1750, f3: 2550 },
  и: { f1: 300, f2: 2200, f3: 3000 },
  ы: { f1: 350, f2: 1450, f3: 2500 },
}

const VOWEL_IDS: readonly string[] = ['а', 'о', 'у', 'э', 'и', 'ы']

/** Место образования согласного. От него зависит, откуда едет форманта. */
export type ConsonantPlace = 'labial' | 'alveolar' | 'velar'

/**
 * Локус: положение формант в момент согласного. Именно съезд F2 от
 * локуса к цели гласного за первые ~48 мс превращает набор тонов в речь
 * (research/assets-audio.md, §1.5 п.3 — «второй по важности приём»).
 */
export const LOCI: Readonly<Record<ConsonantPlace, Formants>> = {
  labial: { f1: 400, f2: 800, f3: 2300 },
  alveolar: { f1: 350, f2: 1750, f3: 2600 },
  velar: { f1: 350, f2: 2100, f3: 2500 },
}

export type ConsonantKind = 'plosive' | 'fricative' | 'nasal' | 'liquid'

/** Полоса шума согласного. */
export interface NoiseBand {
  readonly frequency: number
  readonly q: number
}

export interface Consonant {
  readonly id: string
  readonly place: ConsonantPlace
  readonly kind: ConsonantKind
  /** Длительность согласного до гласного, секунды. */
  readonly seconds: number
  /** Полоса шума. null — согласный без шума: носовой или плавный. */
  readonly noise: NoiseBand | null
  /** Громкость шумовой ветки. */
  readonly amplitude: number
}

/**
 * Согласные. Таблица из разведки (§1.5 п.4), выверена на прототипе.
 *
 * Взрывные звучат не всплеском, а тишиной перед всплеском: смычка —
 * то, что делает «т» похожим на «т». Это учтено в simlish.ts, здесь
 * только длительности и полосы.
 */
export const CONSONANTS: Readonly<Record<string, Consonant>> = {
  п: { id: 'п', place: 'labial', kind: 'plosive', seconds: 0.03, noise: { frequency: 900, q: 1.2 }, amplitude: 0.55 },
  т: { id: 'т', place: 'alveolar', kind: 'plosive', seconds: 0.028, noise: { frequency: 4000, q: 1.5 }, amplitude: 0.6 },
  к: { id: 'к', place: 'velar', kind: 'plosive', seconds: 0.035, noise: { frequency: 1900, q: 1.4 }, amplitude: 0.55 },
  б: { id: 'б', place: 'labial', kind: 'plosive', seconds: 0.032, noise: { frequency: 700, q: 1 }, amplitude: 0.28 },
  д: { id: 'д', place: 'alveolar', kind: 'plosive', seconds: 0.03, noise: { frequency: 2200, q: 1.2 }, amplitude: 0.3 },
  г: { id: 'г', place: 'velar', kind: 'plosive', seconds: 0.034, noise: { frequency: 1700, q: 1.2 }, amplitude: 0.28 },
  с: { id: 'с', place: 'alveolar', kind: 'fricative', seconds: 0.075, noise: { frequency: 6200, q: 2.2 }, amplitude: 0.42 },
  ш: { id: 'ш', place: 'alveolar', kind: 'fricative', seconds: 0.08, noise: { frequency: 2900, q: 1.6 }, amplitude: 0.46 },
  ф: { id: 'ф', place: 'labial', kind: 'fricative', seconds: 0.065, noise: { frequency: 1600, q: 0.9 }, amplitude: 0.3 },
  х: { id: 'х', place: 'velar', kind: 'fricative', seconds: 0.07, noise: { frequency: 1300, q: 0.8 }, amplitude: 0.28 },
  м: { id: 'м', place: 'labial', kind: 'nasal', seconds: 0.055, noise: null, amplitude: 0 },
  н: { id: 'н', place: 'alveolar', kind: 'nasal', seconds: 0.05, noise: null, amplitude: 0 },
  л: { id: 'л', place: 'alveolar', kind: 'liquid', seconds: 0.045, noise: null, amplitude: 0 },
  р: { id: 'р', place: 'alveolar', kind: 'liquid', seconds: 0.04, noise: null, amplitude: 0 },
  в: { id: 'в', place: 'labial', kind: 'liquid', seconds: 0.045, noise: null, amplitude: 0 },
}

const CONSONANT_IDS: readonly string[] = Object.keys(CONSONANTS)

// ── Длина вокализа ───────────────────────────────────────────────

/** Гласные буквы русского алфавита: по ним считаются слоги. */
const RUSSIAN_VOWELS = 'аеёиоуыэюя'

/**
 * Сколько слогов в реплике на самом деле.
 *
 * В русском слогов ровно столько, сколько гласных букв, — правило без
 * исключений, и никакого словаря для него не нужно.
 */
export function spokenSyllables(text: string): number {
  let count = 0
  for (const char of text.toLowerCase()) {
    if (RUSSIAN_VOWELS.includes(char)) count += 1
  }
  return count
}

/**
 * Насколько вокализ короче настоящей речи.
 *
 * Бормотание — не озвучка, а впечатление от реплики: игрок читает
 * текст глазами, а слышит его тень. Полная длина утомляла бы вдвое —
 * на каждую реплику приходилось бы ждать, пока персонаж договорит.
 */
export const SPEECH_COMPRESSION = 0.45

/** Короче двух слогов бормотание перестаёт читаться как речь. */
export const MIN_SYLLABLES = 2

/**
 * Потолок длины, слоги.
 *
 * Десять слогов — это от полутора до трёх секунд, смотря кто говорит и
 * в каком настроении. Дальше вокализ начинает не сопровождать реплику,
 * а тянуться поперёк неё: длинный абзац Михайловского и короткое
 * «Садитесь» обязаны различаться, но различаться в разы, а не в
 * двадцать раз. Потолок считался по худшему случаю — самый медленный
 * голос игры в самом медленном настроении.
 */
export const MAX_SYLLABLES = 10

/**
 * Сколько слогов бормотать под эту реплику.
 *
 * Ноль — для реплики без единой гласной: пустая строка, многоточие,
 * знак. Такое не озвучивается вовсе.
 */
export function syllablesForText(text: string): number {
  const spoken = spokenSyllables(text)
  if (spoken === 0) return 0
  const wanted = Math.round(spoken * SPEECH_COMPRESSION)
  return Math.min(Math.max(wanted, MIN_SYLLABLES), MAX_SYLLABLES)
}

// ── Зерно ────────────────────────────────────────────────────────

/**
 * Зерно по строке, FNV-1a.
 *
 * Нужно ровно одно свойство: разные строки дают разные числа, а одна
 * и та же строка — всегда одно и то же. Криптографии здесь не место.
 */
export function seedFrom(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Генератор mulberry32: короткий, быстрый, с хорошим разбросом. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── План ─────────────────────────────────────────────────────────

/** Один слог: согласный, гласный, длительности и три точки высоты. */
export interface SyllablePlan {
  /** Момент начала слога от начала фразы, секунды. */
  readonly at: number
  readonly onset: Consonant | null
  /** Форманты гласного, уже умноженные на длину тракта голоса. */
  readonly vowel: Formants
  /** Откуда едут форманты. null — слог без согласного. */
  readonly locus: Formants | null
  readonly consonantSeconds: number
  readonly vowelSeconds: number
  readonly stressed: boolean
  /** Высота в начале, середине и конце слога, Гц. */
  readonly pitch: readonly [number, number, number]
}

/** Готовая к синтезу фраза. */
export interface PhrasePlan {
  readonly voiceId: string
  readonly emotion: VoiceEmotion
  /** Зерно, из которого выведен план. Им же различаются записи в кэше. */
  readonly seed: number
  readonly syllables: readonly SyllablePlan[]
  /** Полная длина фразы, секунды. */
  readonly seconds: number
  /** Придыхание, дрожание и наклон — уже с поправкой на эмоцию. */
  readonly breath: number
  readonly jitter: number
  readonly tilt: number
  /** Общая громкость фразы: манера человека плюс поправка эмоции. */
  readonly gain: number
}

/** Длительность безударного и ударного гласного до поправок, секунды. */
const UNSTRESSED_SECONDS = 0.095
const STRESSED_SECONDS = 0.135

/** Пауза между слогами одного слова, секунды. */
const SYLLABLE_GAP = 0.012

/** Пауза между словами, секунды: от и до. */
const WORD_GAP_MIN = 0.085
const WORD_GAP_MAX = 0.175

/** Разброс длительности слога: без него речь звучит метрономом. */
const LENGTH_JITTER = 0.15

/** Доля слогов, начинающихся с согласного. */
const ONSET_CHANCE = 0.86

/**
 * Разбить слоги по словам, по одному-три в слове.
 *
 * Двусложные слова вдвое вероятнее прочих — так набор ближе к русской
 * речи, где односложных и трёхсложных слов заметно меньше.
 */
export function splitIntoWords(total: number, random: () => number): number[] {
  const lengths = [1, 1, 2, 2, 2, 3]
  const words: number[] = []
  let left = total
  while (left > 0) {
    const index = Math.floor(random() * lengths.length)
    const pick = lengths[index] ?? 2
    const length = Math.min(pick, left)
    words.push(length)
    left -= length
  }
  return words
}

/**
 * Насколько размах голоса сжимает ядерный тон.
 *
 * Размах (`range`) — это манера: Долгоруков говорит ровно, Алиева
 * живо. Но ядерный тон — не манера, а грамматика: именно он отличает
 * вопрос от утверждения, и сухой человек задаёт вопросы ничуть не
 * менее внятно, чем живой. Поэтому размах давит на ядро вполсилы.
 *
 * Замер это и показал: без поправки у Долгорукова вопрос поднимался
 * на 0.3 полутона против 6.7 у Алиевой — то есть у него вопрос просто
 * переставал быть слышен вопросом.
 */
function nuclearRange(range: number): number {
  return 0.5 + 0.5 * range
}

/**
 * Контур интонации: три точки высоты на каждый слог, в полутонах.
 *
 * Складывается из трёх слоёв (research/assets-audio.md, §1.5 п.5):
 * общего падения к концу фразы, надбавки на ударном слоге и ядерного
 * тона по системе ИК Брызгуновой на последнем слоге. Именно ядерный
 * тон отличает вопрос от утверждения, и отличает сильно: замер на
 * прототипе показал разницу в 2.6–3.8 полутона в нужную сторону.
 */
export function pitchContour(
  index: number,
  count: number,
  emotion: VoiceEmotion,
  stressed: boolean,
  range = 1,
): [number, number, number] {
  const progress = index / Math.max(1, count - 1)
  const decline = -2.2 * progress
  const accent = stressed && index < count - 1 ? 1.1 : 0
  const last = index === count - 1
  const body = range
  const nucleus = nuclearRange(range)
  const scale = (points: [number, number, number], by: number): [number, number, number] => [
    points[0] * by,
    points[1] * by,
    points[2] * by,
  ]

  switch (emotion) {
    case 'statement':
      // ИК-1: резкое падение на последнем слоге.
      return last
        ? scale([decline + 0.5, decline - 1.5, decline - 4.5], nucleus)
        : scale([decline, decline + accent, decline], body)
    case 'question':
      // ИК-3: взлёт на ядре. Общее падение вдвое слабее — вопрос
      // не оседает к концу, иначе взлёт не с чего начинать.
      return last
        ? scale([decline, decline + 4, decline + 7.5], nucleus)
        : scale([decline * 0.5, decline * 0.5 + accent, decline * 0.5], body)
    case 'displeased':
      // Ниже обычного и ровнее: недовольство не кричит, оно опускает
      // голос. Хвост падает глубже, чем в утверждении.
      return last
        ? scale([decline - 1, decline - 2.4, decline - 5.5], nucleus)
        : scale([decline - 1.5, decline - 1.2, decline - 1.8], body)
    case 'cheerful':
      // Выше обычного, с подъёмом на середине слога и мягким хвостом:
      // радость не падает в конце так, как утверждение.
      return last
        ? scale([decline + 3, decline + 3.6, decline + 1], nucleus)
        : scale([decline + 2, decline + 3.2 + accent, decline + 2.2], body)
  }
}

function scaleFormants(formants: Formants, scale: number): Formants {
  return { f1: formants.f1 * scale, f2: formants.f2 * scale, f3: formants.f3 * scale }
}

function semitonesToHz(base: number, semitones: number): number {
  return base * Math.pow(2, semitones / 12)
}

/**
 * План фразы: что именно синтезировать.
 *
 * @param syllables сколько слогов бормотать; считается по тексту реплики
 *   функцией syllablesForText.
 * @param seed зерно; считается по тексту функцией seedFrom.
 */
export function planPhrase(
  voice: Voice,
  emotion: VoiceEmotion,
  syllables: number,
  seed: number,
): PhrasePlan {
  const shape = EMOTION_SHAPES[emotion]
  const random = makeRandom(seed)
  const count = Math.max(0, Math.floor(syllables))

  const plan: SyllablePlan[] = []
  let cursor = 0

  if (count > 0) {
    const words = splitIntoWords(count, random)
    let index = 0
    let previousVowel = ''

    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const length = words[wordIndex] ?? 1
      for (let position = 0; position < length; position++) {
        // Ударение на втором слоге слова, а в односложном — на первом.
        const stressed = position === Math.min(length - 1, 1)

        // Два одинаковых гласных подряд слышны как заикание.
        const choices = VOWEL_IDS.filter((id) => id !== previousVowel)
        const vowelId = choices[Math.floor(random() * choices.length)] ?? 'а'
        previousVowel = vowelId
        const vowel = VOWELS[vowelId] ?? VOWELS['а']

        const onsetId = CONSONANT_IDS[Math.floor(random() * CONSONANT_IDS.length)] ?? 'т'
        const onset = random() < ONSET_CHANCE ? (CONSONANTS[onsetId] ?? null) : null

        const spread = 1 - LENGTH_JITTER + random() * LENGTH_JITTER * 2
        const base = stressed ? STRESSED_SECONDS : UNSTRESSED_SECONDS
        const vowelSeconds = base * voice.rate * shape.duration * spread
        const consonantSeconds = onset === null ? 0 : onset.seconds * shape.duration

        const contour = pitchContour(index, count, emotion, stressed, voice.range)
        // Разброс по слогам: один и тот же на все три точки, иначе слог
        // не сдвигается целиком, а перекашивается.
        const wobble = (random() - 0.5) * voice.pitchRandom

        plan.push({
          at: cursor,
          onset,
          vowel: scaleFormants(vowel!, voice.formantScale),
          locus: onset === null ? null : scaleFormants(LOCI[onset.place], voice.formantScale),
          consonantSeconds,
          vowelSeconds,
          stressed,
          pitch: [
            semitonesToHz(voice.f0, contour[0] + wobble),
            semitonesToHz(voice.f0, contour[1] + wobble),
            semitonesToHz(voice.f0, contour[2] + wobble),
          ],
        })

        cursor += consonantSeconds + vowelSeconds
        if (position < length - 1) cursor += SYLLABLE_GAP
        index += 1
      }
      if (wordIndex < words.length - 1) {
        const gap = WORD_GAP_MIN + random() * (WORD_GAP_MAX - WORD_GAP_MIN)
        cursor += gap * shape.pause
      }
    }
  }

  return {
    voiceId: voice.id,
    emotion,
    seed,
    syllables: plan,
    seconds: cursor,
    breath: voice.breath * shape.breath,
    jitter: voice.jitter * shape.jitter,
    tilt: voice.tilt * shape.bright,
    gain: voice.gain * shape.gain,
  }
}

/**
 * Полный путь от реплики до плана.
 *
 * @param text текст реплики: из него берутся и длина, и зерно.
 * @param salt приправа к зерну; ею разводятся одинаковые реплики разных
 *   людей и повторные показы одной и той же строки.
 */
export function planForLine(
  voice: Voice,
  emotion: VoiceEmotion,
  text: string,
  salt = '',
): PhrasePlan {
  return planPhrase(voice, emotion, syllablesForText(text), seedFrom(`${salt}|${text}`))
}

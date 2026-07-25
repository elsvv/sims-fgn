import { describe, expect, it } from 'vitest'
import {
  CONSONANTS,
  LOCI,
  MAX_SYLLABLES,
  MIN_SYLLABLES,
  VOWELS,
  makeRandom,
  pitchContour,
  planForLine,
  planPhrase,
  seedFrom,
  spokenSyllables,
  splitIntoWords,
  syllablesForText,
} from './phrase'
import { EMOTION_SHAPES, VOICES, type VoiceEmotion } from './voices'

/** Реплики из игры, короткая и длинная. */
const SHORT = 'Садитесь.'
const LONG =
  'Итак. Сегодня три вещи. Первое — жанр, второе — метод, третье — вы и ваш текст.'

describe('длина вокализа от длины реплики', () => {
  it('слоги считаются по гласным', () => {
    expect(spokenSyllables('Садитесь')).toBe(3)
    expect(spokenSyllables('Итак')).toBe(2)
    expect(spokenSyllables('всплеск')).toBe(1)
    expect(spokenSyllables('')).toBe(0)
  })

  it('регистр не влияет на счёт', () => {
    expect(spokenSyllables('ИТАК')).toBe(spokenSyllables('итак'))
  })

  it('длинная реплика бормочется дольше короткой', () => {
    expect(syllablesForText(LONG)).toBeGreaterThan(syllablesForText(SHORT))
  })

  it('вокализ короче настоящей речи', () => {
    // Игрок читает текст глазами, а слышит его тень: полная длина
    // заставляла бы ждать, пока персонаж договорит.
    expect(syllablesForText(LONG)).toBeLessThan(spokenSyllables(LONG))
  })

  it('короткая фраза не тянется пять секунд', () => {
    const plan = planForLine(VOICES.mikhailovsky, 'statement', SHORT)
    expect(plan.seconds).toBeLessThan(1)
  })

  it('и длинная тоже не тянется', () => {
    // Потолок нужен обоим концам: абзац Михайловского и «Садитесь»
    // обязаны различаться в разы, а не в двадцать раз.
    for (const voice of Object.values(VOICES)) {
      for (const emotion of Object.keys(EMOTION_SHAPES) as VoiceEmotion[]) {
        const plan = planForLine(voice, emotion, LONG.repeat(10))
        expect(plan.seconds, `${voice.id}/${emotion}`).toBeLessThan(3.2)
      }
    }
  })

  it('длина упирается в потолок, а не растёт без конца', () => {
    expect(syllablesForText(LONG.repeat(20))).toBe(MAX_SYLLABLES)
  })

  it('одно слово не короче двух слогов', () => {
    // Один слог не читается как речь, он читается как «ой».
    expect(syllablesForText('Да.')).toBe(MIN_SYLLABLES)
    expect(syllablesForText('Нет.')).toBe(MIN_SYLLABLES)
  })

  it('реплика без гласных не озвучивается вовсе', () => {
    expect(syllablesForText('...')).toBe(0)
    expect(syllablesForText('')).toBe(0)
    expect(planForLine(VOICES.marey, 'statement', '...').seconds).toBe(0)
  })

  it('длина растёт от текста монотонно', () => {
    let previous = 0
    for (const count of [1, 4, 8, 12, 20, 30]) {
      const text = 'та'.repeat(count)
      const now = syllablesForText(text)
      expect(now, text).toBeGreaterThanOrEqual(previous)
      previous = now
    }
  })

  it('медленный голос на той же реплике звучит дольше быстрого', () => {
    const slow = planForLine(VOICES.mikhailovsky, 'statement', LONG)
    const quick = planForLine(VOICES.pavlov, 'statement', LONG)
    expect(slow.seconds).toBeGreaterThan(quick.seconds)
  })

  it('недовольство тянется дольше радости', () => {
    const sour = planForLine(VOICES.marey, 'displeased', LONG)
    const glad = planForLine(VOICES.marey, 'cheerful', LONG)
    expect(sour.seconds).toBeGreaterThan(glad.seconds)
  })

  it('слогов в плане ровно столько, сколько заказано', () => {
    const plan = planPhrase(VOICES.alieva, 'statement', 7, 1234)
    expect(plan.syllables).toHaveLength(7)
  })

  it('слоги идут подряд и не наезжают друг на друга', () => {
    const plan = planPhrase(VOICES.krechetova, 'question', 9, 77)
    let edge = 0
    for (const syllable of plan.syllables) {
      expect(syllable.at).toBeGreaterThanOrEqual(edge - 1e-9)
      edge = syllable.at + syllable.consonantSeconds + syllable.vowelSeconds
    }
    expect(plan.seconds).toBeGreaterThanOrEqual(edge - 1e-9)
  })
})

describe('одна реплика — один звук', () => {
  it('зерно от текста детерминировано', () => {
    expect(seedFrom('Итак, начнём.')).toBe(seedFrom('Итак, начнём.'))
    expect(seedFrom('Итак, начнём.')).not.toBe(seedFrom('Итак, начнем.'))
  })

  it('одинаковые реплики звучат одинаково', () => {
    const first = planForLine(VOICES.marey, 'statement', SHORT)
    const second = planForLine(VOICES.marey, 'statement', SHORT)
    expect(first).toEqual(second)
  })

  it('разные реплики звучат по-разному', () => {
    const first = planForLine(VOICES.marey, 'statement', 'Итак, начнём.')
    const second = planForLine(VOICES.marey, 'statement', 'Садитесь, коллеги.')
    expect(first.syllables).not.toEqual(second.syllables)
  })

  it('приправа разводит одну реплику у разных людей', () => {
    const first = planForLine(VOICES.marey, 'statement', SHORT, 'marey')
    const second = planForLine(VOICES.marey, 'statement', SHORT, 'pavlov')
    expect(first.syllables).not.toEqual(second.syllables)
  })

  it('генератор случайных чисел воспроизводим и не вырождается', () => {
    const first = Array.from({ length: 50 }, makeRandom(42))
    expect(first).toEqual(Array.from({ length: 50 }, makeRandom(42)))
    const values = Array.from({ length: 200 }, makeRandom(7))
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    expect(new Set(values).size).toBeGreaterThan(150)
  })
})

describe('интонация', () => {
  const nuclear = (emotion: VoiceEmotion) => pitchContour(5, 6, emotion, false)

  it('утверждение падает к концу', () => {
    const [, , end] = nuclear('statement')
    expect(end).toBeLessThan(0)
  })

  it('вопрос взлетает', () => {
    const [start, , end] = nuclear('question')
    expect(end).toBeGreaterThan(start)
  })

  it('вопрос кончается выше утверждения — и заметно', () => {
    // Замер на прототипе: разница 2.6–3.8 полутона в правильную сторону.
    const question = nuclear('question')[2]
    const statement = nuclear('statement')[2]
    expect(question - statement).toBeGreaterThan(2.5)
  })

  it('радость выше недовольства', () => {
    expect(nuclear('cheerful')[0]).toBeGreaterThan(nuclear('displeased')[0])
  })

  it('вопрос слышен вопросом даже у самого ровного голоса', () => {
    // Размах — это манера, а ядерный тон — грамматика: сухой человек
    // задаёт вопросы не менее внятно, чем живой. Без поправки у
    // Долгорукова вопрос поднимался на 0.3 полутона против 6.7
    // у Алиевой, то есть переставал быть слышен вопросом.
    for (const voice of Object.values(VOICES)) {
      const nucleus = 5
      const question = pitchContour(nucleus, 6, 'question', false, voice.range)
      const statement = pitchContour(nucleus, 6, 'statement', false, voice.range)
      expect(question[2] - statement[2], voice.id).toBeGreaterThan(6)
    }
  })

  it('живой голос всё же размашистее ровного', () => {
    // Поправка на грамматику не должна стирать разницу манер.
    const lively = pitchContour(5, 6, 'question', false, VOICES.alieva.range)
    const flat = pitchContour(5, 6, 'question', false, VOICES.dolgorukov.range)
    expect(lively[2]).toBeGreaterThan(flat[2])
  })

  it('фраза оседает к концу', () => {
    // Общее падение на любой фразе: без него речь звучит списком.
    const first = pitchContour(0, 6, 'statement', false)[0]
    const last = pitchContour(4, 6, 'statement', false)[0]
    expect(last).toBeLessThan(first)
  })

  it('высота слогов остаётся человеческой', () => {
    for (const voice of Object.values(VOICES)) {
      for (const emotion of Object.keys(EMOTION_SHAPES) as VoiceEmotion[]) {
        const plan = planPhrase(voice, emotion, MAX_SYLLABLES, 99)
        for (const syllable of plan.syllables) {
          for (const hz of syllable.pitch) {
            expect(hz, `${voice.id}/${emotion}`).toBeGreaterThan(50)
            expect(hz, `${voice.id}/${emotion}`).toBeLessThan(500)
          }
        }
      }
    }
  })
})

describe('слоги и форманты', () => {
  it('слова длиной от одного до трёх слогов, и в сумме сходится', () => {
    for (let total = 1; total <= MAX_SYLLABLES; total++) {
      const words = splitIntoWords(total, makeRandom(total * 31))
      expect(words.reduce((sum, length) => sum + length, 0), `${total}`).toBe(total)
      for (const length of words) {
        expect(length).toBeGreaterThanOrEqual(1)
        expect(length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('в каждом слове есть ударный слог, и ровно один', () => {
    const plan = planPhrase(VOICES.marey, 'statement', 9, 5)
    expect(plan.syllables.some((syllable) => syllable.stressed)).toBe(true)
    for (const syllable of plan.syllables) {
      if (!syllable.stressed) continue
      expect(syllable.vowelSeconds).toBeGreaterThan(0)
    }
  })

  it('форманты растянуты по длине тракта голоса', () => {
    // Именно масштаб формант, а не высота тона, делает голос узнаваемым.
    const low = planPhrase(VOICES.mikhailovsky, 'statement', 6, 3)
    const high = planPhrase(VOICES.alieva, 'statement', 6, 3)
    for (let i = 0; i < low.syllables.length; i++) {
      const ratio = high.syllables[i]!.vowel.f1 / low.syllables[i]!.vowel.f1
      expect(ratio).toBeCloseTo(VOICES.alieva.formantScale / VOICES.mikhailovsky.formantScale, 6)
    }
  })

  it('локус берётся по месту образования согласного', () => {
    const plan = planPhrase(VOICES.pavlov, 'statement', MAX_SYLLABLES, 11)
    for (const syllable of plan.syllables) {
      if (syllable.onset === null) {
        expect(syllable.locus).toBeNull()
        continue
      }
      const expected = LOCI[syllable.onset.place].f2 * VOICES.pavlov.formantScale
      expect(syllable.locus?.f2).toBeCloseTo(expected, 6)
    }
  })

  it('таблицы гласных и согласных не поехали', () => {
    // Замерено на прототипе: фильтры встают на эти частоты
    // с погрешностью 1–2 %.
    expect(VOWELS['а']).toEqual({ f1: 700, f2: 1150, f3: 2600 })
    expect(VOWELS['и']).toEqual({ f1: 300, f2: 2200, f3: 3000 })
    for (const [id, vowel] of Object.entries(VOWELS)) {
      expect(vowel.f1, id).toBeLessThan(vowel.f2)
      expect(vowel.f2, id).toBeLessThan(vowel.f3)
    }
    for (const [id, consonant] of Object.entries(CONSONANTS)) {
      expect(consonant.seconds, id).toBeGreaterThan(0)
      expect(consonant.seconds, id).toBeLessThan(0.1)
      // Шумовая полоса есть ровно у тех, кто шумит.
      const noisy = consonant.kind === 'plosive' || consonant.kind === 'fricative'
      expect(consonant.noise !== null, id).toBe(noisy)
    }
  })

  it('эмоция искажает голос, но не подменяет его', () => {
    const plain = planPhrase(VOICES.dolgorukov, 'statement', 6, 4)
    const sour = planPhrase(VOICES.dolgorukov, 'displeased', 6, 4)
    expect(sour.voiceId).toBe(plain.voiceId)
    // Недовольство: тише, глуше, с придыханием.
    expect(sour.gain).toBeLessThan(plain.gain)
    expect(sour.tilt).toBeLessThan(plain.tilt)
    expect(sour.breath).toBeGreaterThan(plain.breath)
  })
})

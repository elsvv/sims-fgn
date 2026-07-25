import { describe, expect, it } from 'vitest'
import { PROP_CATALOG } from '../../content/props/propCatalog'
import { TEACHERS } from '../../content/people/teachers'
import { SOUNDS, type SoundId } from './catalog'
import {
  VOICES,
  detectAudioEvents,
  voiceEmotionFor,
  voiceProfileFor,
  type AudioFrame,
} from './events'

const HERE = { x: 6.5, z: 7.5 }
const THERE = { x: 12.5, z: 6.5 }

const STILL: AudioFrame = {
  playerAt: HERE,
  moving: false,
  lessonKey: null,
  interaction: null,
  speech: null,
  line: null,
}

function ids(frame: AudioFrame, previous: AudioFrame = STILL): SoundId[] {
  return detectAudioEvents(previous, frame).cues.map((cue) => cue.id)
}

describe('события, которые слышно', () => {
  it('загрузка игры не звучит ничем', () => {
    // Сохранение, снятое посреди пары, иначе встречало бы игрока
    // звонком, которого никто не давал.
    const loud: AudioFrame = {
      ...STILL,
      lessonKey: 'greek|А-204',
      speech: { key: 'd1|slot', success: true },
      line: { key: 'реплика', speakerId: 'marey', text: 'Здравствуйте.', tone: 'plain' },
    }
    expect(detectAudioEvents(null, loud)).toEqual({ cues: [], voice: null })
  })

  it('начало пары даёт звонок', () => {
    expect(ids({ ...STILL, lessonKey: 'greek|А-204' })).toEqual(['bell'])
  })

  it('идущая пара звонит один раз', () => {
    const during: AudioFrame = { ...STILL, lessonKey: 'greek|А-204' }
    expect(ids(during, during)).toEqual([])
  })

  it('следующая пара звонит своим звонком', () => {
    const first: AudioFrame = { ...STILL, lessonKey: 'greek|А-204' }
    expect(ids({ ...STILL, lessonKey: 'logic|А-206' }, first)).toEqual(['bell'])
  })

  it('конец пары не звонит', () => {
    const during: AudioFrame = { ...STILL, lessonKey: 'greek|А-204' }
    expect(ids(STILL, during)).toEqual([])
  })

  it('звонок слышен всему этажу, у него нет места', () => {
    const cue = detectAudioEvents(STILL, { ...STILL, lessonKey: 'greek|А-204' }).cues[0]
    expect(cue?.at).toBeNull()
  })

  it('действие звучит, когда персонаж дошёл, а не когда выбрал', () => {
    // Между командой и делом он пересекает коридор; смыв в начале пути
    // звучал бы пророчеством.
    const walking: AudioFrame = {
      ...STILL,
      moving: true,
      interaction: { key: 'toilet-1|relieve', interactionId: 'relieve', at: THERE, working: false },
    }
    expect(ids(walking)).toEqual([])

    const working: AudioFrame = {
      ...walking,
      moving: false,
      interaction: { ...walking.interaction!, working: true },
    }
    expect(ids(working, walking)).toEqual(['flush'])
  })

  it('идущее действие не звучит повторно', () => {
    const working: AudioFrame = {
      ...STILL,
      interaction: { key: 'coffee-1|drinkCoffee', interactionId: 'drinkCoffee', at: THERE, working: true },
    }
    expect(ids(working, working)).toEqual([])
  })

  it('второй кофе подряд звучит снова', () => {
    const working: AudioFrame = {
      ...STILL,
      interaction: { key: 'coffee-1|drinkCoffee', interactionId: 'drinkCoffee', at: THERE, working: true },
    }
    // Между двумя действиями мир проходит через «ничего не делаю».
    expect(ids(working, STILL)).toEqual(['coffee'])
  })

  it('звук действия звучит там, где стоит предмет', () => {
    const working: AudioFrame = {
      ...STILL,
      interaction: { key: 'coffee-1|drinkCoffee', interactionId: 'drinkCoffee', at: THERE, working: true },
    }
    expect(detectAudioEvents(STILL, working).cues[0]?.at).toEqual(THERE)
  })

  it('лифт сначала звенит, потом открывает двери', () => {
    const waiting: AudioFrame = {
      ...STILL,
      interaction: {
        key: 'elevator-1|waitForElevator',
        interactionId: 'waitForElevator',
        at: THERE,
        working: true,
      },
    }
    const cues = detectAudioEvents(STILL, waiting).cues
    expect(cues.map((cue) => cue.id)).toEqual(['elevator-ding', 'elevator-doors'])
    expect(cues[0]?.delay).toBe(0)
    expect(cues[1]?.delay).toBeGreaterThan(0)
  })

  it('беззвучные действия молчат', () => {
    // Посидеть на скамейке и поболтать с однокурсниками нечем озвучить,
    // а звук ради галочки хуже тишины.
    const resting: AudioFrame = {
      ...STILL,
      interaction: { key: 'bench-1|rest', interactionId: 'rest', at: THERE, working: true },
    }
    expect(ids(resting)).toEqual([])
  })

  it('выступление на семинаре — гонг и следом оценка', () => {
    const spoke: AudioFrame = { ...STILL, speech: { key: 'd3:greek-mon|цитата', success: true } }
    const cues = detectAudioEvents(STILL, spoke).cues
    expect(cues.map((cue) => cue.id)).toEqual(['attention', 'grade-good'])
    expect(cues[1]?.delay).toBeGreaterThan(cues[0]!.delay)
  })

  it('провал звучит иначе, чем удача', () => {
    const failed: AudioFrame = { ...STILL, speech: { key: 'd3:greek-mon|шутка', success: false } }
    expect(ids(failed)).toEqual(['attention', 'grade-bad'])
  })

  it('выступление, которое видно весь остаток пары, звучит один раз', () => {
    const spoke: AudioFrame = { ...STILL, speech: { key: 'd3:greek-mon|цитата', success: true } }
    expect(ids(spoke, spoke)).toEqual([])
  })

  it('каждое действие каталога озвучено или молчит осознанно', () => {
    // Проверка сторожит не звук, а ссылки: озвученное действие,
    // переименованное в каталоге предметов, иначе тихо перестанет звучать.
    const known = new Set<string>()
    for (const definition of Object.values(PROP_CATALOG)) {
      for (const interaction of definition.interactions) known.add(interaction.id)
    }
    for (const frame of known) {
      const working: AudioFrame = {
        ...STILL,
        interaction: { key: `x|${frame}`, interactionId: frame, at: THERE, working: true },
      }
      for (const cue of detectAudioEvents(STILL, working).cues) {
        expect(SOUNDS[cue.id], `${frame} → ${cue.id}`).toBeDefined()
      }
    }
    // И наоборот: звук не должен ссылаться на выдуманное действие.
    const voiced = ['drinkCoffee', 'relieve', 'waitForElevator', 'writeEssay', 'buySnack']
    for (const id of voiced) expect(known.has(id), id).toBe(true)
  })
})

describe('голоса', () => {
  const line = (text: string, tone: 'plain' | 'warm' | 'cold' = 'plain') => ({
    key: text,
    speakerId: 'marey',
    text,
    tone,
  })

  it('новая реплика озвучивается', () => {
    const talking: AudioFrame = { ...STILL, line: line('Здравствуйте.') }
    expect(detectAudioEvents(STILL, talking).voice).toEqual({
      bank: 'marey',
      emotion: 'statement',
      rate: 1,
      gain: 1,
    })
  })

  it('та же реплика второй раз молчит', () => {
    const talking: AudioFrame = { ...STILL, line: line('Здравствуйте.') }
    expect(detectAudioEvents(talking, talking).voice).toBeNull()
  })

  it('вопрос звучит вопросом', () => {
    expect(voiceEmotionFor(line('И где ваш перевод?'))).toBe('question')
    // Хвост может кончаться кавычкой или многоточием.
    expect(voiceEmotionFor(line('Вы это серьёзно?..'))).toBe('question')
    expect(voiceEmotionFor(line('«Что дальше?»'))).toBe('question')
  })

  it('испорченные отношения сильнее знака вопроса', () => {
    // «И где ваш перевод?» от Алиевой — это не вопрос, это выговор.
    expect(voiceEmotionFor(line('И где ваш перевод?', 'cold'))).toBe('displeased')
  })

  it('улучшенные отношения звучат теплом', () => {
    expect(voiceEmotionFor(line('Ну наконец-то.', 'warm'))).toBe('cheerful')
  })

  it('восклицание звучит теплее ровной фразы', () => {
    expect(voiceEmotionFor(line('Вот это да!'))).toBe('cheerful')
    expect(voiceEmotionFor(line('Садитесь.'))).toBe('statement')
  })

  it('каждый преподаватель говорит своим голосом', () => {
    for (const id of Object.keys(TEACHERS)) {
      const profile = voiceProfileFor(id)
      expect(profile, id).not.toBeNull()
      if (profile === null) continue
      expect(profile.rate, id).toBeGreaterThanOrEqual(0.85)
      expect(profile.rate, id).toBeLessThanOrEqual(1.25)
    }
  })

  it('голоса не свалены в один', () => {
    // Скорость тянет за собой высоту: одинаковая скорость означает
    // одинаковый голос у двух разных людей.
    const male = Object.values(VOICES).filter((voice) => voice.bank === 'marey')
    expect(new Set(male.map((voice) => voice.rate)).size).toBe(male.length)
  })

  it('незнакомого никто не озвучивает', () => {
    expect(voiceProfileFor('кто-то')).toBeNull()
    const talking: AudioFrame = {
      ...STILL,
      line: { key: 'k', speakerId: 'кто-то', text: 'Привет.', tone: 'plain' },
    }
    expect(detectAudioEvents(STILL, talking).voice).toBeNull()
  })
})

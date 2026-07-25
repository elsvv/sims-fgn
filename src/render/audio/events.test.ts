import { describe, expect, it } from 'vitest'
import { PROP_CATALOG } from '../../content/props/propCatalog'
import { TEACHERS } from '../../content/people/teachers'
import { SOUNDS, type SoundId } from './catalog'
import {
  GREETING_ENTER,
  GREETING_LEAVE,
  detectAudioEvents,
  voiceEmotionFor,
  type AudioFrame,
} from './events'
import { planForLine, syllablesForText } from './phrase'
import { VOICES, voiceFor } from './voices'

const HERE = { x: 6.5, z: 7.5 }
const THERE = { x: 12.5, z: 6.5 }

const STILL: AudioFrame = {
  playerAt: HERE,
  moving: false,
  lessonKey: null,
  interaction: null,
  speech: null,
  line: null,
  neighbour: null,
}

/** Выступление на семинаре: коротко, без ответа преподавателя. */
function spoke(key: string, success: boolean) {
  return { key, success, teacherId: null, reply: null, at: null }
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
      speech: spoke('d1|slot', true),
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
    const said: AudioFrame = { ...STILL, speech: spoke('d3:greek-mon|цитата', true) }
    const cues = detectAudioEvents(STILL, said).cues
    expect(cues.map((cue) => cue.id)).toEqual(['attention', 'grade-good'])
    expect(cues[1]?.delay).toBeGreaterThan(cues[0]!.delay)
  })

  it('провал звучит иначе, чем удача', () => {
    const failed: AudioFrame = { ...STILL, speech: spoke('d3:greek-mon|шутка', false) }
    expect(ids(failed)).toEqual(['attention', 'grade-bad'])
  })

  it('выступление, которое видно весь остаток пары, звучит один раз', () => {
    const said: AudioFrame = { ...STILL, speech: spoke('d3:greek-mon|цитата', true) }
    expect(ids(said, said)).toEqual([])
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

describe('кто говорит и с какой интонацией', () => {
  const line = (text: string, tone: 'plain' | 'warm' | 'cold' = 'plain') => ({
    key: text,
    speakerId: 'marey',
    text,
    tone,
  })

  it('новая реплика озвучивается голосом того, кто её произнёс', () => {
    const talking: AudioFrame = { ...STILL, line: line('Здравствуйте.') }
    const voice = detectAudioEvents(STILL, talking).voice
    expect(voice?.voiceId).toBe('marey')
    expect(voice?.emotion).toBe('statement')
    expect(voice?.syllables).toBeGreaterThan(0)
  })

  it('та же реплика второй раз молчит', () => {
    const talking: AudioFrame = { ...STILL, line: line('Здравствуйте.') }
    expect(detectAudioEvents(talking, talking).voice).toBeNull()
  })

  it('одна и та же реплика звучит одинаково, разные — по-разному', () => {
    // Зерно выводится из текста: это и есть детерминизм без повторов.
    const first: AudioFrame = { ...STILL, line: line('Итак, начнём.') }
    const second: AudioFrame = { ...STILL, line: line('Итак, начнём.') }
    const other: AudioFrame = { ...STILL, line: line('Садитесь, пожалуйста.') }
    expect(detectAudioEvents(STILL, first).voice?.seed).toBe(
      detectAudioEvents(STILL, second).voice?.seed,
    )
    expect(detectAudioEvents(STILL, first).voice?.seed).not.toBe(
      detectAudioEvents(STILL, other).voice?.seed,
    )
  })

  it('вопрос звучит вопросом', () => {
    expect(voiceEmotionFor(line('И где ваш перевод?'))).toBe('question')
    // Хвост может кончаться кавычкой или многоточием.
    expect(voiceEmotionFor(line('Вы это серьёзно?..'))).toBe('question')
    expect(voiceEmotionFor(line('«Что дальше?»'))).toBe('question')
  })

  it('испорченные отношения сильнее знака вопроса', () => {
    // «И где ваш перевод?» — это не вопрос, это выговор.
    expect(voiceEmotionFor(line('И где ваш перевод?', 'cold'))).toBe('displeased')
  })

  it('улучшенные отношения звучат теплом', () => {
    expect(voiceEmotionFor(line('Ну наконец-то.', 'warm'))).toBe('cheerful')
  })

  it('восклицание звучит теплее ровной фразы', () => {
    expect(voiceEmotionFor(line('Вот это да!'))).toBe('cheerful')
    expect(voiceEmotionFor(line('Садитесь.'))).toBe('statement')
  })

  it('каждому преподавателю каталога есть чем говорить', () => {
    for (const id of Object.keys(TEACHERS)) {
      expect(voiceFor(id), id).not.toBeNull()
    }
  })

  it('незнакомого никто не озвучивает', () => {
    expect(voiceFor('кто-то')).toBeNull()
    const talking: AudioFrame = {
      ...STILL,
      line: { key: 'k', speakerId: 'кто-то', text: 'Привет.', tone: 'plain' },
    }
    expect(detectAudioEvents(STILL, talking).voice).toBeNull()
  })

  it('реплика без единой гласной не озвучивается', () => {
    // Одно многоточие или знак — озвучивать нечего.
    const talking: AudioFrame = { ...STILL, line: line('...') }
    expect(detectAudioEvents(STILL, talking).voice).toBeNull()
  })
})

describe('реакция на семинаре', () => {
  const said = (success: boolean, reply: string | null) => ({
    key: 'd3:greek-mon|цитата',
    success,
    teacherId: 'alieva',
    reply,
    at: THERE,
  })

  it('похвала звучит радостью, выговор — недовольством', () => {
    const good: AudioFrame = { ...STILL, speech: said(true, 'Верно, и доказуемо верно.') }
    const bad: AudioFrame = { ...STILL, speech: said(false, 'Это интуиция, а не вывод.') }
    expect(detectAudioEvents(STILL, good).voice?.emotion).toBe('cheerful')
    expect(detectAudioEvents(STILL, bad).voice?.emotion).toBe('displeased')
  })

  it('преподаватель отвечает своим голосом и со своего места', () => {
    const good: AudioFrame = { ...STILL, speech: said(true, 'Прекрасно.') }
    const voice = detectAudioEvents(STILL, good).voice
    expect(voice?.voiceId).toBe('alieva')
    expect(voice?.at).toEqual(THERE)
  })

  it('ответ звучит после оценки, а не вместе с ней', () => {
    // Иначе гонг, оценка и голос слипаются в одно невнятное событие.
    const good: AudioFrame = { ...STILL, speech: said(true, 'Прекрасно.') }
    const events = detectAudioEvents(STILL, good)
    const grade = events.cues.at(-1)
    expect(events.voice?.delay).toBeGreaterThan(grade!.delay)
  })

  it('выступление, которому некому ответить, отвечает молчанием', () => {
    const orphan: AudioFrame = { ...STILL, speech: spoke('d3:greek-mon|цитата', true) }
    expect(detectAudioEvents(STILL, orphan).voice).toBeNull()
  })

  it('одно выступление отвечается один раз', () => {
    const good: AudioFrame = { ...STILL, speech: said(true, 'Прекрасно.') }
    expect(detectAudioEvents(good, good).voice).toBeNull()
  })
})

describe('приветствие при подходе', () => {
  const near = (distance: number, id = 'marey', warm = false) => ({
    ...STILL,
    neighbour: { id, at: THERE, distance, warm },
  })

  it('подошёл — поздоровались', () => {
    const voice = detectAudioEvents(STILL, near(GREETING_ENTER - 0.5)).voice
    expect(voice?.voiceId).toBe('marey')
    expect(voice?.syllables).toBeLessThanOrEqual(4)
  })

  it('издалека не здороваются', () => {
    expect(detectAudioEvents(STILL, near(GREETING_ENTER + 3)).voice).toBeNull()
  })

  it('стоя рядом, здороваются один раз', () => {
    const close = near(1.2)
    expect(detectAudioEvents(close, close).voice).toBeNull()
  })

  it('топтание на границе не превращается в десять приветствий', () => {
    // Игрок ходит туда-сюда вокруг порога: встреча не кончилась,
    // пока он не отошёл по-настоящему.
    const inside = near(GREETING_ENTER - 0.1)
    const outside = near(GREETING_ENTER + 0.1)
    expect(detectAudioEvents(outside, inside).voice).toBeNull()
  })

  it('отошёл и вернулся — поздоровались снова', () => {
    const away = near(GREETING_LEAVE + 1)
    expect(detectAudioEvents(away, near(1)).voice).not.toBeNull()
  })

  it('тот, кто вам рад, здоровается иначе', () => {
    expect(detectAudioEvents(STILL, near(1, 'marey', true)).voice?.emotion).toBe('cheerful')
    expect(detectAudioEvents(STILL, near(1, 'marey', false)).voice?.emotion).toBe('statement')
  })

  it('приветствие никого не перебивает, а реплика перебивает', () => {
    // На быстрой промотке шестеро носятся по этажу; здоровающиеся
    // наперебой дали бы не жизнь, а заикание.
    expect(detectAudioEvents(STILL, near(1)).voice?.interrupts).toBe(false)
    const talking: AudioFrame = {
      ...STILL,
      line: { key: 'узел', speakerId: 'marey', text: 'Итак, начнём.', tone: 'plain' },
    }
    expect(detectAudioEvents(STILL, talking).voice?.interrupts).toBe(true)
  })

  it('разговор важнее приветствия', () => {
    // Иначе подошедший к преподавателю игрок услышал бы «здравствуйте»
    // поверх первой же реплики разговора.
    const both: AudioFrame = {
      ...near(1, 'alieva'),
      line: { key: 'узел', speakerId: 'marey', text: 'Итак, начнём.', tone: 'plain' },
    }
    expect(detectAudioEvents(STILL, both).voice?.voiceId).toBe('marey')
  })
})

describe('голоса шестерых различаются', () => {
  it('ни одна пара не совпадает ни по высоте, ни по длине тракта', () => {
    // Меняя одну лишь высоту, получаешь того же человека, говорящего
    // выше. Узнаваемость даёт масштаб формант, поэтому разведены оба.
    const all = Object.values(VOICES)
    expect(new Set(all.map((voice) => voice.f0)).size).toBe(all.length)
    expect(new Set(all.map((voice) => voice.formantScale)).size).toBe(all.length)
    expect(new Set(all.map((voice) => voice.rate)).size).toBe(all.length)
  })

  it('Марей ниже и медленнее Алиевой', () => {
    expect(VOICES.marey.f0).toBeLessThan(VOICES.alieva.f0)
    expect(VOICES.marey.rate).toBeGreaterThan(VOICES.alieva.rate)
  })

  it('Алиева живее всех, Долгоруков ровнее всех', () => {
    const ranges = Object.values(VOICES).map((voice) => voice.range)
    expect(VOICES.alieva.range).toBe(Math.max(...ranges))
    expect(VOICES.dolgorukov.range).toBe(Math.min(...ranges))
    // Сухая точность — это ещё и наименьшее дрожание голоса.
    const jitters = Object.values(VOICES).map((voice) => voice.jitter)
    expect(VOICES.dolgorukov.jitter).toBe(Math.min(...jitters))
  })

  it('Михайловский читает медленнее всех', () => {
    // «Сегодня медленно. Иначе не бывает.»
    const rates = Object.values(VOICES).map((voice) => voice.rate)
    expect(VOICES.mikhailovsky.rate).toBe(Math.max(...rates))
  })

  it('все числа тембра лежат в человеческих пределах', () => {
    for (const voice of Object.values(VOICES)) {
      expect(voice.f0, voice.id).toBeGreaterThanOrEqual(80)
      expect(voice.f0, voice.id).toBeLessThanOrEqual(260)
      expect(voice.formantScale, voice.id).toBeGreaterThanOrEqual(0.9)
      expect(voice.formantScale, voice.id).toBeLessThanOrEqual(1.25)
      expect(voice.breath, voice.id).toBeGreaterThanOrEqual(0)
      expect(voice.breath, voice.id).toBeLessThanOrEqual(0.25)
      expect(voice.jitter, voice.id).toBeGreaterThanOrEqual(0.005)
      expect(voice.jitter, voice.id).toBeLessThanOrEqual(0.03)
    }
  })
})

describe('реплики каталога и голос', () => {
  /** Все реплики всех шестерых: и приветствия, и похвалы, и выговоры. */
  function everyLine(): { teacher: string; kind: string; text: string }[] {
    const out: { teacher: string; kind: string; text: string }[] = []
    for (const [teacher, definition] of Object.entries(TEACHERS)) {
      for (const [kind, lines] of Object.entries(definition.lines)) {
        for (const text of lines) out.push({ teacher, kind, text })
      }
    }
    return out
  }

  it('каждая реплика каталога озвучивается, ни одна не молчит', () => {
    // Реплика без единой гласной осталась бы беззвучной, и заметить
    // это можно было бы только на слух.
    const lines = everyLine()
    expect(lines.length).toBeGreaterThan(50)
    for (const line of lines) {
      expect(syllablesForText(line.text), `${line.teacher}/${line.kind}: ${line.text}`).toBeGreaterThan(0)
    }
  })

  it('длина вокализа под каждую реплику остаётся в человеческих пределах', () => {
    for (const line of everyLine()) {
      const voice = voiceFor(line.teacher)
      expect(voice, line.teacher).not.toBeNull()
      if (voice === null) continue
      const plan = planForLine(voice, voiceEmotionFor({ text: line.text, tone: 'plain' }), line.text)
      expect(plan.seconds, `${line.teacher}: ${line.text}`).toBeGreaterThan(0.2)
      expect(plan.seconds, `${line.teacher}: ${line.text}`).toBeLessThan(3.2)
    }
  })

  it('похвалы звучат теплом, выговоры — холодом', () => {
    // Смысл важнее знаков препинания: «Вы прочли? Не пересказ, а текст.» —
    // это выговор, а не вопрос, и услышать его надо выговором.
    for (const [teacher, definition] of Object.entries(TEACHERS)) {
      for (const text of definition.lines.praise) {
        expect(voiceEmotionFor({ text, tone: 'warm' }), `${teacher}: ${text}`).toBe('cheerful')
      }
      for (const text of definition.lines.rebuke) {
        expect(voiceEmotionFor({ text, tone: 'cold' }), `${teacher}: ${text}`).toBe('displeased')
      }
    }
  })
})

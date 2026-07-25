/**
 * Голоса шестерых: тембр как восемь чисел.
 *
 * Голос здесь не записан, а описан. Разведка (research/assets-audio.md,
 * §1.5 п.7) показала, что узнаваемость человека держится не на высоте
 * тона, а на `formantScale` — длине речевого тракта: меняя одну только
 * частоту основного тона, получаешь того же самого человека, говорящего
 * выше. Поэтому шестеро разведены по обоим числам сразу, и ни одна пара
 * не совпадает ни по одному из восьми.
 *
 * Цифры взяты не с потолка: за каждой стоит речевой портрет из
 * research/marey-deep.md §8, research/alieva.md §5 и описаний в
 * src/content/people/teachers.ts. Слышно должно быть то же, что читается
 * в репликах, — иначе голос спорит с текстом.
 *
 * Файл чистый: ни Web Audio, ни React. Синтез живёт в simlish.ts,
 * разбор реплики — в phrase.ts, а здесь только данные и выбор по имени.
 */

/** Кто из шестерых. Идентификаторы те же, что в каталоге преподавателей. */
export type VoiceId = 'marey' | 'alieva' | 'mikhailovsky' | 'dolgorukov' | 'krechetova' | 'pavlov'

/** Интонация вокализа. */
export type VoiceEmotion = 'statement' | 'question' | 'cheerful' | 'displeased'

export const VOICE_EMOTIONS: readonly VoiceEmotion[] = [
  'statement',
  'question',
  'cheerful',
  'displeased',
]

/**
 * Тембр голоса. Ровно восемь чисел, больше ничего о человеке не нужно.
 */
export interface VoiceTimbre {
  /** Частота основного тона, Гц. Мужской 85–155, женский 165–255. */
  readonly f0: number
  /**
   * Длина речевого тракта. Меньше единицы — тракт длиннее, голос темнее;
   * больше — короче и светлее. Все форманты умножаются на это число.
   */
  readonly formantScale: number
  /** Множитель длительности слога. Больше — говорит медленнее. */
  readonly rate: number
  /** Доля придыхания в источнике, 0..0.25. */
  readonly breath: number
  /** Глубина интонации: во сколько раз растянут перепад высоты. */
  readonly range: number
  /** Дрожание основного тона, 0.005..0.03. Ноль звучит синтезатором. */
  readonly jitter: number
  /** Частота ФНЧ спектрального наклона, Гц. Ниже — глуше. */
  readonly tilt: number
  /** Разброс высоты между слогами, полутоны от края до края. */
  readonly pitchRandom: number
}

/**
 * Насколько громко человек говорит. Отдельно от восьми чисел тембра
 * нарочно: это не свойство голосового аппарата, а манера — Кречетова
 * не давит голосом, Павлов говорит поверх смеха аудитории.
 */
export interface Voice extends VoiceTimbre {
  readonly id: VoiceId
  readonly gain: number
}

/**
 * Шестеро.
 *
 * Марей и Алиева — те самые пресеты, на которых разведка отрендерила
 * прототип и замерила спектр (research/assets-audio.md, §1.7): их
 * трогать нельзя, они проверены. Остальные четверо разложены вокруг
 * них по речевым портретам.
 */
export const VOICES: Readonly<Record<VoiceId, Voice>> = {
  /*
   * Михайловский: «Сегодня медленно. Иначе не бывает». Медленное чтение
   * как метод — отсюда самый долгий слог из шестерых. Самый тёмный тембр
   * и самый низкий тон: германист, читающий вслух полстраницы за пару.
   */
  mikhailovsky: {
    id: 'mikhailovsky',
    f0: 96,
    formantScale: 0.93,
    rate: 1.3,
    breath: 0.1,
    range: 0.8,
    jitter: 0.014,
    tilt: 3000,
    pitchRandom: 2,
    gain: 0.95,
  },

  /*
   * Марей: пресет из разведки, замерено 102.6 Гц медианы. Крупный
   * человек, говорит плотно и неторопливо, придыхания больше всех —
   * на кадрах рот полуоткрыт, он всё время говорит (marey-deep.md §9).
   * Узкий интонационный размах — это его «ледяная вежливость»
   * (marey-deep.md §8.3 п.3): он не повышает голос, он понижает регистр.
   */
  marey: {
    id: 'marey',
    f0: 104,
    formantScale: 0.97,
    rate: 1.22,
    breath: 0.13,
    range: 0.65,
    jitter: 0.02,
    tilt: 3200,
    pitchRandom: 2.4,
    gain: 1,
  },

  /*
   * Долгоруков: «сухая точность, доброжелательность без единого лишнего
   * слова». Самый ровный голос игры — наименьший размах интонации и
   * наименьшее дрожание из шестерых, разброс по слогам почти нулевой.
   * Логик не подчёркивает голосом того, что и так доказано.
   */
  dolgorukov: {
    id: 'dolgorukov',
    f0: 118,
    formantScale: 1,
    rate: 0.94,
    breath: 0.03,
    range: 0.45,
    jitter: 0.006,
    tilt: 3800,
    pitchRandom: 1.2,
    gain: 0.92,
  },

  /*
   * Павлов: самый молодой и разговорный голос из шестерых. Быстрее всех,
   * светлее всех мужских, широкий разброс по слогам — ирония держится
   * на перепадах, а не на словах.
   */
  pavlov: {
    id: 'pavlov',
    f0: 132,
    formantScale: 1.04,
    rate: 0.86,
    breath: 0.05,
    range: 1.15,
    jitter: 0.011,
    tilt: 4600,
    pitchRandom: 3.2,
    gain: 0.96,
  },

  /*
   * Кречетова: «вместо приговора — приглашение подумать ещё раз».
   * Мягкий женский голос: ниже и медленнее Алиевой, придыхания втрое
   * больше, размах умеренный. Она никогда не давит.
   */
  krechetova: {
    id: 'krechetova',
    f0: 178,
    formantScale: 1.11,
    rate: 1.1,
    breath: 0.11,
    range: 0.95,
    jitter: 0.012,
    tilt: 4400,
    pitchRandom: 2.6,
    gain: 0.9,
  },

  /*
   * Алиева: пресет из разведки, замерено 187.3 Гц медианы. Самый живой
   * голос игры — наибольший размах интонации и наименьшее дрожание
   * среди женских. «Акрибия», точность: голос твёрдый, но лёгкий
   * (alieva.md §5.1 — три регистра, из которых один телеграмный).
   */
  alieva: {
    id: 'alieva',
    f0: 196,
    formantScale: 1.16,
    rate: 0.92,
    breath: 0.04,
    range: 1.25,
    jitter: 0.009,
    tilt: 5200,
    pitchRandom: 4,
    gain: 1,
  },
}

export const VOICE_IDS: readonly VoiceId[] = [
  'mikhailovsky',
  'marey',
  'dolgorukov',
  'pavlov',
  'krechetova',
  'alieva',
]

/**
 * Голос этого человека.
 *
 * Незнакомого никто не озвучивает: студент в коридоре, вахтёрша,
 * безымянный собеседник — все они молчат, и это лучше, чем говорить
 * чужим голосом.
 */
export function voiceFor(speakerId: string): Voice | null {
  return isVoiceId(speakerId) ? VOICES[speakerId] : null
}

export function isVoiceId(value: string): value is VoiceId {
  return Object.prototype.hasOwnProperty.call(VOICES, value)
}

/**
 * Множители эмоции поверх тембра.
 *
 * Из mumble-voice-lab (Apache-2.0), сверено с таблицей разведки
 * (research/assets-audio.md, §1.5 п.6) и с прототипом simlish.py.
 * Эмоция не подменяет голос, а искажает его: недовольный Долгоруков
 * остаётся Долгоруковым, просто говорит ниже, дольше и с придыханием.
 */
export interface EmotionShape {
  /** Множитель длительности слога. */
  readonly duration: number
  /** Множитель громкости. */
  readonly gain: number
  /** Множитель придыхания. */
  readonly breath: number
  /** Множитель дрожания. */
  readonly jitter: number
  /** Множитель пауз между словами. */
  readonly pause: number
  /** Множитель частоты спектрального наклона: выше — звонче. */
  readonly bright: number
}

export const EMOTION_SHAPES: Readonly<Record<VoiceEmotion, EmotionShape>> = {
  statement: { duration: 1, gain: 1, breath: 1, jitter: 1, pause: 1, bright: 1 },
  question: { duration: 0.96, gain: 1.02, breath: 1, jitter: 1.05, pause: 0.95, bright: 1.06 },
  displeased: { duration: 1.18, gain: 0.88, breath: 1.45, jitter: 1.35, pause: 1.3, bright: 0.8 },
  cheerful: { duration: 0.86, gain: 1.06, breath: 0.85, jitter: 0.95, pause: 0.8, bright: 1.14 },
}

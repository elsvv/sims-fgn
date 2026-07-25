import { makeRandom, type PhrasePlan, type SyllablePlan } from './phrase'

/**
 * Симлиш: план фразы, разложенный по узлам Web Audio.
 *
 * Схема целиком взята из разведки (research/assets-audio.md, §1.5) и
 * повторяет офлайн-прототип `assets-research/audio/proto-src/simlish.py`
 * блок в блок — там она отрендерена и замерена: форманты встают куда
 * сказано с погрешностью 1–2 %, вопрос отличается от утверждения на
 * 2.6–3.8 полутона в правильную сторону.
 *
 * На один слог:
 *
 *   OscillatorNode(волна голосовой щели)  ──┐
 *   AudioBufferSourceNode(придыхание)   ────┤
 *                                           ▼
 *   peaking F1 → peaking F2 → peaking F3 → lowpass наклон → highpass 90
 *                                           ▼
 *                                    GainNode огибающая
 *   AudioBufferSourceNode(шум согласного) → bandpass → GainNode ──┐
 *                                           ▼                    ▼
 *                                        [ шина фразы ] ◄────────┘
 *
 * Фраза рендерится целиком в OfflineAudioContext и дальше живёт как
 * обычный AudioBuffer. Так советовала разведка (§1.5 п.9): рендер двух
 * секунд занимает единицы миллисекунд, зато во время игры не создаётся
 * ни одного узла — а значит, ни одного рывка сборщика мусора посреди
 * кадра three.js.
 */

/** Гармоник в волне голосовой щели. */
const HARMONICS = 40

/** Точек в кривой автоматизации на секунду звука. */
const CURVE_RESOLUTION = 1400

/** Минимум точек в кривой: короткий согласный не должен вырождаться. */
const MIN_CURVE_POINTS = 8

/** Усиление формант, дБ. F2 и F3 обязаны быть громче F1: источник
 *  с наклоном −12 дБ/окт хоронит их к двум килогерцам на ~25 дБ. */
const FORMANT_GAINS: readonly number[] = [13, 17, 14]

/** Ширина форманты, Гц. Из неё считается добротность Q = F / BW. */
const FORMANT_BANDWIDTHS: readonly number[] = [70, 105, 160]

/** Потолок добротности: выше форманта звенит, а не окрашивает. */
const MAX_Q = 14

/** Время съезда формант от локуса согласного к цели гласного, секунды. */
const GLIDE_SECONDS = 0.048

/** Расслабление тракта к концу слога: без него слоги звучат штампом. */
const RELAX_SECONDS = 0.03

/** Отсечка бубнежа снизу, Гц. */
const HIGHPASS_HZ = 90

/** Частота носового мурмура, Гц: на «м» и «н» рот закрыт. */
const NASAL_HZ = 480

/** Всплеск взрывного согласного, секунды. */
const BURST_SECONDS = 0.012

/** Придыхание после взрывного, затекающее в гласный, секунды. */
const ASPIRATION_SECONDS = 0.028

/** Комната, в которой звучит голос: короткая, сухая, чуть живая. */
const ROOM_SECONDS = 0.42
const ROOM_DECAY = 3
const ROOM_DAMPING = 0.35
const ROOM_WET = 0.14

/** Хвост после последнего слога: реверберации нужно куда-то догореть. */
const TAIL_SECONDS = ROOM_SECONDS + 0.05

/**
 * Потолок громкости готовой фразы.
 *
 * Это ограничитель, а не выравнивание: фразы тише потолка остаются
 * какими были. Выравнивать нельзя — тогда недовольное бормотание
 * стало бы ровно таким же громким, как радостное, и разница эмоций,
 * половина которой держится на громкости, пропала бы.
 */
const PEAK_CEILING = 0.9

/**
 * Общий множитель.
 *
 * Подобран по замеру в браузере: с ним самая громкая фраза из
 * двадцати четырёх (Алиева, радость) выходит на 0.84, то есть ниже
 * потолка. Ограничитель поэтому в обычной жизни не срабатывает вовсе
 * и остаётся страховкой — а разница громкости между интонациями,
 * от недовольного 0.52 до радостного 0.84, доходит до слуха целиком.
 */
const OUTPUT_GAIN = 0.35

interface OfflineContextCarrier {
  readonly OfflineAudioContext?: typeof OfflineAudioContext
  readonly webkitOfflineAudioContext?: typeof OfflineAudioContext
}

function offlineContextClass(): typeof OfflineAudioContext | null {
  if (typeof globalThis === 'undefined') return null
  const carrier = globalThis as unknown as OfflineContextCarrier
  return carrier.OfflineAudioContext ?? carrier.webkitOfflineAudioContext ?? null
}

/**
 * Волна голосовой щели: гармоники спадают как 1/n², то есть −12 дБ/окт.
 *
 * Это самое важное место всей схемы. Обычная пила (1/n, −6 дБ/окт)
 * звучит жужжаще, а синус, как в mumble-voice-lab, не даёт формантам
 * материала вовсе — форманты нечего формировать, и получается
 * пиликанье Animal Crossing вместо бормотания.
 */
function glottalWave(ctx: BaseAudioContext): PeriodicWave {
  const real = new Float32Array(HARMONICS + 1)
  const imag = new Float32Array(HARMONICS + 1)
  for (let n = 1; n <= HARMONICS; n++) imag[n] = 1 / (n * n)
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false })
}

/** Секунда белого шума: одна на весь рендер, читается с разных мест. */
function noiseBuffer(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
  return buffer
}

/**
 * Импульсный отклик комнаты.
 *
 * Пятнадцать строк вместо скачанного файла — и вместе с файлом отпадает
 * вопрос о его лицензии (research/assets-audio.md, §1.6). `damping` —
 * это материал стен: чем больше, тем сильнее съедаются верха.
 */
function roomImpulse(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * ROOM_SECONDS))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let low = 0
  let peak = 1e-9
  for (let i = 0; i < length; i++) {
    const t = i / length
    const sample = (random() * 2 - 1) * Math.pow(1 - t, ROOM_DECAY)
    low += (sample - low) * ROOM_DAMPING
    data[i] = low
    peak = Math.max(peak, Math.abs(low))
  }
  for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) / peak
  return buffer
}

function curvePoints(seconds: number): number {
  return Math.max(MIN_CURVE_POINTS, Math.round(seconds * CURVE_RESOLUTION))
}

/** Плавная ступенька: она же smoothstep. Без рывков на краях огибающей. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Огибающая громкости слога.
 *
 * Плавная атака, лёгкое проседание к концу, плавный спад. Проседание
 * важнее, чем кажется: ровная полка звучит органом, а живой голос
 * всегда чуть теряет опору к концу слога.
 */
function amplitudeCurve(
  seconds: number,
  attack: number,
  release: number,
  scale: number,
): Float32Array {
  const points = curvePoints(seconds)
  const curve = new Float32Array(points)
  const droop = 0.15
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * seconds
    if (t < attack) {
      curve[i] = smoothstep(t / attack) * scale
    } else if (t > seconds - release) {
      const p = (t - (seconds - release)) / release
      curve[i] = (1 - droop) * (1 - smoothstep(p)) * scale
    } else {
      const body = Math.max(1e-6, seconds - attack - release)
      curve[i] = (1 - droop * ((t - attack) / body)) * scale
    }
  }
  return curve
}

/**
 * Кривая основного тона: три точки контура плюс дрожание.
 *
 * Точки соединяются геометрически, а не линейно: слух логарифмичен, и
 * линейная интерполяция по герцам слышна как ускорение к концу подъёма.
 * Дрожание — медленное случайное блуждание; ровно оно отличает голос
 * от синтезаторной подкладки.
 */
function pitchCurve(
  syllable: SyllablePlan,
  seconds: number,
  jitter: number,
  random: () => number,
): Float32Array {
  const points = curvePoints(seconds)
  const curve = new Float32Array(points)
  const [start, middle, end] = syllable.pitch
  let walk = 0
  for (let i = 0; i < points; i++) {
    const p = i / (points - 1)
    const value =
      p < 0.5
        ? start * Math.pow(middle / start, p * 2)
        : middle * Math.pow(end / middle, (p - 0.5) * 2)
    // Блуждание с возвратом к нулю: без возврата тон уползает за фразу.
    walk = walk * 0.985 + (random() - 0.5) * 0.35
    curve[i] = Math.max(30, value * (1 + jitter * Math.tanh(walk)))
  }
  return curve
}

/**
 * Кривая форманты и её добротности.
 *
 * Форманта едет от локуса согласного к цели гласного за первые ~48 мс —
 * это и есть коартикуляция, приём, без которого всё остальное звучит
 * органом. К концу слога тракт слегка расслабляется в сторону нейтрали.
 */
function formantCurves(
  syllable: SyllablePlan,
  seconds: number,
  index: number,
): { frequency: Float32Array; q: Float32Array } {
  const points = curvePoints(seconds)
  const frequency = new Float32Array(points)
  const q = new Float32Array(points)
  const target = [syllable.vowel.f1, syllable.vowel.f2, syllable.vowel.f3][index] ?? 700
  const locus = syllable.locus === null
    ? null
    : [syllable.locus.f1, syllable.locus.f2, syllable.locus.f3][index] ?? null
  const bandwidth = FORMANT_BANDWIDTHS[index] ?? 100
  const glideEnd = syllable.consonantSeconds + GLIDE_SECONDS
  const relaxStart = Math.max(glideEnd, seconds - RELAX_SECONDS)
  const relaxTarget = target * (0.94 + 0.03 * index)

  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * seconds
    let value = target
    if (locus !== null && t < glideEnd && glideEnd > 0) {
      value = locus * Math.pow(target / locus, t / glideEnd)
    } else if (t > relaxStart && seconds > relaxStart) {
      const p = (t - relaxStart) / (seconds - relaxStart)
      value = target * Math.pow(relaxTarget / target, p)
    }
    frequency[i] = value
    q[i] = Math.min(Math.max(value / bandwidth, 1), MAX_Q)
  }
  return { frequency, q }
}

/** Источник шума с произвольного места буфера: два «ш» подряд не близнецы. */
function noiseSource(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  at: number,
  seconds: number,
  random: () => number,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const offset = random() * Math.max(0, buffer.duration - seconds - 0.01)
  source.start(at, offset, seconds)
  return source
}

function biquad(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  gain = 0,
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  filter.gain.value = gain
  return filter
}

/** Разложить один слог по узлам и подключить к шине фразы. */
function renderSyllable(
  ctx: BaseAudioContext,
  plan: PhrasePlan,
  syllable: SyllablePlan,
  bus: AudioNode,
  wave: PeriodicWave,
  noise: AudioBuffer,
  random: () => number,
): void {
  const total = syllable.consonantSeconds + syllable.vowelSeconds
  if (total <= 0) return
  const onset = syllable.onset
  const plosive = onset?.kind === 'plosive'
  // У взрывного сначала смычка — тишина, и только потом голос. Именно
  // тишина перед всплеском делает «т» похожим на «т».
  const voicedAt = plosive ? syllable.at + syllable.consonantSeconds : syllable.at
  const voicedSeconds = plosive ? syllable.vowelSeconds : total
  if (voicedSeconds <= 0) return

  // ── Звонкая ветка ──
  const osc = ctx.createOscillator()
  osc.setPeriodicWave(wave)
  osc.frequency.setValueCurveAtTime(
    pitchCurve(syllable, voicedSeconds, plan.jitter, random),
    voicedAt,
    voicedSeconds,
  )

  const voiced = ctx.createGain()
  voiced.gain.value = 1 - plan.breath
  osc.connect(voiced)

  const filters: BiquadFilterNode[] = []
  for (let index = 0; index < 3; index++) {
    const filter = biquad(ctx, 'peaking', 700, 1, FORMANT_GAINS[index] ?? 13)
    const curves = formantCurves(syllable, voicedSeconds, index)
    filter.frequency.setValueCurveAtTime(curves.frequency, voicedAt, voicedSeconds)
    filter.Q.setValueCurveAtTime(curves.q, voicedAt, voicedSeconds)
    filters.push(filter)
  }

  const tilt = biquad(ctx, 'lowpass', plan.tilt, 0.7)
  if (onset?.kind === 'nasal') {
    // Носовой мурмур: пока рот закрыт, наружу выходит только низ.
    tilt.frequency.setValueAtTime(NASAL_HZ, syllable.at)
    tilt.frequency.exponentialRampToValueAtTime(
      plan.tilt,
      syllable.at + syllable.consonantSeconds + 0.012,
    )
  }
  const highpass = biquad(ctx, 'highpass', HIGHPASS_HZ, 0.7)

  const envelope = ctx.createGain()
  envelope.gain.value = 0
  const level = plan.gain * (syllable.stressed ? 1.18 : 1)
  const curve = amplitudeCurve(voicedSeconds, onset === null ? 0.012 : 0.008, 0.045, level)
  envelope.gain.setValueCurveAtTime(curve, voicedAt, voicedSeconds)

  voiced.connect(filters[0]!)
  filters[0]!.connect(filters[1]!)
  filters[1]!.connect(filters[2]!)
  filters[2]!.connect(tilt)
  tilt.connect(highpass)
  highpass.connect(envelope)
  envelope.connect(bus)

  // Придыхание подмешивается в источник, а не поверх: оно должно
  // пройти через тот же тракт, иначе слышно шипение рядом с голосом,
  // а не дыхание внутри него.
  if (plan.breath > 0.001) {
    const breath = noiseSource(ctx, noise, voicedAt, voicedSeconds, random)
    const breathGain = ctx.createGain()
    breathGain.gain.value = plan.breath * 0.5
    breath.connect(breathGain)
    breathGain.connect(filters[0]!)
    breath.stop(voicedAt + voicedSeconds)
  }

  osc.start(voicedAt)
  osc.stop(voicedAt + voicedSeconds)

  // ── Шумовая ветка ──
  const band = onset?.noise ?? null
  if (onset === null || band === null) return

  if (plosive) {
    const burstAt = Math.max(0, syllable.at + syllable.consonantSeconds - BURST_SECONDS)
    const burst = noiseSource(ctx, noise, burstAt, BURST_SECONDS, random)
    const burstFilter = biquad(ctx, 'bandpass', band.frequency, band.q)
    const burstGain = ctx.createGain()
    burstGain.gain.setValueAtTime(onset.amplitude * plan.gain, burstAt)
    burstGain.gain.exponentialRampToValueAtTime(0.0001, burstAt + BURST_SECONDS)
    burst.connect(burstFilter)
    burstFilter.connect(burstGain)
    burstGain.connect(bus)
    burst.stop(burstAt + BURST_SECONDS)

    // Придыхание после взрыва, затекающее в гласный.
    const aspirationSeconds = Math.min(syllable.vowelSeconds, ASPIRATION_SECONDS)
    const aspiration = noiseSource(ctx, noise, voicedAt, aspirationSeconds, random)
    const aspirationFilter = biquad(ctx, 'bandpass', band.frequency * 0.8, 1)
    const aspirationGain = ctx.createGain()
    aspirationGain.gain.setValueAtTime(onset.amplitude * 0.35 * plan.gain, voicedAt)
    aspirationGain.gain.linearRampToValueAtTime(0, voicedAt + aspirationSeconds)
    aspiration.connect(aspirationFilter)
    aspirationFilter.connect(aspirationGain)
    aspirationGain.connect(bus)
    aspiration.stop(voicedAt + aspirationSeconds)
    return
  }

  const seconds = syllable.consonantSeconds
  if (seconds <= 0) return
  const source = noiseSource(ctx, noise, syllable.at, seconds, random)
  const filter = biquad(ctx, 'bandpass', band.frequency, band.q)
  const gain = ctx.createGain()
  gain.gain.value = 0
  const shape = amplitudeCurve(seconds, 0.01, 0.018, onset.amplitude * plan.gain)
  gain.gain.setValueCurveAtTime(shape, syllable.at, seconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(bus)
  source.stop(syllable.at + seconds)
}

/** Прижать пик к потолку, если фраза в него упёрлась. */
function limitPeak(buffer: AudioBuffer): void {
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i] ?? 0)
      if (value > peak) peak = value
    }
  }
  if (peak <= PEAK_CEILING || peak === 0) return
  const scale = PEAK_CEILING / peak
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * scale
  }
}

/**
 * Отрендерить фразу.
 *
 * Возвращает null, если рендер невозможен: нет OfflineAudioContext,
 * фраза пустая, браузер отказал. Молчание — законный исход, реплика
 * просто прочитается глазами.
 */
export async function renderPhrase(
  plan: PhrasePlan,
  sampleRate: number,
): Promise<AudioBuffer | null> {
  if (plan.syllables.length === 0 || plan.seconds <= 0) return null
  const Ctor = offlineContextClass()
  if (Ctor === null) return null

  const total = plan.seconds + TAIL_SECONDS
  const frames = Math.ceil(total * sampleRate)
  if (frames <= 0) return null

  try {
    const ctx = new Ctor(1, frames, sampleRate)
    const random = makeRandom(plan.seed ^ 0x9e3779b9)
    const wave = glottalWave(ctx)
    const noise = noiseBuffer(ctx, random)

    // Сухой и мокрый сигналы идут параллельно: конволвер отдаёт только
    // отражения, и без сухой ветки голос звучал бы из соседней комнаты.
    const bus = ctx.createGain()
    bus.gain.value = OUTPUT_GAIN
    const dry = ctx.createGain()
    dry.gain.value = 1 - ROOM_WET
    const wet = ctx.createGain()
    wet.gain.value = ROOM_WET
    const convolver = ctx.createConvolver()
    convolver.normalize = true
    convolver.buffer = roomImpulse(ctx, random)
    bus.connect(dry)
    dry.connect(ctx.destination)
    bus.connect(convolver)
    convolver.connect(wet)
    wet.connect(ctx.destination)

    for (const syllable of plan.syllables) {
      renderSyllable(ctx, plan, syllable, bus, wave, noise, random)
    }

    const rendered = await ctx.startRendering()
    limitPeak(rendered)
    return rendered
  } catch {
    // Браузер не осилил рендер: реплика останется беззвучной, и это
    // лучше исключения в консоли посреди разговора.
    return null
  }
}

import type { SynthId } from './catalog'

/**
 * Звуки, которых нет файлами.
 *
 * Граница проведена разведкой (research/assets-audio.md, §2.1) и звучит
 * так: узнаваемые предметные события — записью, чистые тоны и щелчки —
 * кодом. Смыв или скрип стула синтезом не подделать, а звонок, щелчок
 * интерфейса и две ноты оценки — это ровно осциллятор с огибающей,
 * и запись тут была бы двумя лишними килобайтами и чужой акустикой
 * поверх нашей.
 *
 * Всё здесь — короткоживущие узлы: создаются, звучат, сами себя
 * отсоединяют. Ни одного узла, живущего между звуками, нет нарочно —
 * иначе их пришлось бы считать и чистить.
 */

/**
 * Белый шум на секунду. Один буфер на контекст: пересоздавать его
 * на каждый щелчок — это 44 тысячи вызовов Math.random впустую.
 */
const NOISE = new WeakMap<BaseAudioContext, AudioBuffer>()

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = NOISE.get(ctx)
  if (cached !== undefined) return cached
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  NOISE.set(ctx, buffer)
  return buffer
}

/** Огибающая: мгновенная атака, экспоненциальный спад. */
function envelope(
  ctx: BaseAudioContext,
  when: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, when)
  gain.gain.linearRampToValueAtTime(peak, when + attack)
  // exponentialRamp не умеет приходить в ноль: ведём почти в ноль,
  // потом обрубаем. Слышимой разницы нет, а щелчка в конце — тоже.
  gain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-4), when + attack + decay)
  gain.gain.linearRampToValueAtTime(0, when + attack + decay + 0.01)
  return gain
}

/** Одна нота. `type` — форма волны, `detune` — расстройка в центах. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  type: OscillatorType,
  frequency: number,
  when: number,
  peak: number,
  attack: number,
  decay: number,
): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, when)
  const gain = envelope(ctx, when, peak, attack, decay)
  osc.connect(gain)
  gain.connect(out)
  osc.start(when)
  osc.stop(when + attack + decay + 0.05)
  osc.onended = (): void => {
    gain.disconnect()
  }
}

/** Порция шума через полосовой фильтр: щелчки, стуки, придыхание. */
function noise(
  ctx: BaseAudioContext,
  out: AudioNode,
  frequency: number,
  q: number,
  when: number,
  peak: number,
  decay: number,
): void {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(frequency, when)
  filter.Q.setValueAtTime(q, when)
  const gain = envelope(ctx, when, peak, 0.002, decay)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  source.start(when)
  source.stop(when + decay + 0.06)
  source.onended = (): void => {
    filter.disconnect()
    gain.disconnect()
  }
}

/**
 * Звонок.
 *
 * Электрический звонок — это не одна нота, а неровный набор обертонов
 * поверх основного тона: 2.76 и 5.4 — классические отношения для
 * колокола, от гармонического ряда они отличаются нарочно, иначе выходит
 * не звонок, а орган. Два удара подряд: одиночный звонок звучит
 * будильником, а не концом пары.
 */
function bell(ctx: BaseAudioContext, out: AudioNode, when: number): void {
  const partials: readonly (readonly [number, number])[] = [
    [1, 0.5],
    [2.0, 0.28],
    [2.76, 0.2],
    [5.4, 0.09],
  ]
  for (const strike of [0, 0.62]) {
    for (const [ratio, level] of partials) {
      tone(ctx, out, 'sine', 660 * ratio, when + strike, level, 0.004, 1.1 / ratio)
    }
    // Металлический призвук: без него обертоны звучат слишком чисто.
    noise(ctx, out, 3400, 3, when + strike, 0.12, 0.09)
  }
}

/** Щелчок интерфейса. Тише всего в игре: он звучит на каждое нажатие. */
function click(ctx: BaseAudioContext, out: AudioNode, when: number): void {
  noise(ctx, out, 2600, 1.4, when, 0.5, 0.018)
  tone(ctx, out, 'triangle', 1180, when, 0.2, 0.001, 0.03)
}

/** Стук автомата: банка упала в лоток. */
function clunk(ctx: BaseAudioContext, out: AudioNode, when: number): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(180, when)
  osc.frequency.exponentialRampToValueAtTime(58, when + 0.14)
  const gain = envelope(ctx, when, 0.7, 0.002, 0.18)
  osc.connect(gain)
  gain.connect(out)
  osc.start(when)
  osc.stop(when + 0.25)
  osc.onended = (): void => {
    gain.disconnect()
  }
  noise(ctx, out, 900, 0.9, when, 0.3, 0.05)
  noise(ctx, out, 260, 1.6, when + 0.1, 0.18, 0.12)
}

/**
 * Гонг перед выступлением: полсекунды на то, чтобы все замолчали
 * и повернулись. Восходящая квинта — самый короткий способ сказать
 * «сейчас что-то будет», не сказав, чем это кончится.
 */
function attention(ctx: BaseAudioContext, out: AudioNode, when: number): void {
  tone(ctx, out, 'sine', 294, when, 0.34, 0.06, 0.5)
  tone(ctx, out, 'sine', 441, when + 0.06, 0.26, 0.06, 0.55)
  tone(ctx, out, 'triangle', 882, when + 0.06, 0.06, 0.08, 0.4)
}

/** Оценка. Вверх по трезвучию — получилось, вниз и ниже — нет. */
function grade(ctx: BaseAudioContext, out: AudioNode, when: number, good: boolean): void {
  const notes = good ? [523, 659, 784] : [392, 349, 294]
  const step = good ? 0.11 : 0.17
  notes.forEach((frequency, index) => {
    const last = index === notes.length - 1
    tone(ctx, out, 'sine', frequency, when + index * step, good ? 0.3 : 0.26, 0.01, last ? 0.7 : 0.2)
  })
}

/**
 * Издать синтезированный звук.
 *
 * @param when время звукового контекста, не раньше `ctx.currentTime`.
 * @param gain итоговая громкость: настройки, каталог и расстояние
 *   уже перемножены снаружи.
 */
export function playSynth(
  ctx: BaseAudioContext,
  destination: AudioNode,
  id: SynthId,
  when: number,
  gain: number,
): void {
  if (gain <= 0) return
  const bus = ctx.createGain()
  bus.gain.setValueAtTime(gain, when)
  bus.connect(destination)

  switch (id) {
    case 'click':
      click(ctx, bus, when)
      break
    case 'bell':
      bell(ctx, bus, when)
      break
    case 'clunk':
      clunk(ctx, bus, when)
      break
    case 'attention':
      attention(ctx, bus, when)
      break
    case 'grade-good':
      grade(ctx, bus, when, true)
      break
    case 'grade-bad':
      grade(ctx, bus, when, false)
      break
  }

  // Общая шина живёт чуть дольше самого длинного хвоста и отцепляется
  // сама: считать оставшиеся узлы не нужно, они уже остановлены.
  if (typeof setTimeout === 'function') {
    const alive = (when - ctx.currentTime + 2.6) * 1000
    setTimeout(() => bus.disconnect(), Math.max(0, alive))
  }
}

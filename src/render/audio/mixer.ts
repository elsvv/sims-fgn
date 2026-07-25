import type { Vec2 } from '../../sim/types'
import { AMBIENCE_LAYERS, MUSIC_TRACKS, SOUNDS, isSynth, type AmbienceId } from './catalog'
import {
  AMBIENCE_FADE_IN,
  AMBIENCE_FADE_OUT,
  MUSIC_FADE_IN,
  MUSIC_FADE_OUT,
  planCrossfade,
  type FadePoint,
} from './crossfade'
import { positionalGain } from './distance'
import type { SoundCue, VoiceCue } from './events'
import { planPhrase, type PhrasePlan } from './phrase'
import { renderPhrase } from './simlish'
import { voiceFor } from './voices'
import {
  AUDIO_BUSES,
  DEFAULT_AUDIO_SETTINGS,
  busVolume,
  type AudioBus,
  type AudioSettings,
} from './settings'
import { playSynth } from './synth'

/**
 * Проигрыватель.
 *
 * Четыре решения, из которых следует всё остальное:
 *
 * 1. **Браузер не даёт играть звук до первого действия человека.**
 *    AudioContext поэтому не создаётся при загрузке страницы — только
 *    внутри обработчика клика, из unlock(). До этого проигрыватель молча
 *    запоминает, чего от него хотели, и включает это потом. Ни одного
 *    сообщения в консоль: запрет автозапуска — норма, а не ошибка.
 *
 * 2. **Музыка и атмосфера живут по-разному.** Музыка — длинный файл,
 *    её тянет <audio> потоком: не надо ждать загрузки целиком и не надо
 *    держать в памяти распакованный звук. Атмосфера — короткая петля,
 *    её удобнее держать распакованной: AudioBufferSourceNode зацикливает
 *    без стыка, а <audio> на стыке спотыкается. Отсюда же потолок длины
 *    петли в сборщике: распакованная минута стерео весит двадцать
 *    мегабайт памяти.
 *
 * 3. **Любая ошибка проглатывается.** Нет файла, нет сети, нет Web Audio,
 *    вкладка без звука — игра идёт молча и не падает. Звук здесь
 *    украшение, и ни одна его неудача не имеет права стоить игроку хода.
 *
 * 4. **Расстояние решается здесь, а не PannerNode.** Причина — в
 *    distance.ts: камера вращается, и настоящая панорама разъехалась бы
 *    со сценой. Громкость же от поворота камеры не зависит.
 */

interface MusicVoice {
  readonly id: string
  readonly element: HTMLAudioElement
  readonly source: MediaElementAudioSourceNode
  readonly gain: GainNode
}

interface AmbienceVoice {
  readonly id: AmbienceId
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
}

interface SpeakingVoice {
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
}

/** Сколько отрендеренных вокализов держать в памяти. */
const VOICE_CACHE_LIMIT = 96

/** Safari до 14.1 знал только префиксный конструктор. */
interface AudioContextCarrier {
  readonly AudioContext?: typeof AudioContext
  readonly webkitAudioContext?: typeof AudioContext
}

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const carrier = window as unknown as AudioContextCarrier
  return carrier.AudioContext ?? carrier.webkitAudioContext ?? null
}

/** Разложить расписание громкостей по параметру узла. */
function applyFade(param: AudioParam, points: readonly FadePoint[]): void {
  const first = points[0]
  if (first === undefined) return
  param.cancelScheduledValues(first.at)
  param.setValueAtTime(first.gain, first.at)
  for (const point of points.slice(1)) {
    param.linearRampToValueAtTime(point.gain, point.at)
  }
}

export class AudioMixer {
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Record<AudioBus, GainNode> | null = null

  /**
   * Насколько приглушены музыка и атмосфера. Отдельно от настроек:
   * это временное состояние сцены, а не то, что игрок покрутил.
   */
  private duck = 1

  /**
   * Проигрыватель закрыт. Флаг снимается следующим unlock(): в режиме
   * разработки React монтирует дерево дважды, и закрытый навсегда
   * проигрыватель означал бы тишину до перезагрузки страницы.
   */
  private closed = false

  /** Чего от нас хотят. Может быть задано задолго до разрешения на звук. */
  private wantedMusic: string | null = null
  private wantedAmbience: AmbienceId | null = null

  private music: MusicVoice | null = null
  private ambience: AmbienceVoice | null = null
  private speaking: SpeakingVoice | null = null

  /**
   * Номер текущей попытки заговорить. Растёт с каждым вокализом и
   * отсекает те, что отрендерились с опозданием: говорить должен
   * последний, кого попросили, а не последний, кто успел.
   */
  private speechTurn = 0

  /**
   * До какого времени контекста голос занят.
   *
   * Одного `speaking` мало: вокализ с задержкой (ответ преподавателя
   * после оценки) уже назначен, но узел ещё не заиграл, — а место
   * занято, и приветствие туда лезть не должно.
   */
  private speakingUntil = 0

  /** Распакованный звук по пути к файлу. */
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>()

  /**
   * Отрендеренные вокализы по ключу «кто, как, сколько, зерно».
   *
   * Синтез двухсекундной фразы занимает единицы миллисекунд, но одна
   * и та же реплика в игре показывается не раз и не два — сцену
   * переигрывают, разговор перечитывают. Второй раз она достаётся
   * из памяти мгновенно.
   */
  private readonly voices = new Map<string, Promise<AudioBuffer | null>>()

  constructor(settings: AudioSettings = DEFAULT_AUDIO_SETTINGS) {
    this.settings = settings
  }

  /** Есть ли разрешение на звук. */
  isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /**
   * Часы звукового слоя, секунды.
   *
   * Это время звукового контекста, а не системное, и разница
   * принципиальна: контекст стоит, пока нет разрешения на звук, и
   * останавливается вместе со свёрнутой вкладкой. Расписание музыки
   * и шагов, построенное на нём, не отматывается вперёд за то время,
   * которое игра простояла молча.
   */
  now(): number {
    return this.ctx?.currentTime ?? 0
  }

  /**
   * Разрешение на звук. Зовётся строго из обработчика действия человека:
   * клика, касания, нажатия клавиши. Повторные вызовы безвредны.
   */
  unlock(): void {
    this.closed = false
    if (this.ctx === null) {
      const Ctor = audioContextClass()
      if (Ctor === null) return
      try {
        const ctx = new Ctor()
        const master = ctx.createGain()
        master.connect(ctx.destination)
        const buses: Record<AudioBus, GainNode> = {
          music: ctx.createGain(),
          ambience: ctx.createGain(),
          sfx: ctx.createGain(),
          voice: ctx.createGain(),
        }
        for (const bus of AUDIO_BUSES) buses[bus].connect(master)
        this.ctx = ctx
        this.master = master
        this.buses = buses
        this.pushGains(0)
        // Разовые звуки и голоса вместе весят полмегабайта: тянем их
        // сразу, чтобы первый шаг не пришёлся на ожидание запроса.
        this.warmUp()
      } catch {
        return
      }
    }

    const ctx = this.ctx
    if (ctx === null) return
    if (ctx.state !== 'running') {
      void ctx.resume().then(
        () => this.sync(),
        () => {
          // Разрешения всё ещё нет: подождём следующего действия.
        },
      )
      return
    }
    this.sync()
  }

  applySettings(settings: AudioSettings): void {
    this.settings = settings
    this.pushGains(0.12)
    // Выключенный звук ничего не качает: включат — тогда и загрузим.
    this.sync()
  }

  /** Приглушение фона под разговор. 1 — не приглушать. */
  setDuck(value: number): void {
    if (value === this.duck) return
    this.duck = value
    this.pushGains(0.35)
  }

  setMusic(trackId: string | null): void {
    this.wantedMusic = trackId
    this.syncMusic()
  }

  setAmbience(layer: AmbienceId | null): void {
    this.wantedAmbience = layer
    this.syncAmbience()
  }

  /**
   * Издать разовый звук.
   *
   * @param listener где стоит персонаж: от него считается расстояние.
   */
  play(cue: SoundCue, listener: Vec2): void {
    const ctx = this.ctx
    const buses = this.buses
    if (ctx === null || buses === null) return
    if (busVolume(this.settings, 'sfx') <= 0) return

    const definition = SOUNDS[cue.id]
    const gain = definition.gain * positionalGain(listener, cue.at)
    if (gain <= 0.002) return

    const when = ctx.currentTime + Math.max(0, cue.delay)
    if (isSynth(cue.id)) {
      playSynth(ctx, buses.sfx, cue.id, when, gain)
      return
    }
    if (definition.src !== null) this.playBuffer(definition.src, buses.sfx, gain, when)
  }

  /**
   * Вокализ под реплику.
   *
   * Предыдущий обрывается: говорят по очереди, и при быстрой промотке
   * реплик голос не должен наложиться сам на себя. Сторожит это не
   * только stopSpeaking, но и счётчик `speechTurn`: синтез идёт не
   * мгновенно, и две реплики подряд могут отрендериться в обратном
   * порядке — тогда опоздавшая обязана промолчать, а не заговорить
   * поверх той, что уже звучит.
   *
   * @param listener где стоит игрок: далёкий преподаватель не слышен.
   */
  speak(voice: VoiceCue, listener: Vec2): void {
    const ctx = this.ctx
    const buses = this.buses
    if (ctx === null || buses === null) return
    if (busVolume(this.settings, 'voice') <= 0) return

    // Далёкий преподаватель не слышен: коридор длинный, а голос — не
    // звонок, он не обязан доставать до другого конца этажа.
    const distance = positionalGain(listener, voice.at)
    if (distance <= 0.02) return

    // Приветствие не лезет поверх того, кто уже говорит: на быстрой
    // промотке шестеро здоровались бы наперебой.
    if (!voice.interrupts && this.isSpeaking()) return

    const preset = voiceFor(voice.voiceId)
    if (preset === null) return

    const turn = ++this.speechTurn
    const plan = planPhrase(preset, voice.emotion, voice.syllables, voice.seed)
    void this.renderVoice(plan, ctx.sampleRate).then(
      (buffer) => {
        // Пока рендерили, могли начать говорить что-то ещё, выключить
        // звук или закрыть игру.
        if (buffer === null || this.closed || this.ctx !== ctx) return
        if (turn !== this.speechTurn) return
        if (busVolume(this.settings, 'voice') <= 0) return
        // Проверка повторяется: пока синтезировали, заговорить мог
        // кто-то ещё, и уступить надо ему.
        if (!voice.interrupts && this.isSpeaking()) return
        this.stopSpeaking()
        try {
          const source = ctx.createBufferSource()
          source.buffer = buffer
          const gain = ctx.createGain()
          gain.gain.value = distance
          source.connect(gain)
          gain.connect(buses.voice)
          const current: SpeakingVoice = { source, gain }
          source.onended = (): void => {
            if (this.speaking === current) this.speaking = null
            gain.disconnect()
          }
          this.speaking = current
          const startAt = ctx.currentTime + Math.max(0, voice.delay)
          this.speakingUntil = startAt + buffer.duration
          source.start(startAt)
        } catch {
          // Контекст закрылся между рендером и запуском: реплика
          // прочитается молча, и это лучше исключения в консоли.
          this.speaking = null
        }
      },
    )
  }

  /** Всё остановить и отпустить. */
  dispose(): void {
    this.closed = true
    this.stopSpeaking()
    this.stopMusicNow()
    this.stopAmbienceNow()
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.buses = null
    this.buffers.clear()
    // Отрендеренные вокализы привязаны к частоте дискретизации того
    // контекста, в котором сделаны: следующий может открыться с другой,
    // и старые записи в нём зазвучали бы не тем голосом.
    this.voices.clear()
    if (ctx !== null) void ctx.close().catch(() => undefined)
  }

  // ── Внутреннее ────────────────────────────────────────────────

  private sync(): void {
    this.syncMusic()
    this.syncAmbience()
  }

  /** Разложить настройки и приглушение по шинам. */
  private pushGains(rampSeconds: number): void {
    const ctx = this.ctx
    const buses = this.buses
    const master = this.master
    if (ctx === null || buses === null || master === null) return
    const now = ctx.currentTime
    const set = (param: AudioParam, value: number): void => {
      if (rampSeconds <= 0) {
        param.setValueAtTime(value, now)
        return
      }
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
      param.linearRampToValueAtTime(value, now + rampSeconds)
    }
    set(master.gain, this.settings.enabled ? 1 : 0)
    for (const bus of AUDIO_BUSES) {
      // Приглушается фон, а не всё подряд: голос под разговор глушить
      // незачем, ради него разговор и приглушают.
      const duck = bus === 'music' || bus === 'ambience' ? this.duck : 1
      set(buses[bus].gain, busVolume(this.settings, bus) * duck)
    }
  }

  private targetMusic(): string | null {
    return busVolume(this.settings, 'music') > 0 ? this.wantedMusic : null
  }

  private targetAmbience(): AmbienceId | null {
    return busVolume(this.settings, 'ambience') > 0 ? this.wantedAmbience : null
  }

  private syncMusic(): void {
    const ctx = this.ctx
    const buses = this.buses
    if (ctx === null || buses === null) return
    const wanted = this.targetMusic()
    const next = wanted === null ? undefined : MUSIC_TRACKS[wanted]
    const plan = planCrossfade({
      now: ctx.currentTime,
      current: this.music?.id ?? null,
      next: next?.id ?? null,
      currentGain: this.music?.gain.gain.value ?? 0,
      targetGain: next?.gain ?? 1,
      fadeOut: MUSIC_FADE_OUT,
      fadeIn: MUSIC_FADE_IN,
    })
    if (plan.kind === 'keep') {
      // Тот же трек: если браузер его приостановил, толкнуть.
      const playing = this.music
      if (playing !== null && playing.element.paused) {
        void playing.element.play().catch(() => undefined)
      }
      return
    }

    if (plan.kind === 'stop' || plan.kind === 'swap') {
      const going = this.music
      this.music = null
      if (going !== null) {
        applyFade(going.gain.gain, plan.out)
        this.retireMusic(going, plan.stopAt - ctx.currentTime)
      }
    }

    if ((plan.kind === 'start' || plan.kind === 'swap') && next !== undefined) {
      const started = this.startMusic(next.id, next.src)
      if (started !== null) applyFade(started.gain.gain, plan.in)
    }
  }

  private startMusic(id: string, src: string): MusicVoice | null {
    const ctx = this.ctx
    const buses = this.buses
    if (ctx === null || buses === null) return null
    try {
      const element = new Audio()
      element.src = src
      // Трек не зациклен нарочно: паузами между повторами распоряжается
      // music.ts, иначе музыка играла бы без перерыва и приедалась.
      element.loop = false
      element.preload = 'auto'
      const source = ctx.createMediaElementSource(element)
      const gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(buses.music)
      void element.play().catch(() => {
        // Разрешения ещё нет: включится на следующем действии игрока.
      })
      const voice: MusicVoice = { id, element, source, gain }
      this.music = voice
      return voice
    } catch {
      return null
    }
  }

  private retireMusic(voice: MusicVoice, afterSeconds: number): void {
    const stop = (): void => {
      try {
        voice.element.pause()
        voice.element.removeAttribute('src')
        voice.element.load()
      } catch {
        // Элемент уже мёртв.
      }
      voice.source.disconnect()
      voice.gain.disconnect()
    }
    if (typeof setTimeout !== 'function') {
      stop()
      return
    }
    setTimeout(stop, Math.max(0, afterSeconds) * 1000 + 80)
  }

  private syncAmbience(): void {
    const ctx = this.ctx
    if (ctx === null) return
    const wanted = this.targetAmbience()

    // Гасить можно сразу, а включать — только когда звук распакован,
    // иначе кроссфейд начнётся раньше, чем появится что фейдить.
    const going = this.ambience
    if (going !== null && going.id !== wanted) {
      const plan = planCrossfade({
        now: ctx.currentTime,
        current: going.id,
        next: null,
        currentGain: going.gain.gain.value,
        targetGain: 0,
        fadeOut: AMBIENCE_FADE_OUT,
        fadeIn: AMBIENCE_FADE_IN,
      })
      if (plan.kind === 'stop') {
        this.ambience = null
        applyFade(going.gain.gain, plan.out)
        this.retireAmbience(going, plan.stopAt)
      }
    }

    if (wanted === null || this.ambience?.id === wanted) return
    const layer = AMBIENCE_LAYERS[wanted]

    void this.loadBuffer(layer.src).then((buffer) => {
      if (buffer === null || this.closed) return
      const context = this.ctx
      const buses = this.buses
      // Пока грузили, игрок мог уйти в другую комнату — и вернуться.
      if (context !== ctx || buses === null) return
      if (this.targetAmbience() !== wanted || this.ambience?.id === wanted) return

      try {
        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        const gain = context.createGain()
        gain.gain.value = 0
        source.connect(gain)
        gain.connect(buses.ambience)
        source.start()
        const now = context.currentTime
        applyFade(gain.gain, [
          { at: now, gain: 0 },
          { at: now + AMBIENCE_FADE_IN, gain: layer.gain },
        ])
        this.ambience = { id: wanted, source, gain }
      } catch {
        // Контекст закрылся: тишина, и ничего страшного.
      }
    })
  }

  private retireAmbience(voice: AmbienceVoice, stopAt: number): void {
    voice.source.onended = (): void => {
      voice.gain.disconnect()
    }
    try {
      voice.source.stop(stopAt)
    } catch {
      // Уже остановлен.
    }
  }

  /** Разовый звук из распакованного файла. */
  private playBuffer(src: string, destination: AudioNode, gain: number, when: number): void {
    const ctx = this.ctx
    if (ctx === null) return
    void this.loadBuffer(src).then((buffer) => {
      if (buffer === null || this.closed || this.ctx !== ctx) return
      try {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        const node = ctx.createGain()
        node.gain.value = gain
        source.connect(node)
        node.connect(destination)
        source.onended = (): void => {
          node.disconnect()
        }
        // Пока файл распаковывался, назначенный момент мог пройти:
        // тогда звучит сейчас, а не в прошлом.
        source.start(Math.max(when, ctx.currentTime))
      } catch {
        // Контекст закрылся между загрузкой и запуском.
      }
    })
  }

  /** Говорит ли кто-нибудь прямо сейчас или вот-вот заговорит. */
  private isSpeaking(): boolean {
    if (this.speaking !== null) return true
    const ctx = this.ctx
    return ctx !== null && ctx.currentTime < this.speakingUntil
  }

  private stopSpeaking(): void {
    const current = this.speaking
    const ctx = this.ctx
    this.speakingUntil = 0
    if (current === null || ctx === null) return
    this.speaking = null
    const now = ctx.currentTime
    try {
      current.gain.gain.cancelScheduledValues(now)
      current.gain.gain.setValueAtTime(current.gain.gain.value, now)
      current.gain.gain.linearRampToValueAtTime(0, now + 0.04)
      current.source.stop(now + 0.05)
    } catch {
      // Уже кончился сам.
    }
  }

  private stopMusicNow(): void {
    const voice = this.music
    this.music = null
    if (voice !== null) this.retireMusic(voice, 0)
  }

  private stopAmbienceNow(): void {
    const voice = this.ambience
    this.ambience = null
    if (voice === null) return
    try {
      voice.source.stop()
    } catch {
      // Уже остановлен.
    }
    voice.gain.disconnect()
  }

  /**
   * Отрендерить фразу или взять готовую из памяти.
   *
   * Кэш ограничен: реплик в игре сотни, и держать их все распакованными
   * незачем — заговорят заново, отрендерится заново.
   */
  private renderVoice(plan: PhrasePlan, sampleRate: number): Promise<AudioBuffer | null> {
    const key = `${plan.voiceId}|${plan.emotion}|${plan.syllables.length}|${plan.seed}`
    const cached = this.voices.get(key)
    if (cached !== undefined) return cached
    if (this.voices.size >= VOICE_CACHE_LIMIT) this.voices.clear()
    const pending = renderPhrase(plan, sampleRate).catch(() => null)
    this.voices.set(key, pending)
    return pending
  }

  /** Всё короткое — заранее. Голосов здесь нет: они синтезируются. */
  private warmUp(): void {
    for (const definition of Object.values(SOUNDS)) {
      if (definition.src !== null) void this.loadBuffer(definition.src)
    }
  }

  private loadBuffer(src: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx
    if (ctx === null) return Promise.resolve(null)
    const cached = this.buffers.get(src)
    if (cached !== undefined) return cached

    const pending = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`не отдался файл ${src}`)
        return response.arrayBuffer()
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => {
        // Файла нет или он битый: сцена отыграет без этого звука.
        // Забываем неудачу, чтобы попробовать ещё раз при следующем заходе.
        this.buffers.delete(src)
        return null
      })
    this.buffers.set(src, pending)
    return pending
  }
}

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { dayKind } from '../../sim/study/Calendar'
import type { Vec2 } from '../../sim/types'
import type { World } from '../../sim/World'
import { useWorld } from '../useWorld'
import { ambienceFor } from './ambience'
import type { AmbienceId } from './catalog'
import { detectAudioEvents } from './events'
import type { AudioFrame } from './events'
import {
  ambienceSituationOf,
  audioFrameOf,
  inConversation,
  musicSituationOf,
  type PropPositions,
} from './frame'
import { AudioMixer } from './mixer'
import { advanceMusic, duckFor, musicMoodFor, IDLE_MUSIC, type MusicState } from './music'
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  withVolume,
  type AudioBus,
  type AudioSettings,
} from './settings'
import { advanceSteps, IDLE_STEPS, type StepState } from './steps'

/**
 * Звук, подключённый к игре.
 *
 * Один компонент связывает три вещи, каждая из которых сама по себе
 * ничего не знает о двух других: чистую логику выбора (music.ts,
 * ambience.ts, events.ts, steps.ts), проигрыватель (mixer.ts) и мир.
 *
 * Опрос мира идёт по таймеру и **не вызывает перерисовку**. Это
 * не оптимизация ради оптимизации: провайдер обёрнут вокруг сцены,
 * и состояние, меняющееся десять раз в секунду, десять раз в секунду
 * переcобирало бы дерево three.js. Всё, что меняется часто, живёт
 * в замыкании таймера; перерисовку вызывают только настройки и
 * появление разрешения на звук, то есть события редкие.
 */

/** Как часто опрашивается мир, миллисекунды. */
const TICK_MS = 100

/**
 * Насколько вперёд назначаются шаги, секунды.
 *
 * Должно быть заметно больше периода опроса: между двумя опросами
 * не должно оставаться незакрытого времени, иначе шаг, пришедшийся
 * на дыру, потеряется. Запас в восемьдесят миллисекунд закрывает
 * и обычное дрожание таймера, и подтормаживание кадра.
 */
const STEP_LOOKAHEAD = TICK_MS / 1000 + 0.08

export interface AudioControls {
  readonly settings: AudioSettings
  /** Общий выключатель. */
  readonly setEnabled: (value: boolean) => void
  readonly setVolume: (bus: AudioBus, value: number) => void
  /**
   * Браузер разрешил звук и он идёт. До первого действия человека —
   * false, и это нормальное состояние, а не поломка.
   */
  readonly ready: boolean
}

const AudioControlsContext = createContext<AudioControls | null>(null)

/** Где стоит какой предмет. Этаж не меняется, карта считается однажды. */
function propPositions(world: World): PropPositions {
  const positions = new Map<string, Vec2>()
  for (const prop of world.plan.props) {
    positions.set(prop.id, world.grid.gridToWorld({ col: prop.col, row: prop.row }))
  }
  return positions
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const world = useWorld()
  const [settings, setSettings] = useState<AudioSettings>(loadAudioSettings)
  const [ready, setReady] = useState(false)

  const mixerRef = useRef<AudioMixer | null>(null)
  mixerRef.current ??= new AudioMixer(DEFAULT_AUDIO_SETTINGS)
  const mixer = mixerRef.current

  // Настройки уезжают в проигрыватель и в хранилище одним и тем же
  // путём — из состояния, а не из обработчика: так они применяются
  // и при первом заходе, когда обработчика ещё не было.
  useEffect(() => {
    mixer.applySettings(settings)
  }, [mixer, settings])

  const update = useCallback((next: AudioSettings) => {
    setSettings(next)
    saveAudioSettings(next)
  }, [])

  const setEnabled = useCallback(
    (value: boolean) => update({ ...settings, enabled: value }),
    [settings, update],
  )
  const setVolume = useCallback(
    (bus: AudioBus, value: number) => update(withVolume(settings, bus, value)),
    [settings, update],
  )

  /*
   * Разрешение на звук. Браузеры не дают играть до первого действия
   * человека, поэтому AudioContext создаётся внутри обработчика — и
   * обработчик не снимается после первого срабатывания: контекст может
   * быть приостановлен позже (свёрнутая вкладка, политика экономии),
   * и тогда следующий клик обязан вернуть звук.
   */
  useEffect(() => {
    const wake = (): void => mixer.unlock()
    const events: readonly string[] = ['pointerdown', 'keydown', 'touchstart']
    for (const name of events) window.addEventListener(name, wake, { passive: true })
    return () => {
      for (const name of events) window.removeEventListener(name, wake)
    }
  }, [mixer])

  /*
   * Щелчок интерфейса. Одним слушателем на всё окно, а не звонком
   * из каждой панели: кнопок в игре три десятка, и звук нажатия —
   * свойство интерфейса целиком, а не каждой кнопки по отдельности.
   */
  useEffect(() => {
    const onDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('button') === null) return
      mixer.play({ id: 'click', at: null, delay: 0 }, { x: 0, z: 0 })
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [mixer])

  /* Главный цикл звука. */
  useEffect(() => {
    const positions = propPositions(world)
    let previous: AudioFrame | null = null
    let music: MusicState = IDLE_MUSIC
    let ambience: AmbienceId | null = null
    let steps: StepState = IDLE_STEPS
    let wasReady = false

    const tick = (): void => {
      const snapshot = world.snapshot()
      const now = mixer.now()

      const isReady = mixer.isReady()
      if (isReady !== wasReady) {
        wasReady = isReady
        setReady(isReady)
      }

      music = advanceMusic(music, musicMoodFor(musicSituationOf(snapshot, dayKind(snapshot.day))), now)
      mixer.setMusic(music.trackId)

      ambience = ambienceFor(ambienceSituationOf(snapshot), ambience)
      mixer.setAmbience(ambience)
      mixer.setDuck(duckFor(inConversation(snapshot)))

      const frame = audioFrameOf(snapshot, world.activeInteraction, positions)
      const events = detectAudioEvents(previous, frame)
      for (const cue of events.cues) mixer.play(cue, frame.playerAt)
      if (events.voice !== null) mixer.speak(events.voice)
      previous = frame

      const walk = advanceSteps(steps, frame.moving, now, STEP_LOOKAHEAD, snapshot.speed)
      steps = walk.state
      // Шаги — это ноги самого игрока, а не предмет на другом конце
      // коридора: расстояния у них нет и быть не может.
      for (const step of walk.steps) {
        mixer.play({ id: step.id, at: null, delay: step.at - now }, frame.playerAt)
      }
    }

    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [world, mixer])

  // Проигрыватель отпускается вместе с игрой, а не вместе с партией:
  // «начать заново» подменяет мир, и обрывать на этом музыку незачем.
  useEffect(() => () => mixer.dispose(), [mixer])

  const controls: AudioControls = { settings, setEnabled, setVolume, ready }
  return createElement(AudioControlsContext.Provider, { value: controls }, children)
}

export function useAudioControls(): AudioControls {
  const controls = useContext(AudioControlsContext)
  if (!controls) throw new Error('useAudioControls вызван вне AudioProvider')
  return controls
}

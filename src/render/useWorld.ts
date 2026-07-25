import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { SLEEP_SPOTS } from '../content/daily/sleepSpots'
import { WEEKEND_OPTIONS } from '../content/daily/weekendOptions'
import { DIALOGUE_CHAINS } from '../content/dialogue/chains'
import { DIALOGUE_NODES } from '../content/dialogue/nodes'
import { EPILOGUE_ENDINGS } from '../content/epilogue/endings'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../content/floors/floorA2'
import { MOODLETS } from '../content/moodlets'
import { TEACHER_NPCS } from '../content/people/npcs'
import { TEACHERS } from '../content/people/teachers'
import { PROP_CATALOG } from '../content/props/propCatalog'
import { COHORT_GPA } from '../content/study/cohort'
import { STUDY_CONFIG } from '../content/study/courses'
import { StudyState } from '../sim/study/StudyState'
import { World, type WorldSnapshot } from '../sim/World'

const WorldContext = createContext<World | null>(null)
const RestartContext = createContext<(() => void) | null>(null)

const SNAPSHOT_INTERVAL_MS = 100

/**
 * Новый мир из тех же каталогов.
 *
 * Каталоги — данные, они одинаковы в любой партии; всё, чем одна партия
 * отличается от другой, живёт внутри World. Поэтому «начать заново» — это
 * ровно этот вызов, и никакого сброса полей по одному.
 */
function createWorld(): World {
  return new World(
    FLOOR_A2,
    FLOOR_A2_SPAWN,
    PROP_CATALOG,
    new StudyState(STUDY_CONFIG),
    MOODLETS,
    TEACHER_NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUE_NODES, chains: DIALOGUE_CHAINS },
    {
      sleepSpots: SLEEP_SPOTS,
      weekendOptions: WEEKEND_OPTIONS,
      epilogueRules: EPILOGUE_ENDINGS,
      cohort: COHORT_GPA,
    },
  )
}

/**
 * Симуляция живёт вне React: экземпляр World мутируется в игровом цикле,
 * React читает из него снимки по таймеру, а не каждый кадр, иначе
 * реконсиляция съест частоту кадров на ускоренном времени.
 *
 * Мир держится состоянием, а не ссылкой, ровно ради одной кнопки: «начать
 * заново» подменяет его целиком, и всё, что читает мир через контекст,
 * узнаёт об этом само.
 */
export function WorldProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState(createWorld)
  const restart = useCallback(() => setWorld(createWorld()), [])

  return createElement(
    WorldContext.Provider,
    { value: world },
    createElement(RestartContext.Provider, { value: restart }, children),
  )
}

export function useWorld(): World {
  const world = useContext(WorldContext)
  if (!world) throw new Error('useWorld вызван вне WorldProvider')
  return world
}

/** Начинает партию заново: старый мир выбрасывается, новый строится из каталогов. */
export function useRestartWorld(): () => void {
  const restart = useContext(RestartContext)
  if (!restart) throw new Error('useRestartWorld вызван вне WorldProvider')
  return restart
}

export function useWorldSnapshot(): WorldSnapshot {
  const world = useWorld()
  const [snapshot, setSnapshot] = useState<WorldSnapshot>(() => world.snapshot())

  useEffect(() => {
    const id = setInterval(() => setSnapshot(world.snapshot()), SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [world])

  return snapshot
}

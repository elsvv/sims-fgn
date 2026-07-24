import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../content/floors/floorA2'
import { PROP_CATALOG } from '../content/props/propCatalog'
import { World, type WorldSnapshot } from '../sim/World'

const WorldContext = createContext<World | null>(null)

const SNAPSHOT_INTERVAL_MS = 100

/**
 * Симуляция живёт вне React: экземпляр World создаётся один раз и мутируется
 * в игровом цикле. React читает из него снимки по таймеру, а не каждый кадр,
 * иначе реконсиляция съест частоту кадров на ускоренном времени.
 */
export function WorldProvider({ children }: { children: ReactNode }) {
  const worldRef = useRef<World | null>(null)
  worldRef.current ??= new World(FLOOR_A2, FLOOR_A2_SPAWN, PROP_CATALOG)
  return createElement(WorldContext.Provider, { value: worldRef.current }, children)
}

export function useWorld(): World {
  const world = useContext(WorldContext)
  if (!world) throw new Error('useWorld вызван вне WorldProvider')
  return world
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

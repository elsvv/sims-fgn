import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../content/floors/floorA2'
import { FloorMesh } from './building/FloorMesh'
import { PlayerCharacter } from './character/PlayerCharacter'
import { ClickToMove } from './input/ClickToMove'
import { useWorld } from './useWorld'

/**
 * Камера смотрит туда, где появляется персонаж, а не в геометрический центр
 * этажа: игрок должен искать глазами человека, а не здание. Смещение подобрано
 * так, чтобы фигура читалась как человек, а вокруг оставалось видно комнату.
 */
const TARGET_X = (FLOOR_A2_SPAWN.col + 0.5) * FLOOR_A2.cellSize
const TARGET_Z = (FLOOR_A2_SPAWN.row + 0.5) * FLOOR_A2.cellSize
const CAMERA_OFFSET = { x: 6.5, y: 11, z: 7.5 }

/** Гоняет симуляцию в такт кадрам. Ничего не рисует. */
function SimulationLoop() {
  const world = useWorld()
  useFrame((_, delta) => world.tick(delta))
  return null
}

function Scene({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  const world = useWorld()
  return (
    <>
      <FloorMesh plan={world.plan} catalog={world.catalog} onSelectProp={onSelectProp} />
      <ClickToMove />
      <PlayerCharacter />
    </>
  )
}

export function GameCanvas({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  return (
    <Canvas
      shadows
      camera={{
        position: [
          TARGET_X + CAMERA_OFFSET.x,
          CAMERA_OFFSET.y,
          TARGET_Z + CAMERA_OFFSET.z,
        ],
        fov: 32,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0f1116']} />
      <SimulationLoop />

      <hemisphereLight intensity={0.55} groundColor="#2a2622" />
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Scene onSelectProp={onSelectProp} />

      {/* Цель — точка появления персонажа. Ближняя граница пускает камеру
          почти вплотную к человеку, дальняя всё ещё позволяет отъехать
          и увидеть весь этаж 24×13 целиком. Нижний предел угла не даёт
          провалиться под пол. */}
      <OrbitControls
        target={[TARGET_X, 0, TARGET_Z]}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minDistance={6}
        maxDistance={40}
      />
    </Canvas>
  )
}

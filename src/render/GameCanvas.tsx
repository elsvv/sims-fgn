import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../content/floors/floorA2'
import { ALL_APPEARANCES } from '../content/people/appearances'
import { PROP_CATALOG } from '../content/props/propCatalog'
import { characterModelUrls } from '../shared/characterModel'
import { FloorMesh } from './building/FloorMesh'
import { propModelUrls } from './building/propGroups'
import { NpcCharacters } from './character/NpcCharacters'
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

/**
 * Предзагрузка моделей обстановки. Запускается при разборе модуля —
 * то есть до того, как появится первый кадр, — и потому к моменту
 * отрисовки этажа файлы обычно уже в кэше загрузчика.
 *
 * Без неё каждый вид предмета грузился бы в свой момент, и обстановка
 * всплывала бы по частям: сначала парты, потом автоматы, потом лифт.
 * Все девять файлов вместе весят меньше полутора сотен килобайт.
 */
for (const url of propModelUrls(PROP_CATALOG)) useGLTF.preload(url)

/**
 * Предзагрузка моделей людей. Тот же приём и та же причина, но цена
 * ошибки выше: обстановка стоит на месте, а человек, всплывший из
 * капсульного человечка посреди разговора, — это подмена собеседника
 * на глазах у игрока.
 *
 * Файлов девять на всех: тела повторяются (Павлов и Долгоруков собраны
 * на одном), а анимации лежат одним общим файлом. Набор собирается
 * из внешностей, а не перечисляется руками: добавить человека — значит
 * дописать строчку в appearances.ts, и предзагрузка подхватит её сама.
 */
for (const url of new Set(ALL_APPEARANCES.flatMap((look) => characterModelUrls(look.model)))) {
  useGLTF.preload(url)
}

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
      <NpcCharacters />
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
      {/*
        normalBias сдвигает точку, которой стена спрашивает карту теней,
        вдоль её же нормали. Без сдвига стена затеняет сама себя по стыкам:
        в карту теней three.js пишет задние грани, и внутренняя грань бокса
        ложится ровно на поверхность соседнего — по каждому стыку и вдоль
        основания стен шёл тонкий тёмный пунктир. Величина — примерно
        полтора тексела карты, меньше не помогает, больше отрывает тени
        от предметов.
      */}
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.5}
        castShadow
        shadow-normalBias={0.04}
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

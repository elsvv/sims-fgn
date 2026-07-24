import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import type { FloorPlan, TileKind } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'
import { PropMesh, WALL_HEIGHT } from './PropMesh'

interface Cell {
  col: number
  row: number
  kind: TileKind
}

/** С какой стороны здания стоит камера. Важен только знак, не величина. */
interface ViewSide {
  x: 1 | -1
  z: 1 | -1
}

const FLOOR_COLOR = '#b9ab93'
const WALL_COLOR = '#e6e1d6'
const DOOR_COLOR = '#7a5c3a'

/**
 * До какой высоты срезаются стены, загораживающие обзор.
 * Не до нуля: перегородка по пояс оставляет комнаты комнатами,
 * но человек ростом 1.78 виден над ней целиком.
 */
const CUT_WALL_HEIGHT = 0.9

function readCells(plan: FloorPlan): Cell[] {
  const cells: Cell[] = []
  plan.tiles.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col] ?? ' '
      const kind = plan.legend[char] ?? 'void'
      if (kind !== 'void') cells.push({ col, row, kind })
    }
  })
  return cells
}

/**
 * Следит, с какой стороны здания стоит камера. Проверяется каждый кадр, но
 * состояние меняется только при переходе через середину здания — всего четыре
 * положения, так что перерисовок почти не случается.
 */
function useViewSide(centerX: number, centerZ: number): ViewSide {
  const camera = useThree((state) => state.camera)
  const [side, setSide] = useState<ViewSide>(() => ({
    x: camera.position.x >= centerX ? 1 : -1,
    z: camera.position.z >= centerZ ? 1 : -1,
  }))

  useFrame(() => {
    const x: 1 | -1 = camera.position.x >= centerX ? 1 : -1
    const z: 1 | -1 = camera.position.z >= centerZ ? 1 : -1
    setSide((prev) => (prev.x === x && prev.z === z ? prev : { x, z }))
  })

  return side
}

/**
 * Стена остаётся в полный рост, только если за ней — со стороны,
 * противоположной камере, — уже улица. Все прочие стены что-нибудь
 * загораживают и срезаются, как в «Симс»: иначе трёхметровая коробка
 * закрывает и комнату, и персонажа внутри неё.
 *
 * Правило зависит от положения камеры, поэтому при повороте вида дальние
 * стены поднимаются, а ближние ложатся.
 */
function isBackWall(
  kindAt: (col: number, row: number) => TileKind,
  cell: Cell,
  side: ViewSide,
): boolean {
  const behind: readonly (readonly [number, number])[] = [
    [cell.col - side.x, cell.row],
    [cell.col, cell.row - side.z],
    [cell.col - side.x, cell.row - side.z],
  ]
  return behind.some(([col, row]) => kindAt(col, row) === 'void')
}

/**
 * Строит геометрию этажа из той же планировки, по которой считается навигация.
 * Один источник правды — видимое и проходимое не могут разойтись.
 */
export function FloorMesh({
  plan,
  catalog,
  onSelectProp,
}: {
  plan: FloorPlan
  catalog: PropCatalog
  onSelectProp: (propId: string) => void
}) {
  const cells = useMemo(() => readCells(plan), [plan])
  const size = plan.cellSize

  const kindAt = useMemo(() => {
    const byKey = new Map<string, TileKind>()
    for (const cell of cells) byKey.set(`${cell.col},${cell.row}`, cell.kind)
    return (col: number, row: number): TileKind => byKey.get(`${col},${row}`) ?? 'void'
  }, [cells])

  const cols = plan.tiles.reduce((max, line) => Math.max(max, line.length), 0)
  const side = useViewSide((cols * size) / 2, (plan.tiles.length * size) / 2)

  return (
    <group>
      {cells.map((cell) => {
        const x = (cell.col + 0.5) * size
        const z = (cell.row + 0.5) * size

        if (cell.kind === 'wall') {
          const height = isBackWall(kindAt, cell, side) ? WALL_HEIGHT : CUT_WALL_HEIGHT
          return (
            <mesh
              key={`w-${cell.col}-${cell.row}`}
              position={[x, height / 2, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size, height, size]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
            </mesh>
          )
        }

        return (
          <mesh
            key={`f-${cell.col}-${cell.row}`}
            position={[x, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial
              color={cell.kind === 'door' ? DOOR_COLOR : FLOOR_COLOR}
              roughness={0.9}
            />
          </mesh>
        )
      })}

      {plan.props.map((placement) => (
        <PropMesh
          key={placement.id}
          placement={placement}
          cellSize={size}
          catalog={catalog}
          onSelect={onSelectProp}
        />
      ))}
    </group>
  )
}

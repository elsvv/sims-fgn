import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import type { FloorPlan, TileKind } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'
import { DOOR_COLOR, FLOOR_COLOR, WALL_COLOR, WALL_TOP_COLOR } from './palette'
import { PropsLayer } from './PropsLayer'
import { buildWallSegments } from './wallSegments'

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

/** Высота стены в метрах. Отсюда же её берут срезанные перегородки. */
export const WALL_HEIGHT = 3

/**
 * Крышка стены — отдельная плоскость поверх бокса, только чтобы покрасить
 * срез в свой цвет: у боксовой геометрии все шесть граней берут один
 * материал.
 *
 * Крышка приподнята на миллиметр — иначе она совпадает с верхней гранью
 * бокса и они начинают бороться за глубину, — и выпущена на два миллиметра
 * за габарит, чтобы у соседних отрезков крышки перекрывались, а не сходились
 * встык. На экране это доли пикселя, геометрия визуально не меняется.
 */
const CAP_LIFT = 0.001
const CAP_OVERHANG = 0.004

/**
 * До какой высоты срезаются стены, загораживающие обзор.
 * Не до нуля: перегородка по пояс оставляет комнаты комнатами,
 * но человек ростом 1.78 виден над ней целиком.
 */
const CUT_WALL_HEIGHT = 0.9

/**
 * Группы, на которые делятся клетки стен перед слиянием в отрезки.
 * Различаются только высотой: срезанную стену нельзя слить с целой.
 */
const WALL_GROUP_HEIGHT: Record<string, number> = {
  tall: WALL_HEIGHT,
  cut: CUT_WALL_HEIGHT,
}

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
  col: number,
  row: number,
  side: ViewSide,
): boolean {
  const behind: readonly (readonly [number, number])[] = [
    [col - side.x, row],
    [col, row - side.z],
    [col - side.x, row - side.z],
  ]
  return behind.some(([c, r]) => kindAt(c, r) === 'void')
}

/**
 * Строит геометрию этажа из той же планировки, по которой считается навигация.
 * Один источник правды — видимое и проходимое не могут разойтись.
 *
 * Стены не рисуются по клеткам: подряд идущие клетки одной высоты сливаются
 * в один растянутый бокс, иначе на каждом стыке видно шов.
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
  const rows = plan.tiles.length
  const side = useViewSide((cols * size) / 2, (rows * size) / 2)

  // Пересобирается только при смене планировки или стороны обзора —
  // то есть при повороте камеры через угол здания, а не каждый кадр.
  const wallSegments = useMemo(
    () =>
      buildWallSegments({
        cols,
        rows,
        keyAt: (col, row) => {
          if (kindAt(col, row) !== 'wall') return null
          return isBackWall(kindAt, col, row, side) ? 'tall' : 'cut'
        },
      }),
    [cols, rows, kindAt, side],
  )

  const floorCells = cells.filter((cell) => cell.kind !== 'wall')

  return (
    <group>
      {wallSegments.map((segment) => {
        const height = WALL_GROUP_HEIGHT[segment.key] ?? WALL_HEIGHT
        const spanX = segment.axis === 'x' ? segment.length : 1
        const spanZ = segment.axis === 'z' ? segment.length : 1
        const x = (segment.col + spanX / 2) * size
        const z = (segment.row + spanZ / 2) * size
        return (
          <group key={`w-${segment.axis}-${segment.col}-${segment.row}`}>
            <mesh position={[x, height / 2, z]} castShadow receiveShadow>
              <boxGeometry args={[spanX * size, height, spanZ * size]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
            </mesh>
            <mesh
              position={[x, height + CAP_LIFT, z]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry
                args={[spanX * size + CAP_OVERHANG, spanZ * size + CAP_OVERHANG]}
              />
              <meshStandardMaterial color={WALL_TOP_COLOR} roughness={0.95} />
            </mesh>
          </group>
        )
      })}

      {floorCells.map((cell) => (
        <mesh
          key={`f-${cell.col}-${cell.row}`}
          position={[(cell.col + 0.5) * size, 0, (cell.row + 0.5) * size]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial
            color={cell.kind === 'door' ? DOOR_COLOR : FLOOR_COLOR}
            roughness={0.9}
          />
        </mesh>
      ))}

      <PropsLayer plan={plan} catalog={catalog} onSelectProp={onSelectProp} />
    </group>
  )
}

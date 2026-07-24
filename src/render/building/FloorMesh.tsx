import { useMemo } from 'react'
import type { FloorPlan, TileKind } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'
import { PropMesh, WALL_HEIGHT } from './PropMesh'

interface Cell {
  col: number
  row: number
  kind: TileKind
}

const FLOOR_COLOR = '#b9ab93'
const WALL_COLOR = '#e6e1d6'
const DOOR_COLOR = '#7a5c3a'

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

  return (
    <group>
      {cells.map((cell) => {
        const x = (cell.col + 0.5) * size
        const z = (cell.row + 0.5) * size

        if (cell.kind === 'wall') {
          return (
            <mesh
              key={`w-${cell.col}-${cell.row}`}
              position={[x, WALL_HEIGHT / 2, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size, WALL_HEIGHT, size]} />
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

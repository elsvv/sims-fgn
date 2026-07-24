import type { PropPlacement } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'

export const WALL_HEIGHT = 3

export function PropMesh({
  placement,
  cellSize,
  catalog,
  onSelect,
}: {
  placement: PropPlacement
  cellSize: number
  catalog: PropCatalog
  onSelect: (propId: string) => void
}) {
  const definition = catalog[placement.kind]
  if (!definition) return null

  const x = (placement.col + 0.5) * cellSize
  const z = (placement.row + 0.5) * cellSize
  const { w, d, h } = definition.size

  return (
    <mesh
      position={[x, h / 2, z]}
      rotation={[0, placement.rotation, 0]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation()
        onSelect(placement.id)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={definition.color} roughness={0.8} />
    </mesh>
  )
}

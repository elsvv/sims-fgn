import type { ThreeEvent } from '@react-three/fiber'
import type { PropPlacement } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'
import { dragAwareClick } from '../input/sceneClicks'

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

  // Меню предмета открывается только по настоящему клику: вращая камеру,
  // легко отпустить кнопку над столом, и меню лезло бы само собой.
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    onSelect(placement.id)
  }

  return (
    <mesh
      position={[x, h / 2, z]}
      rotation={[0, placement.rotation, 0]}
      castShadow
      receiveShadow
      onClick={dragAwareClick(handleClick)}
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

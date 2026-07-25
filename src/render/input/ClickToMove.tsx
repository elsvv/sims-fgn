import type { ThreeEvent } from '@react-three/fiber'
import { useWorld } from '../useWorld'
import { dragAwareClick } from './sceneClicks'

/**
 * Прозрачная плоскость на уровне пола. Ловит клики, переводит точку попадания
 * в клетку сетки и отдаёт команду симуляции. Если клетка непроходима,
 * симуляция сама отвергнет команду — здесь никакой логики нет.
 *
 * Плоскость прозрачна через материал, а не через visible={false}:
 * невидимые объекты three.js исключает из проверки пересечений.
 *
 * Пол занимает весь экран, поэтому вращение камеры заканчивается почти
 * всегда над ним: без dragAwareClick любой поворот вида уводил бы персонажа
 * идти в случайную точку.
 */
export function ClickToMove() {
  const world = useWorld()
  const width = world.grid.cols * world.grid.cellSize
  const depth = world.grid.rows * world.grid.cellSize

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    world.commandMoveTo(world.grid.worldToGrid({ x: event.point.x, z: event.point.z }))
  }

  return (
    <mesh
      position={[width / 2, 0.02, depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={dragAwareClick(handleClick)}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

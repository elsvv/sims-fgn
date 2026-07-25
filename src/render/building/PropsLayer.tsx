import type { ThreeEvent } from '@react-three/fiber'
import { Suspense, useMemo, type ReactNode } from 'react'
import type { FloorPlan, PropPlacement } from '../../sim/world/FloorPlan'
import type { PropCatalog, PropDefinition } from '../../sim/world/PropDefinition'
import { dragAwareClick } from '../input/sceneClicks'
import { ModelErrorBoundary } from '../ModelErrorBoundary'
import { PropModelInstances } from './PropModelInstances'
import {
  planPropRender,
  propBoxOffset,
  propModelOf,
  type PropModelGroup,
} from './propGroups'

/** Центр клетки предмета в метрах. */
function cellCenter(placement: PropPlacement, cellSize: number): [number, number, number] {
  return [(placement.col + 0.5) * cellSize, 0, (placement.row + 0.5) * cellSize]
}

/**
 * Прежний цветной бокс. Он никуда не делся и остаётся запасным видом
 * предмета: у предмета может не быть модели, файл может не загрузиться,
 * модель может оказаться пустой. Игра из-за ассета падать не должна.
 */
export function PropBox({
  placement,
  definition,
  cellSize,
}: {
  placement: PropPlacement
  definition: PropDefinition
  cellSize: number
}) {
  const { w, d, h } = definition.size
  const offset = propBoxOffset(definition.size, propModelOf(definition), cellSize)

  return (
    <group position={cellCenter(placement, cellSize)} rotation={[0, placement.rotation, 0]}>
      <mesh position={[offset.x, offset.y, offset.z]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={definition.color} roughness={0.8} />
      </mesh>
    </group>
  )
}

/**
 * Невидимая мишень для мыши размером с предмет.
 *
 * Клик по предмету не должен зависеть от того, какой геометрией предмет
 * нарисован сегодня: моделью, боксом или ничем, пока файл грузится.
 * Поэтому мишень одна, она живёт отдельно от вида и повторяет
 * объявленный габарит — тот же, по которому считается проходимость.
 *
 * Прозрачность сделана материалом, а не visible={false}: невидимые
 * объекты three.js исключает из проверки пересечений, и мишень перестала
 * бы ловить что бы то ни было.
 */
export function PropHitBox({
  placement,
  definition,
  cellSize,
  onSelect,
}: {
  placement: PropPlacement
  definition: PropDefinition
  cellSize: number
  onSelect: (propId: string) => void
}) {
  const { w, d, h } = definition.size
  const offset = propBoxOffset(definition.size, propModelOf(definition), cellSize)

  // Меню предмета открывается только по настоящему клику: вращая камеру,
  // легко отпустить кнопку над столом, и меню лезло бы само собой.
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    onSelect(placement.id)
  }

  return (
    <group position={cellCenter(placement, cellSize)} rotation={[0, placement.rotation, 0]}>
      <mesh
        position={[offset.x, offset.y, offset.z]}
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
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Боксы всей группы разом — тем же порядком, что и модели. */
function GroupBoxes({ groups, cellSize }: { groups: PropModelGroup[]; cellSize: number }) {
  return (
    <>
      {groups.flatMap((group) =>
        group.placements.map((placement) => (
          <PropBox
            key={placement.id}
            placement={placement}
            definition={group.definition}
            cellSize={cellSize}
          />
        )),
      )}
    </>
  )
}

/**
 * Вся обстановка этажа.
 *
 * Устройство слоя определяется двумя требованиями, и оба важнее красоты
 * кода.
 *
 * Первое: предметы не должны всплывать по одному. Поэтому ожидание
 * загрузки одно на все модели сразу — пока не готовы все, видны боксы,
 * потом разом появляются модели. Вместе с предзагрузкой (см. GameCanvas)
 * это означает, что в живой игре подмены почти не видно.
 *
 * Второе: испорченный или пропавший файл не должен ронять игру. Поэтому
 * ловушка ошибок стоит вокруг каждого вида отдельно: если не загрузилась
 * парта, боксами станут парты, а не весь этаж.
 */
export function PropsLayer({
  plan,
  catalog,
  onSelectProp,
}: {
  plan: FloorPlan
  catalog: PropCatalog
  onSelectProp: (propId: string) => void
}) {
  const cellSize = plan.cellSize
  const { modelled, boxed } = useMemo(
    () => planPropRender(plan.props, catalog),
    [plan, catalog],
  )

  const hitBoxes: ReactNode[] = plan.props.flatMap((placement) => {
    const definition = catalog[placement.kind]
    if (!definition) return []
    return [
      <PropHitBox
        key={placement.id}
        placement={placement}
        definition={definition}
        cellSize={cellSize}
        onSelect={onSelectProp}
      />,
    ]
  })

  return (
    <group>
      {hitBoxes}

      {boxed.map((item) => (
        <PropBox
          key={item.placement.id}
          placement={item.placement}
          definition={item.definition}
          cellSize={cellSize}
        />
      ))}

      <Suspense fallback={<GroupBoxes groups={modelled} cellSize={cellSize} />}>
        {modelled.map((group) => (
          <ModelErrorBoundary
            key={group.kind}
            fallback={<GroupBoxes groups={[group]} cellSize={cellSize} />}
          >
            <PropModelInstances group={group} cellSize={cellSize} />
          </ModelErrorBoundary>
        ))}
      </Suspense>
    </group>
  )
}

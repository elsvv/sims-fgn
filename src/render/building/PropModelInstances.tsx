import { useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { fitPropModel, isUsableBounds } from '../../sim/world/fitPropModel'
import { PropBox } from './PropsLayer'
import type { PropModelGroup } from './propGroups'
import {
  buildPropParts,
  modelBounds,
  ownedMaterials,
  propInstanceMatrix,
  type PropPart,
} from './propModelParts'

/**
 * Один кусок модели, размноженный по всем клеткам своего вида.
 *
 * Двадцать парт на этаже — это ровно столько вызовов отрисовки, сколько
 * в модели парты материалов, а не двадцать раз по столько. Ради этого
 * весь разбор модели на куски и существует.
 */
function PartInstances({
  part,
  group,
  cellSize,
}: {
  part: PropPart
  group: PropModelGroup
  cellSize: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const count = group.placements.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    group.placements.forEach((placement, index) => {
      mesh.setMatrixAt(index, propInstanceMatrix(part, placement, cellSize, group.model))
    })
    mesh.instanceMatrix.needsUpdate = true
    // Без пересчёта сферы инстансы отсекаются по габариту первого из них
    // и предметы пропадают с экрана при повороте камеры.
    mesh.computeBoundingSphere()
  }, [part, group, cellSize])

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, count]}
      castShadow
      receiveShadow
      /*
       * Геометрия у всех экземпляров общая и принадлежит кэшу загрузчика,
       * а материалы освобождает тот, кто их клонировал. Отдавать
       * освобождение реконсиляции нельзя: она выбросила бы геометрию,
       * которой ещё пользуются другие предметы из того же файла.
       */
      dispose={null}
    />
  )
}

/**
 * Все предметы одного вида, нарисованные моделью.
 *
 * Компонент приостанавливает отрисовку, пока файл грузится: `useGLTF`
 * бросает обещание, а ожидание ловит `Suspense` в PropsLayer. Ошибку
 * загрузки ловит ModelErrorBoundary там же.
 *
 * Отдельный запасной путь — на модель, которая загрузилась, но оказалась
 * пустой: файл без мешей даёт вывернутый габарит, по которому нельзя
 * посчитать ни масштаба, ни положения. Ошибки при этом никакой нет,
 * ловить нечего, а рисовать надо.
 */
export function PropModelInstances({
  group,
  cellSize,
}: {
  group: PropModelGroup
  cellSize: number
}) {
  const { scene } = useGLTF(group.model.url)

  const parts = useMemo(() => {
    const bounds = modelBounds(scene)
    if (!isUsableBounds(bounds)) return []
    const transform = fitPropModel({
      bounds,
      size: group.definition.size,
      model: group.model,
      cellSize,
    })
    return buildPropParts({
      root: scene,
      transform,
      tint: group.model.tint ?? 'dominant',
      color: group.definition.color,
    })
  }, [scene, group, cellSize])

  useEffect(() => {
    return () => {
      for (const material of ownedMaterials(parts)) material.dispose()
    }
  }, [parts])

  if (parts.length === 0) {
    return (
      <>
        {group.placements.map((placement) => (
          <PropBox
            key={placement.id}
            placement={placement}
            definition={group.definition}
            cellSize={cellSize}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {parts.map((part, index) => (
        <PartInstances
          key={`${group.kind}-${index}`}
          part={part}
          group={group}
          cellSize={cellSize}
        />
      ))}
    </>
  )
}

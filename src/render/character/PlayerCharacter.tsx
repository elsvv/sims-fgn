import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { isMoving } from '../../sim/actor/Actor'
import { useWorld } from '../useWorld'
import { createAppearance } from './CharacterAppearance'
import { ProceduralCharacter } from './ProceduralCharacter'

const PLAYER_LOOK = createAppearance({
  height: 1.78,
  top: '#4a5d7e',
  bottom: '#23262c',
  hairStyle: 'medium',
})

/**
 * Связывает актора из симуляции с его визуальным представлением.
 * Позиция читается напрямую из World каждый кадр, минуя состояние React,
 * иначе на ускоренном времени персонаж будет дёргаться.
 *
 * Признак ходьбы держится в состоянии — он меняется редко, только на
 * старте и остановке, так что перерисовки почти не случаются.
 */
export function PlayerCharacter() {
  const world = useWorld()
  const group = useRef<Group>(null)
  const [walking, setWalking] = useState(false)

  useFrame(() => {
    if (!group.current) return
    const { position, facing } = world.player
    group.current.position.set(position.x, 0, position.z)
    // Модель смотрит вдоль +Z, поэтому доворачиваем на четверть оборота.
    group.current.rotation.y = -facing + Math.PI / 2

    const moving = isMoving(world.player)
    setWalking((prev) => (prev === moving ? prev : moving))
  })

  return (
    <group ref={group}>
      <ProceduralCharacter appearance={PLAYER_LOOK} walking={walking} />
    </group>
  )
}

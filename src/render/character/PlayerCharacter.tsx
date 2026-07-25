import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { PLAYER_APPEARANCE } from '../../content/people/appearances'
import { isMoving } from '../../sim/actor/Actor'
import { useWorld } from '../useWorld'
import { Character } from './Character'
import { characterYaw, GLTF_FACING_OFFSET } from './facing'

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
    group.current.rotation.y = characterYaw(facing, GLTF_FACING_OFFSET)

    const moving = isMoving(world.player)
    setWalking((prev) => (prev === moving ? prev : moving))
  })

  return (
    <group ref={group}>
      <Character appearance={PLAYER_APPEARANCE} walking={walking} />
    </group>
  )
}

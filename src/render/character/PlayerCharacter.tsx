import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { PLAYER_APPEARANCE } from '../../content/people/appearances'
import { isMoving } from '../../sim/actor/Actor'
import { useWorld } from '../useWorld'
import { Character } from './Character'
import { characterYaw, GLTF_FACING_OFFSET } from './facing'
import type { Posture } from './posture'

/**
 * Связывает актора из симуляции с его визуальным представлением.
 * Позиция читается напрямую из World каждый кадр, минуя состояние React,
 * иначе на ускоренном времени персонаж будет дёргаться.
 *
 * Поза держится в состоянии — она меняется редко, только когда персонаж
 * пошёл, встал или сел, так что перерисовки почти не случаются.
 *
 * Сидение приходит из симуляции, а не из намерения игрока: сидит тот, кто
 * стоит на клетке со стулом и никуда не идёт (World.seatOf). Поэтому
 * «Сесть и слушать» за партой действительно сажает — игра и так приводит
 * человека на клетку со стулом, — а команды «сесть» в интерфейсе не нужно.
 * Сидящий разворачивается вместе со стулом: в аудитории это значит «лицом
 * к доске», с какой бы стороны он ни подошёл.
 */
export function PlayerCharacter() {
  const world = useWorld()
  const group = useRef<Group>(null)
  const [posture, setPosture] = useState<Posture>('stand')
  const [seatHeight, setSeatHeight] = useState<number | null>(null)

  useFrame(() => {
    if (!group.current) return
    const { position, facing } = world.player
    const seat = world.seatOf(world.player)

    group.current.position.set(position.x, 0, position.z)
    group.current.rotation.y = characterYaw(seat?.facing ?? facing, GLTF_FACING_OFFSET)

    const next: Posture = isMoving(world.player) ? 'walk' : seat ? 'sit' : 'stand'
    setPosture((prev) => (prev === next ? prev : next))
    const height = seat?.height ?? null
    setSeatHeight((prev) => (prev === height ? prev : height))
  })

  return (
    <group ref={group}>
      <Character appearance={PLAYER_APPEARANCE} posture={posture} seatHeight={seatHeight} />
    </group>
  )
}

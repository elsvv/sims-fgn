import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { dialogueNodeFor } from '../../content/dialogue/nodes'
import { DEFAULT_APPEARANCE, TEACHER_APPEARANCES } from '../../content/people/appearances'
import { TEACHERS } from '../../content/people/teachers'
import { isMoving } from '../../sim/actor/Actor'
import type { Npc } from '../../sim/npc/Npc'
import type { World } from '../../sim/World'
import { dragAwareClick } from '../input/sceneClicks'
import { useWorld } from '../useWorld'
import { Character } from './Character'
import { characterYaw, GLTF_FACING_OFFSET } from './facing'

/** На сколько подпись висит выше макушки, в метрах. */
const LABEL_LIFT = 0.3

/**
 * Во сколько раз подпись мельче при удалении камеры.
 *
 * Подобрано под угол обзора сцены: на обычном удалении фамилия читается,
 * при отъезде на весь этаж она сама сжимается до незаметной метки. Так
 * шесть подписей не превращаются в вывеску поверх здания.
 */
const LABEL_SCALE = 8

function lookOf(npc: Npc) {
  if (!npc.teacherId) return DEFAULT_APPEARANCE
  return TEACHER_APPEARANCES[npc.teacherId] ?? DEFAULT_APPEARANCE
}

/** Что написано над головой: фамилия, а не идентификатор. */
function nameOf(npc: Npc): string {
  if (!npc.teacherId) return ''
  return TEACHERS[npc.teacherId]?.short ?? ''
}

/**
 * Что делает клик по человеку.
 *
 * Разговор начинается, только когда оба стоят в одном помещении и рядом:
 * в другом конце коридора собеседника не слышно, даже если коридор общий.
 * Отказывать молча нельзя — персонаж идёт к нему сам, и разговор начнётся
 * со второго нажатия, когда он дойдёт.
 *
 * Что именно начнётся, решает положение дел. Сцена важнее короткого
 * обмена репликами: если этих двоих свело в туалете за час до пары,
 * здороваться в третий раз незачем — начинается «Марей в туалете».
 * Сцен, доступных прямо сейчас, обычно ноль, изредка одна: их условия
 * бытовые, а совпасть в одном помещении в одну минуту — редкость.
 */
function talkTo(world: World, npc: Npc): void {
  // Идёт сцена — клики по людям не работают вовсе. Иначе нажатие на
  // соседа отправило бы персонажа через весь этаж прямо посреди фразы.
  // Уйти из разговора по-прежнему можно: щелчком по полу.
  if (world.activeChain) return

  const chainId = world.chainForNpc(npc.id)
  if (chainId && world.startChainDialogue(chainId)) return

  const nodeId = npc.teacherId
    ? dialogueNodeFor(npc.teacherId, world.relationships.get(npc.id))
    : null
  if (nodeId && world.startDialogue(nodeId)) return

  // Отсюда не заговорить: либо между вами стена, либо десяток метров.
  // Клик по человеку в любом случае значит «хочу к нему», поэтому
  // персонаж идёт, а разговор начнётся со второго нажатия.
  world.commandApproachNpc(npc.id)
}

/**
 * Один житель этажа. Положение читается прямо из симуляции каждый кадр,
 * как и у игрока: снимок обновляется десять раз в секунду, и на ускоренном
 * времени персонаж дёргался бы.
 */
function NpcCharacter({ npc }: { npc: Npc }) {
  const world = useWorld()
  const group = useRef<Group>(null)
  const [walking, setWalking] = useState(false)

  const appearance = lookOf(npc)
  const label = nameOf(npc)

  // Клик по человеку не должен заодно уходить в пол под ним: иначе
  // персонаж одновременно и заговорит, и пойдёт в другую сторону.
  // Вращение камеры, закончившееся над собеседником, разговором не считается.
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    talkTo(world, npc)
  }

  useFrame(() => {
    if (!group.current) return
    const { position, facing } = npc.actor
    group.current.position.set(position.x, 0, position.z)
    group.current.rotation.y = characterYaw(facing, GLTF_FACING_OFFSET)

    const moving = isMoving(npc.actor)
    setWalking((prev) => (prev === moving ? prev : moving))
  })

  return (
    <group ref={group} onClick={dragAwareClick(handleClick)}>
      <Character appearance={appearance} walking={walking} />
      {label && (
        <Html
          position={[0, appearance.height + LABEL_LIFT, 0]}
          center
          distanceFactor={LABEL_SCALE}
          pointerEvents="none"
          zIndexRange={[20, 0]}
        >
          {/*
            Подпись не должна перехватывать клики: под ней пол, по которому
            игрок ходит. Поэтому и pointerEvents="none" у обёртки, и
            собственный класс без интерактивности.
          */}
          <div className="npc-label">{label}</div>
        </Html>
      )}
    </group>
  )
}

/** Все NPC этажа. Список постоянен, поэтому перерисовок здесь не бывает. */
export function NpcCharacters() {
  const world = useWorld()
  return (
    <>
      {world.npcs.map((npc) => (
        <NpcCharacter key={npc.id} npc={npc} />
      ))}
    </>
  )
}

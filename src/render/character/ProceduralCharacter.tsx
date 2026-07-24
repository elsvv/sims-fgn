import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { CharacterAppearance } from './CharacterAppearance'

/**
 * Процедурная модель человека из примитивов. Пропорции строятся от роста,
 * поэтому персонажи разного роста остаются анатомически похожими.
 * Модель смотрит вдоль +Z.
 */
export function ProceduralCharacter({
  appearance,
  walking,
}: {
  appearance: CharacterAppearance
  walking: boolean
}) {
  const legLeft = useRef<Group>(null)
  const legRight = useRef<Group>(null)
  const armLeft = useRef<Group>(null)
  const armRight = useRef<Group>(null)

  const h = appearance.height
  const girth = 0.16 + appearance.build * 0.1
  const legLength = h * 0.46
  const torsoHeight = h * 0.31
  const headRadius = h * 0.072
  const shoulderY = legLength + torsoHeight
  const armLength = h * 0.33

  useFrame((state) => {
    const swing = walking ? Math.sin(state.clock.elapsedTime * 8) * 0.6 : 0
    if (legLeft.current) legLeft.current.rotation.x = swing
    if (legRight.current) legRight.current.rotation.x = -swing
    if (armLeft.current) armLeft.current.rotation.x = -swing * 0.7
    if (armRight.current) armRight.current.rotation.x = swing * 0.7
  })

  return (
    <group>
      <group ref={legLeft} position={[-girth * 0.5, legLength, 0]}>
        <mesh position={[0, -legLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.3, legLength * 0.8, 4, 8]} />
          <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legRight} position={[girth * 0.5, legLength, 0]}>
        <mesh position={[0, -legLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.3, legLength * 0.8, 4, 8]} />
          <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
        </mesh>
      </group>

      <mesh position={[0, legLength + torsoHeight / 2, 0]} castShadow>
        <capsuleGeometry args={[girth, torsoHeight * 0.6, 4, 12]} />
        <meshStandardMaterial color={appearance.top} roughness={0.85} />
      </mesh>

      <group ref={armLeft} position={[-girth * 1.25, shoulderY * 0.97, 0]}>
        <mesh position={[0, -armLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.24, armLength * 0.75, 4, 8]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
      </group>
      <group ref={armRight} position={[girth * 1.25, shoulderY * 0.97, 0]}>
        <mesh position={[0, -armLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.24, armLength * 0.75, 4, 8]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
      </group>

      <mesh position={[0, shoulderY + headRadius * 1.35, 0]} castShadow>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.75} />
      </mesh>

      {appearance.hairStyle !== 'bald' && (
        <mesh position={[0, shoulderY + headRadius * 1.36, 0]} castShadow>
          <sphereGeometry
            args={[
              headRadius * (appearance.hairStyle === 'medium' ? 1.1 : 1.04),
              16,
              16,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ]}
          />
          <meshStandardMaterial color={appearance.hair} roughness={0.95} />
        </mesh>
      )}

      {appearance.facialHair !== 'none' && (
        <mesh
          position={[
            0,
            shoulderY + headRadius * (appearance.facialHair === 'moustache' ? 1.24 : 1.08),
            headRadius * 0.55,
          ]}
          castShadow
        >
          <boxGeometry
            args={[
              headRadius * 1.1,
              headRadius * (appearance.facialHair === 'beard' ? 1.0 : 0.28),
              headRadius * 0.5,
            ]}
          />
          <meshStandardMaterial
            color={appearance.hair}
            roughness={0.95}
            transparent={appearance.facialHair === 'stubble'}
            opacity={appearance.facialHair === 'stubble' ? 0.55 : 1}
          />
        </mesh>
      )}

      {appearance.glasses && (
        <mesh position={[0, shoulderY + headRadius * 1.4, headRadius * 0.82]}>
          <boxGeometry args={[headRadius * 1.7, headRadius * 0.34, headRadius * 0.1]} />
          <meshStandardMaterial color="#15181d" roughness={0.4} metalness={0.3} />
        </mesh>
      )}
    </group>
  )
}

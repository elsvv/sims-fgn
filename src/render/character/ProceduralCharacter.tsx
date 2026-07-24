import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { CharacterAppearance } from './CharacterAppearance'

/**
 * Процедурная модель человека из примитивов. Модель смотрит вдоль +Z.
 *
 * Все размеры считаются от роста по канону «семь с половиной голов»:
 * голова — 1/7.5 роста, плечо на 0.81 роста, тазобедренный сустав на 0.47.
 * Поэтому персонаж любого роста остаётся человеком, а не гномом, и макушка
 * приходится ровно на заявленный рост — модель нельзя собрать так, чтобы
 * фигура оказалась ниже, чем сказано в appearance.height.
 *
 * Тело сплющено по оси Z: в фас человек заметно шире, чем в профиль. Это
 * не украшение — сплющенный корпус сразу показывает, куда персонаж смотрит,
 * а круглый в плане выглядел бы одинаково со всех сторон.
 */

/** Во сколько раз корпус уже в профиль, чем в фас. */
const BODY_DEPTH = 0.62

/** Обувь пока не входит во внешность: у всех одинаковая тёмная. */
const SHOE_COLOR = '#2b3038'

/** Доля руки до локтя и доля ноги до колена. */
const ELBOW = 0.46
const KNEE = 0.53

/** Зрачки. Вблизи именно они превращают шар в голову. */
const EYE_COLOR = '#20242b'

export function ProceduralCharacter({
  appearance,
  walking,
}: {
  appearance: CharacterAppearance
  walking: boolean
}) {
  const body = useRef<Group>(null)
  const legLeft = useRef<Group>(null)
  const legRight = useRef<Group>(null)
  const armLeft = useRef<Group>(null)
  const armRight = useRef<Group>(null)

  const h = appearance.height
  const build = appearance.build

  // Опорные высоты скелета.
  const headRadius = h * 0.066
  const headY = h - headRadius
  const headBottom = headY - headRadius
  const shoulderY = h * 0.81
  const hipY = h * 0.47
  const waistY = hipY + (shoulderY - hipY) * 0.45

  // Ширины. Плечи шире таза, талия уже обоих — иначе корпус читается
  // как бочка, а не как человек.
  const shoulderHalf = h * (0.1 + build * 0.03)
  const waistHalf = shoulderHalf * (0.72 + build * 0.12)
  const hipHalf = shoulderHalf * (0.78 + build * 0.08)
  const pelvisBottom = hipY - h * 0.03

  // Руки висят чуть за краем плеч: если посадить их вплотную к корпусу,
  // силуэт склеивается в один овал и рук просто не видно. Предплечье тоньше
  // плеча, голень тоньше бедра — на равных цилиндрах конечности выглядят
  // трубами, а не руками и ногами.
  const armRadius = h * (0.026 + build * 0.006)
  const armLength = h * 0.33
  const armX = shoulderHalf - armRadius * 0.45
  const armY = shoulderY - h * 0.025
  const upperArm = armLength * ELBOW
  const foreArm = armLength - upperArm

  const legRadius = h * (0.039 + build * 0.008)
  const legX = h * 0.058
  const footHeight = h * 0.035
  const footLength = h * 0.125
  const legSpan = hipY - footHeight
  const thigh = legSpan * KNEE
  const shin = legSpan - thigh

  const neckRadius = headRadius * 0.45
  const neckBottom = shoulderY - h * 0.015
  const neckTop = headBottom + headRadius * 0.25

  const hairRadius =
    headRadius * (appearance.hairStyle === 'medium' ? 1.09 : 1.04)

  useFrame((state) => {
    const phase = state.clock.elapsedTime * 8
    const swing = walking ? Math.sin(phase) * 0.5 : 0
    if (legLeft.current) legLeft.current.rotation.x = swing
    if (legRight.current) legRight.current.rotation.x = -swing
    if (armLeft.current) armLeft.current.rotation.x = -swing * 0.55
    if (armRight.current) armRight.current.rotation.x = swing * 0.55
    // Шаг подкидывает корпус вверх дважды за цикл. Амплитуда крошечная:
    // это признак жизни, а не прыжки.
    if (body.current) {
      body.current.position.y = walking ? Math.abs(Math.sin(phase)) * h * 0.008 : 0
    }
  })

  return (
    <group ref={body}>
      {/* --- Ноги со ступнёй, приделанной к голени: шагает нога целиком --- */}
      {[
        { ref: legLeft, x: -legX },
        { ref: legRight, x: legX },
      ].map((leg, index) => (
        <group key={index} ref={leg.ref} position={[leg.x, hipY, 0]}>
          <mesh position={[0, -thigh / 2, 0]} castShadow>
            <capsuleGeometry args={[legRadius, thigh - legRadius * 2, 4, 10]} />
            <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
          </mesh>
          <mesh position={[0, -thigh - shin / 2, 0]} castShadow>
            <capsuleGeometry
              args={[legRadius * 0.78, shin - legRadius * 1.56, 4, 10]}
            />
            <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
          </mesh>
          <mesh
            position={[0, -legSpan - footHeight / 2, footLength * 0.25]}
            castShadow
          >
            <boxGeometry args={[legRadius * 1.75, footHeight, footLength]} />
            <meshStandardMaterial color={SHOE_COLOR} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* --- Корпус. Сплющен по Z целиком, вместе с плечами --- */}
      <group scale={[1, 1, BODY_DEPTH]}>
        <mesh position={[0, (pelvisBottom + waistY) / 2, 0]} castShadow>
          <cylinderGeometry args={[waistHalf, hipHalf, waistY - pelvisBottom, 16]} />
          <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
        </mesh>
        <mesh position={[0, (waistY + shoulderY) / 2, 0]} castShadow>
          <cylinderGeometry args={[shoulderHalf, waistHalf, shoulderY - waistY, 16]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
        {/* Скруглённый верх плеч: у голого цилиндра срез виден сверху. */}
        <mesh position={[0, shoulderY, 0]} scale={[1, 0.26, 1]} castShadow>
          <sphereGeometry args={[shoulderHalf, 16, 12]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
      </group>

      {/* --- Руки --- */}
      {[
        { ref: armLeft, x: -armX },
        { ref: armRight, x: armX },
      ].map((arm, index) => (
        <group key={index} ref={arm.ref} position={[arm.x, armY, 0]}>
          <mesh position={[0, -upperArm / 2, 0]} castShadow>
            <capsuleGeometry args={[armRadius, upperArm - armRadius * 2, 4, 10]} />
            <meshStandardMaterial color={appearance.top} roughness={0.85} />
          </mesh>
          <mesh position={[0, -upperArm - foreArm / 2, 0]} castShadow>
            <capsuleGeometry
              args={[armRadius * 0.82, foreArm - armRadius * 1.64, 4, 10]}
            />
            <meshStandardMaterial color={appearance.top} roughness={0.85} />
          </mesh>
          <mesh position={[0, -armLength, 0]} castShadow>
            <sphereGeometry args={[armRadius, 10, 8]} />
            <meshStandardMaterial color={appearance.skin} roughness={0.75} />
          </mesh>
        </group>
      ))}

      {/* --- Шея. Без неё голова садится прямо на плечи --- */}
      <mesh position={[0, (neckBottom + neckTop) / 2, 0]} castShadow>
        <cylinderGeometry args={[neckRadius, neckRadius * 1.15, neckTop - neckBottom, 12]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.75} />
      </mesh>

      {/* --- Голова --- */}
      <mesh position={[0, headY, 0]} scale={[0.95, 1, 0.97]} castShadow>
        <sphereGeometry args={[headRadius, 20, 16]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.75} />
      </mesh>

      {[-1, 1].map((sideSign) => (
        <mesh
          key={sideSign}
          position={[
            sideSign * headRadius * 0.35,
            headY + headRadius * 0.1,
            headRadius * 0.93,
          ]}
          scale={[1, 1.1, 0.55]}
        >
          <sphereGeometry args={[headRadius * 0.12, 10, 8]} />
          <meshStandardMaterial color={EYE_COLOR} roughness={0.35} />
        </mesh>
      ))}

      {appearance.hairStyle !== 'bald' && (
        <mesh position={[0, headY, 0]} scale={[0.95, 1, 0.97]} castShadow>
          <sphereGeometry
            args={[hairRadius, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2.3]}
          />
          <meshStandardMaterial color={appearance.hair} roughness={0.95} />
        </mesh>
      )}

      {appearance.hairStyle === 'ponytail' && (
        <mesh
          position={[0, headY - headRadius * 0.2, -headRadius * 0.95]}
          castShadow
        >
          <sphereGeometry args={[headRadius * 0.42, 12, 10]} />
          <meshStandardMaterial color={appearance.hair} roughness={0.95} />
        </mesh>
      )}

      {appearance.facialHair !== 'none' && (
        <mesh
          position={[
            0,
            headY - headRadius * (appearance.facialHair === 'moustache' ? 0.18 : 0.48),
            headRadius * 0.7,
          ]}
          castShadow
        >
          <boxGeometry
            args={[
              headRadius * 1.05,
              headRadius * (appearance.facialHair === 'beard' ? 0.9 : 0.26),
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
        <mesh position={[0, headY + headRadius * 0.1, headRadius * 0.92]}>
          <boxGeometry args={[headRadius * 1.6, headRadius * 0.34, headRadius * 0.12]} />
          <meshStandardMaterial color="#15181d" roughness={0.4} metalness={0.3} />
        </mesh>
      )}
    </group>
  )
}

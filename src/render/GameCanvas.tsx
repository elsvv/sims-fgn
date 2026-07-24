import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useWorld } from './useWorld'

/** Гоняет симуляцию в такт кадрам. Ничего не рисует. */
function SimulationLoop() {
  const world = useWorld()
  useFrame((_, delta) => world.tick(delta))
  return null
}

export function GameCanvas() {
  return (
    <Canvas
      shadows
      camera={{ position: [22, 20, 26], fov: 32 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0f1116']} />
      <SimulationLoop />

      <hemisphereLight intensity={0.55} groundColor="#2a2622" />
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, -0.02, 6]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#191c22" />
      </mesh>

      <OrbitControls
        target={[12, 0, 6]}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minDistance={14}
        maxDistance={55}
      />
    </Canvas>
  )
}

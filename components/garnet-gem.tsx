'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

function GarnetCrystal({ size = 1 }: { size?: number }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  // Garnet red color
  const garnetColor = useMemo(() => new THREE.Color('#C93545'), [])
  const garnetDeep = useMemo(() => new THREE.Color('#8B1A2B'), [])
  const garnetGlow = useMemo(() => new THREE.Color('#E8707E'), [])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15
      meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.08
    }
    if (glowRef.current) {
      const scale = 1.15 + Math.sin(t * 0.8) * 0.05
      glowRef.current.scale.setScalar(scale)
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <group scale={size}>
        {/* Inner glow sphere */}
        <mesh ref={glowRef}>
          <icosahedronGeometry args={[0.85, 1]} />
          <meshBasicMaterial
            color={garnetGlow}
            transparent
            opacity={0.06}
          />
        </mesh>

        {/* Main gem — icosahedron (diamond-like faceted shape) */}
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[0.7, 0]} />
          <MeshDistortMaterial
            color={garnetColor}
            emissive={garnetDeep}
            emissiveIntensity={0.4}
            roughness={0.15}
            metalness={0.9}
            distort={0.05}
            speed={1.5}
            transparent
            opacity={0.92}
          />
        </mesh>

        {/* Facet highlight edges */}
        <mesh>
          <icosahedronGeometry args={[0.71, 0]} />
          <meshBasicMaterial
            color={garnetGlow}
            wireframe
            transparent
            opacity={0.08}
          />
        </mesh>

        {/* Ambient point light from inside */}
        <pointLight color={garnetColor} intensity={0.6} distance={4} />
      </group>
    </Float>
  )
}

type GarnetGemProps = {
  size?: number
  className?: string
}

export function GarnetGem({ size = 1, className }: GarnetGemProps) {
  return (
    <div className={className} style={{ pointerEvents: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} color="#F0ECE8" />
        <directionalLight position={[-3, -2, 4]} intensity={0.3} color="#E8707E" />
        <GarnetCrystal size={size} />
      </Canvas>
    </div>
  )
}

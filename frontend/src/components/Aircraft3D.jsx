
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

function AircraftModel() {
  const aircraft = useRef();

  useFrame((state, delta) => {
    if (!aircraft.current) return;

    aircraft.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.035;
    aircraft.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.045;
  });

  return (
    <group ref={aircraft} scale={2.2}>

      {/* Main fuselage */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.19, 0.19, 2.5, 32]} />
        <meshStandardMaterial color="#f4f6fa" metalness={0.65} roughness={0.28} />
      </mesh>

      {/* Aircraft nose */}
      <mesh position={[1.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.19, 0.55, 32]} />
        <meshStandardMaterial color="#dce3ee" metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Main wings */}
      <mesh position={[-0.15, -0.015, 0]}>
        <boxGeometry args={[0.65, 0.09, 3.5]} />
        <meshStandardMaterial color="#dce2ec" metalness={0.55} roughness={0.3} />
      </mesh>

      {/* Rear wings */}
      <mesh position={[-1.05, 0.02, 0]}>
        <boxGeometry args={[0.42, 0.07, 1.45]} />
        <meshStandardMaterial color="#e5eaf2" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Vertical tail fin */}
      <mesh position={[-1.12, 0.32, 0]}>
        <boxGeometry args={[0.48, 0.72, 0.09]} />
        <meshStandardMaterial color="#e32945" metalness={0.45} roughness={0.3} />
      </mesh>

      {/* Cockpit */}
      <mesh position={[0.68, 0.17, 0]}>
        <sphereGeometry args={[0.22, 24, 16]} />
        <meshStandardMaterial
          color="#172e50"
          metalness={0.8}
          roughness={0.12}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* HEROINE lettering - near side */}
      <Text
        position={[0.05, 0.09, 0.195]}
        fontSize={0.19}
        color="#e32945"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        HEROINE
      </Text>

      {/* HEROINE lettering - far side */}
      <Text
        position={[0.05, 0.09, -0.195]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.19}
        color="#e32945"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        HEROINE
      </Text>

      {/* Engine details */}
      <mesh position={[-0.75, -0.12, 0.65]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.38, 24]} />
        <meshStandardMaterial color="#526174" metalness={0.8} roughness={0.25} />
      </mesh>

      <mesh position={[-0.75, -0.12, -0.65]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.38, 24]} />
        <meshStandardMaterial color="#526174" metalness={0.8} roughness={0.25} />
      </mesh>

    </group>
  );
}

export default function Aircraft3D() {
  return (
    <Canvas
      camera={{ position: [0, 2.2, 6], fov: 38 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 5, 5]} intensity={2.5} />
      <pointLight position={[-3, 2, -3]} intensity={1.2} color="#8abaff" />

      <AircraftModel />
    </Canvas>
  );
}

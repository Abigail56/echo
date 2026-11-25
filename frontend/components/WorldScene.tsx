import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { supportsWebGL2 } from './Human3D';

export type Person = {
  id: string;
  name: string;
  x: number;
  z: number;
  color: string;
  speaking?: boolean;
  muted?: boolean;
};

function Human({ person }: { person: Person }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/avatars/michelle.glb');
  const model = useMemo(() => {
    const copy = clone(scene);
    copy.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return copy;
  }, [scene]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    group.current.position.lerp(new THREE.Vector3(person.x, 0, person.z), Math.min(1, delta * 9));
    group.current.traverse(object => {
      if (!(object instanceof THREE.Bone)) return;
      const name = object.name.toLowerCase();
      if (name.includes('head') && !name.includes('headtop')) {
        object.rotation.y = THREE.MathUtils.lerp(object.rotation.y, person.speaking ? Math.sin(clock.elapsedTime * 2.2) * 0.045 : 0, delta * 4);
        object.rotation.x = THREE.MathUtils.lerp(object.rotation.x, person.speaking ? -0.035 : 0, delta * 4);
      }
    });
  });

  return (
    <group ref={group} position={[person.x, 0, person.z]}>
      <primitive object={model} scale={0.85} />
      <Text position={[0, 1.65, 0]} fontSize={0.17} color="white" anchorX="center" outlineWidth={0.012} outlineColor="#08111e">
        {`${person.name.slice(0, 22)}${person.muted ? ' · muted' : ''}`}
      </Text>
      {person.speaking && <mesh position={[0, 1.82, 0]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color="#63e6b5" />
      </mesh>}
    </group>
  );
}

function Scene({ people }: { people: Person[] }) {
  return (
    <Canvas camera={{ position: [6, 8, 11], fov: 55 }} dpr={[1, 1.5]} shadows>
      <color attach="background" args={['#050507']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 8, 5]} intensity={1.7} castShadow color="#d9c9ff" />
      <gridHelper args={[40, 40, '#42205c', '#21182e']} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0d0b14" />
      </mesh>
      <Suspense fallback={null}>
        {people.map(person => <Human key={person.id} person={person} />)}
      </Suspense>
      <OrbitControls maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}

export default function WorldScene({ people }: { people: Person[] }) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setWebglAvailable(supportsWebGL2());
  }, []);

  if (webglAvailable === null) return <div className="human-avatar human-avatar-error" role="status">Loading 3D room…</div>;
  if (!webglAvailable) return <div className="human-avatar human-avatar-error" role="status">This browser session could not create a WebGL 2 context. Try Chrome or Edge with graphics acceleration enabled, then reload.</div>;
  return <div className="world-scene">
    <Scene people={people} />
  </div>;
}

useGLTF.preload('/avatars/michelle.glb');

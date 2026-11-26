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
  const targetPosition = useRef(new THREE.Vector3());
  const { model, headBones } = useMemo(() => {
    const copy = clone(scene);
    const bones: THREE.Bone[] = [];
    copy.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      if (object instanceof THREE.Bone) {
        const name = object.name.toLowerCase();
        if (name.includes('head') && !name.includes('headtop')) bones.push(object);
      }
    });
    copy.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(copy);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      if (Number.isFinite(maxDimension) && maxDimension > 0.0001) {
        const scale = Math.min(1.75 / Math.max(size.y, 0.0001), 1.8 / maxDimension);
        copy.scale.setScalar(scale);
        copy.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      }
    }
    return { model: copy, headBones: bones };
  }, [scene]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    targetPosition.current.set(person.x, 0, person.z);
    group.current.position.lerp(targetPosition.current, Math.min(1, delta * 9));
    for (const bone of headBones) {
      bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, person.speaking ? Math.sin(clock.elapsedTime * 2.2) * 0.045 : 0, Math.min(1, delta * 4));
      bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, person.speaking ? -0.035 : 0, Math.min(1, delta * 4));
    }
  });

  return (
    <group ref={group} position={[person.x, 0, person.z]}>
      <primitive object={model} />
      <Text position={[0, 1.93, 0]} fontSize={0.2} color="#f1eaff" anchorX="center" outlineWidth={0.014} outlineColor="#141324">
        {`${person.name.slice(0, 22)}${person.muted ? ' · muted' : ''}`}
      </Text>
      {person.speaking ? <mesh position={[0, 2.14, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#80e6c1" />
      </mesh> : null}
    </group>
  );
}

function Scene({ people }: { people: Person[] }) {
  return (
    <Canvas camera={{ position: [6, 6.8, 11], fov: 53, near: 0.1, far: 130 }} dpr={[1, 1.5]} shadows>
      <color attach="background" args={['#101221']} />
      <fog attach="fog" args={['#101221', 20, 48]} />
      <ambientLight intensity={1.3} />
      <hemisphereLight args={['#d4c7ff', '#181525', 1.2]} />
      <directionalLight position={[4, 9, 5]} intensity={2.1} castShadow color="#e9dfff" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-6, 3, -4]} intensity={18} color="#8e77e4" distance={20} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#161828" roughness={0.89} />
      </mesh>
      <gridHelper args={[40, 40, '#51417c', '#24243d']} position={[0, -0.045, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <ringGeometry args={[3.8, 3.86, 80]} />
        <meshBasicMaterial color="#a28cf0" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.021, 0]}>
        <ringGeometry args={[6.8, 6.84, 96]} />
        <meshBasicMaterial color="#7a67bd" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <Suspense fallback={null}>
        {people.map(person => <Human key={person.id} person={person} />)}
      </Suspense>
      <OrbitControls enableDamping minDistance={3.5} maxDistance={28} maxPolarAngle={Math.PI / 2.1} enablePan={false} target={[0, 0.9, 0]} />
    </Canvas>
  );
}

export default function WorldScene({ people }: { people: Person[] }) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setWebglAvailable(supportsWebGL2());
  }, []);

  if (webglAvailable === null) return <div className="world-scene world-scene-fallback" role="status">Loading 3D room…</div>;
  if (!webglAvailable) return <div className="world-scene world-scene-fallback" role="status">
    <strong>3D preview unavailable</strong>
    <span>Your browser could not start WebGL 2. Text chat and voice controls below remain available.</span>
  </div>;
  return <div className="world-scene" role="img" aria-label={`3D room with ${people.length} visible participant avatars. Use the participant list below for names and voice status.`}>
    <Scene people={people} />
  </div>;
}

useGLTF.preload('/avatars/michelle.glb');

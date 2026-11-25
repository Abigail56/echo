import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export function supportsWebGL2(): boolean {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2');
  if (!context) return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

function RealHuman({ talking, mouthOpen, url }: { talking: boolean; mouthOpen: number; url: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const modelClone = clone(scene);
    modelClone.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return modelClone;
  }, [scene]);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const time = clock.elapsedTime;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, Math.sin(time * 0.32) * 0.08, delta * 1.5);
    group.current.position.y = -0.82 + Math.sin(time * 1.1) * 0.012;

    group.current.traverse(object => {
      if (!(object instanceof THREE.Bone)) return;
      const name = object.name.toLowerCase();
      if (name.includes('head') && !name.includes('headtop')) {
        object.rotation.z = THREE.MathUtils.lerp(object.rotation.z, talking ? Math.sin(time * 0.9) * 0.025 : 0, delta * 2);
        object.rotation.x = THREE.MathUtils.lerp(object.rotation.x, talking ? -0.025 - mouthOpen * 0.012 : 0, delta * 2);
      }
    });
  });

  return <primitive ref={group} object={model} position={[0, -0.82, 0]} rotation={[0, Math.PI, 0]} />;
}

function AvatarScene({ talking, mouthOpen, modelUrl }: { talking: boolean; mouthOpen: number; modelUrl?: string }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [0, 0.05, 4.2], fov: 32, near: 0.1, far: 100 }}
    >
      <color attach="background" args={['#091426']} />
      <fog attach="fog" args={['#091426', 5, 9]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#d9efff', '#1b1a27', 1.35]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, 1]} intensity={0.75} color="#9aaeff" />
      <mesh receiveShadow position={[0, -0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.7, 64]} />
        <meshStandardMaterial color="#101c2b" roughness={0.82} metalness={0.08} />
      </mesh>
      <Suspense fallback={null}>
        <RealHuman talking={talking} mouthOpen={mouthOpen} url={modelUrl || '/avatars/michelle.glb'} />
      </Suspense>
      <OrbitControls
        makeDefault
        target={[0, 0.05, 0]}
        enablePan={false}
        minDistance={1.8}
        maxDistance={7}
        minPolarAngle={Math.PI * 0.28}
        maxPolarAngle={Math.PI * 0.72}
      />
    </Canvas>
  );
}

class AvatarSceneBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="human-avatar human-avatar-error" role="alert">Could not load this 3D avatar model. Check the GLB and try again.</div>;
    }
    return this.props.children;
  }
}

export default function Human3D({
  talking = false,
  mouthOpen = 0,
  color = '#4dd9ec',
  modelUrl,
}: {
  talking?: boolean;
  mouthOpen?: number;
  color?: string;
  modelUrl?: string;
}) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglAvailable(supportsWebGL2());
  }, []);

  if (webglAvailable === null) {
    return <div className="human-avatar human-avatar-error" role="status">Loading 3D avatar…</div>;
  }

  if (!webglAvailable) {
    return (
      <div className="human-avatar human-avatar-error" role="status">
        <strong>3D rendering unavailable</strong>
        <span>This browser session could not create a WebGL 2 context. Try Chrome or Edge with graphics acceleration enabled, then reload.</span>
      </div>
    );
  }

  return (
    <div
      className={talking ? 'human-avatar talking' : 'human-avatar'}
      aria-label={`Interactive 3D human avatar${talking ? ', speaking' : ''}`}
      style={{ '--avatar-accent': color } as React.CSSProperties}
    >
      <AvatarSceneBoundary key={modelUrl || 'starter'}>
        <AvatarScene talking={talking} mouthOpen={mouthOpen} modelUrl={modelUrl} />
      </AvatarSceneBoundary>
    </div>
  );
}

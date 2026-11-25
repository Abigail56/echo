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

/** Fit arbitrary imported GLBs to a predictable, head-safe studio framing. */
function fitModelToPreview(model: THREE.Object3D) {
  // Updating the cloned skeleton before measuring avoids stale pose/world matrices.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largest) || largest <= 0.0001) return;

  // A full body occupies ~70% of the preview height; wide models also fit.
  const scale = Math.min(2.5 / Math.max(size.y, 0.0001), 2.4 / largest);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);
}

function RealHuman({ talking, mouthOpen, url }: { talking: boolean; mouthOpen: number; url: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);
  const { model, headBones } = useMemo(() => {
    const modelClone = clone(scene);
    const bones: THREE.Bone[] = [];
    modelClone.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      if (object instanceof THREE.Bone) {
        const name = object.name.toLowerCase();
        if (name.includes('head') && !name.includes('headtop')) bones.push(object);
      }
    });
    fitModelToPreview(modelClone);
    return { model: modelClone, headBones: bones };
  }, [scene]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const time = clock.elapsedTime;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, Math.sin(time * 0.32) * 0.08, Math.min(1, delta * 1.5));
    group.current.position.y = Math.sin(time * 1.1) * 0.01;
    for (const bone of headBones) {
      bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, talking ? Math.sin(time * 0.9) * 0.025 : 0, Math.min(1, delta * 2));
      bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, talking ? -0.025 - mouthOpen * 0.012 : 0, Math.min(1, delta * 2));
    }
  });

  return <group ref={group} rotation={[0, Math.PI, 0]}><primitive object={model} /></group>;
}

function AvatarScene({ talking, mouthOpen, modelUrl }: { talking: boolean; mouthOpen: number; modelUrl?: string }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [0, 0.05, 5], fov: 35, near: 0.1, far: 100 }}
    >
      <color attach="background" args={['#101321']} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#e6efff', '#2b213d', 1.25]} />
      <directionalLight position={[3, 5, 4]} intensity={2.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -1]} intensity={1.0} color="#b8a4ff" />
      <Suspense fallback={null}>
        <RealHuman talking={talking} mouthOpen={mouthOpen} url={modelUrl || '/avatars/michelle.glb'} />
      </Suspense>
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enablePan={false}
        enableDamping
        minDistance={2.7}
        maxDistance={8}
        minPolarAngle={Math.PI * 0.2}
        maxPolarAngle={Math.PI * 0.8}
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

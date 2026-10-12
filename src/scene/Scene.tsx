import {useFrame, useThree} from '@react-three/fiber';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import React, {useEffect, useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {PINT, SHOT, ShotState} from '../timeline';
import {Backdrop} from './parts';
import {BeerBottle, PintGlass, SambucaBottle, ShotGlass} from './Objects';

/** Studio environment for reflections: dark room with amber + blue strip softboxes. */
const StudioEnvironment: React.FC = () => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#020203');
    const box = (color: THREE.ColorRepresentation, intensity: number, pos: [number, number, number], size: [number, number, number]) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide}),
      );
      m.position.set(...pos);
      m.lookAt(0, 1, 0);
      env.add(m);
    };
    box('#ffffff', 3.0, [-4, 5, 4], [1.2, 6, 0.2]); // tall key strip, front-left
    box('#ffffff', 1.4, [4, 4, 5], [0.6, 5, 0.2]); // fill strip, front-right
    box('#ff8a1e', 5.0, [-5, 2, -4], [2.5, 4, 0.2]); // amber softbox behind beer
    box('#2f6bff', 5.0, [5, 2, -3], [2.5, 4, 0.2]); // blue softbox on sambuca side
    box('#ffffff', 1.5, [0, 8, 0], [6, 0.2, 2]); // overhead
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(env, 0.02);
    scene.environment = rt.texture;
    scene.environmentIntensity = 1;
    scene.background = new THREE.Color('#030304');
    scene.fog = new THREE.Fog('#030304', 7, 16);
    return () => {
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

/** Spot light whose target is part of the scene graph (so it actually aims). */
const Spot: React.FC<{
  position: [number, number, number];
  target: [number, number, number];
  color: string;
  intensity: number;
  angle: number;
  penumbra: number;
}> = ({target, ...props}) => {
  const obj = useMemo(() => new THREE.Object3D(), []);
  obj.position.set(...target);
  return (
    <>
      <primitive object={obj} />
      <spotLight {...props} decay={0} target={obj} />
    </>
  );
};

const CameraRig: React.FC<{shot: ShotState}> = ({shot}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    const {pos, target, fov, roll} = shot.cam;
    camera.position.set(...pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(...target);
    camera.rotateZ(roll);
    camera.fov = fov;
    camera.near = 0.02;
    camera.far = 60;
    camera.updateProjectionMatrix();
  }, [camera, shot]);
  return null;
};

/** Post stack: DoF -> bloom -> chromatic aberration -> ACES + grade + grain + vignette. */
const PostFX: React.FC<{shot: ShotState}> = ({shot}) => {
  const {gl, scene, camera, size} = useThree();
  const fx = useMemo(() => {
    const composer = new EffectComposer(gl, {frameBufferType: THREE.HalfFloatType, multisampling: 4});
    composer.addPass(new RenderPass(scene, camera));
    const dof = new DepthOfFieldEffect(camera, {focusDistance: 3, focusRange: 1.0, bokehScale: 2.5, resolutionScale: 0.5});
    const bloom = new BloomEffect({mipmapBlur: true, luminanceThreshold: 0.62, luminanceSmoothing: 0.3, intensity: 1, radius: 0.78});
    const ca = new ChromaticAberrationEffect({offset: new THREE.Vector2(0.001, 0.001), radialModulation: true, modulationOffset: 0.15});
    const tone = new ToneMappingEffect({mode: ToneMappingMode.ACES_FILMIC});
    const bc = new BrightnessContrastEffect({brightness: -0.015, contrast: 0.16});
    const hs = new HueSaturationEffect({saturation: 0.12});
    const noise = new NoiseEffect({blendFunction: BlendFunction.OVERLAY, premultiply: false});
    noise.blendMode.opacity.value = 0.22;
    const vig = new VignetteEffect({offset: 0.26, darkness: 0.82});
    composer.addPass(new EffectPass(camera, dof));
    composer.addPass(new EffectPass(camera, bloom));
    composer.addPass(new EffectPass(camera, ca));
    composer.addPass(new EffectPass(camera, tone, bc, hs, noise, vig));
    return {composer, dof, bloom, ca, hs, noise, bc};
  }, [gl, scene, camera]);

  useEffect(() => () => fx.composer.dispose(), [fx]);
  useLayoutEffect(() => {
    fx.composer.setSize(size.width, size.height);
  }, [fx, size.width, size.height]);

  useLayoutEffect(() => {
    const f = shot.fx;
    const {pos, target} = shot.cam;
    const focus = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
    fx.dof.cocMaterial.focusDistance = focus;
    fx.dof.cocMaterial.focusRange = Math.max(0.25, focus * 0.38);
    fx.dof.bokehScale = f.bokeh;
    fx.bloom.intensity = f.bloom;
    const c = 0.0007 + f.ca * 0.0045;
    fx.ca.offset.set(c, c * 0.6);
    fx.hs.saturation = 0.12 - f.desat * 0.6;
    fx.bc.contrast = 0.16 + f.desat * 0.12;
  }, [fx, shot]);

  useFrame((_, delta) => {
    fx.composer.render(delta);
  }, 1);
  return null;
};

export const Scene: React.FC<{shot: ShotState}> = ({shot}) => {
  const t = shot.story;
  const tableMat = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#0d0c0c', roughness: 0.32, metalness: 0.35, envMapIntensity: 0.6}),
    [],
  );
  return (
    <>
      <StudioEnvironment />
      <CameraRig shot={shot} />
      <ambientLight intensity={0.06} />
      {/* soft cool key from the front */}
      <Spot position={[1.5, 4.5, 4]} angle={0.55} penumbra={1} intensity={1.6} color="#dfe8ff" target={[0, 0.8, 0]} />
      {/* warm amber rim behind the beer */}
      <Spot position={[-1.3, 1.9, -2.4]} angle={0.5} penumbra={0.8} intensity={9} color="#ff8a1c" target={[PINT.pos[0], 0.8, 0]} />
      <pointLight position={[-0.6, 0.75, -0.75]} intensity={2.6} distance={2.2} decay={1} color="#ff9a2e" />
      {/* cool blue accent on the sambuca side */}
      <Spot position={[2.6, 1.8, -0.6]} angle={0.55} penumbra={0.9} intensity={7} color="#2d63ff" target={[SHOT.pos[0], 0.5, SHOT.pos[2]]} />
      <pointLight position={[1.2, 1.0, -0.8]} intensity={1.6} distance={2.5} decay={1} color="#4a7bff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={tableMat}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      <Backdrop t={t} bloomBoost={0.8 + shot.fx.bloom * 0.25} />
      <BeerBottle t={t} />
      <SambucaBottle t={t} />
      <PintGlass t={t} />
      <ShotGlass t={t} camPos={shot.cam.pos} />
      <PostFX shot={shot} />
    </>
  );
};

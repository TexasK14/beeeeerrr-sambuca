import React, {useMemo} from 'react';
import * as THREE from 'three';
import {clamp, easeOutBack, V3, wobble} from '../util';
import {softDotTexture} from './textures';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Translucent blue alcohol flame: fbm-distorted teardrop, white-cyan core,
// blue body, violet licking tips. Output is additive.
const frag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float y = uv.y;
    float n = fbm(vec2(uv.x * 3.2 + uSeed, y * 2.6 - uTime * 3.4));
    float n2 = fbm(vec2(uv.x * 7.0 - uSeed, y * 5.0 - uTime * 6.0));
    float x = (uv.x - 0.5) * 2.0;
    x += (n - 0.5) * 0.9 * y + (n2 - 0.5) * 0.25 * y;
    float width = 0.78 * pow(max(0.0, 1.0 - y), 0.75) * (0.75 + 0.5 * n);
    width *= smoothstep(-0.05, 0.12, y);
    float body = smoothstep(width, width * 0.15, abs(x));
    float tipCut = 1.0 - smoothstep(0.35, 0.95, y + (n - 0.5) * 0.55);
    float a = body * tipCut;
    // detached licks near the top
    float lick = smoothstep(0.62, 0.8, n2) * smoothstep(0.3, 0.7, y) * (1.0 - smoothstep(0.75, 1.0, y)) * smoothstep(0.6, 0.0, abs(x));
    a = max(a, lick * 0.6);

    float core = smoothstep(0.55, 1.0, body) * (1.0 - smoothstep(0.0, 0.45, y));
    vec3 violet = vec3(0.42, 0.18, 1.0);
    vec3 blue = vec3(0.12, 0.42, 1.0);
    vec3 cyan = vec3(0.65, 0.9, 1.0);
    vec3 col = mix(violet, blue, smoothstep(0.0, 0.6, body) * (1.0 - y * 0.6));
    col = mix(col, cyan, core * 0.85);
    // base glow line where the flame touches the liquid
    float base = exp(-y * 14.0) * smoothstep(0.95, 0.2, abs((uv.x - 0.5) * 2.0));
    col += blue * base * 0.8;
    a = clamp(a + base * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(col * a * uIntensity, 1.0);
  }`;

export const Flame: React.FC<{pos: V3; t: number; ignite: number; camPos: V3; radius: number}> = ({
  pos,
  t,
  ignite,
  camPos,
  radius,
}) => {
  const layers = useMemo(
    () =>
      [0, 1, 2].map(
        (i) =>
          new THREE.ShaderMaterial({
            uniforms: {uTime: {value: 0}, uSeed: {value: i * 3.7 + 1.3}, uIntensity: {value: 0}},
            vertexShader: vert,
            fragmentShader: frag,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  );
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDotTexture(),
        color: new THREE.Color(0.15, 0.4, 1.0),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const dt = t - ignite;
  if (dt < 0) return null;
  const grow = easeOutBack(clamp(dt / 0.28), 2.2);
  const burst = 1 + 2.2 * Math.exp(-dt * 7);
  const flicker = 1 + wobble(t * 9, 1) * 0.12 + wobble(t * 23, 2) * 0.06;
  const h = radius * 2.6 * grow * flicker * (1 + 0.6 * Math.exp(-dt * 5));
  const w = radius * 1.9 * grow * (1 + 0.4 * Math.exp(-dt * 6));
  const yaw = Math.atan2(camPos[0] - pos[0], camPos[2] - pos[2]);
  layers.forEach((m, i) => {
    m.uniforms.uTime.value = t;
    m.uniforms.uIntensity.value = (i === 0 ? 1.6 : 0.9) * burst * clamp(dt / 0.05);
  });
  glowMat.opacity = 0.75 * clamp(dt / 0.08) * (0.85 + 0.15 * flicker);
  return (
    <group position={pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={glowMat} renderOrder={10}>
        <circleGeometry args={[radius * 1.25, 32]} />
      </mesh>
      {layers.map((m, i) => (
        <mesh
          key={i}
          material={m}
          rotation={[0, yaw + (i - 1) * 0.35, 0]}
          position={[(i - 1) * radius * 0.18, (h * (i === 0 ? 1 : 0.8)) / 2 - 0.005, 0]}
          scale={[w * (i === 0 ? 1 : 0.8), h * (i === 0 ? 1 : 0.8), 1]}
          renderOrder={11}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      <pointLight color="#3d6bff" intensity={3.2 * clamp(dt / 0.05) * burst * flicker} distance={2.2} decay={1.4} position={[0, h * 0.35, 0]} />
    </group>
  );
};

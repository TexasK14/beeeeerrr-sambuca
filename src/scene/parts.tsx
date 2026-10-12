import React, {useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {clamp, lerp, rng, V3} from '../util';
import {bokehTexture, mistTexture, softDotTexture} from './textures';

/** Dispose a geometry when it's replaced or unmounted. */
export const useDisposable = <T extends {dispose: () => void}>(obj: T) => {
  useEffect(() => () => obj.dispose(), [obj]);
  return obj;
};

const unitSphere = new THREE.SphereGeometry(1, 14, 10);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export const dropletMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.55,
    roughness: 0.02,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0,
    envMapIntensity: 3.2,
    specularIntensity: 1,
    ior: 1.33,
    depthWrite: false,
  });

// ---------------------------------------------------------------------------
// Condensation droplets + a few drips sliding down (with wiped trails).
// ---------------------------------------------------------------------------
export const Droplets: React.FC<{
  radiusAt: (y: number) => number;
  yMin: number;
  yMax: number;
  count: number;
  seed: number;
  t: number;
  drips?: number;
  size?: number;
}> = ({radiusAt, yMin, yMax, count, seed, t, drips = 6, size = 0.012}) => {
  const mat = useMemo(dropletMaterial, []);
  const staticRef = useRef<THREE.InstancedMesh>(null);
  const dripRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = staticRef.current;
    if (!m) return;
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const y = lerp(yMin, yMax, r());
      const a = r() * Math.PI * 2;
      const big = r() < 0.12;
      const s = size * (big ? 1.4 + r() * 1.4 : 0.25 + Math.pow(r(), 2) * 0.9);
      const R = radiusAt(y) + s * 0.25;
      const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      tmpQ.setFromUnitVectors(Z, n);
      tmpP.set(n.x * R, y, n.z * R);
      tmpS.set(s, s * (1.05 + r() * 0.35), s * 0.42);
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count, seed, radiusAt, yMin, yMax, size]);

  // drips: head droplet + thin trail
  const dripData = useMemo(() => {
    const r = rng(seed + 99);
    return new Array(drips).fill(0).map(() => ({
      a: r() * Math.PI * 2,
      period: 2.2 + r() * 2.6,
      phase: r() * 10,
      start: lerp(yMin + (yMax - yMin) * 0.55, yMax, r()),
      s: size * (1.5 + r() * 0.8),
    }));
  }, [drips, seed, yMin, yMax, size]);

  useLayoutEffect(() => {
    const m = dripRef.current;
    if (!m) return;
    dripData.forEach((d, i) => {
      const p = ((t + d.phase) / d.period) % 1;
      const travel = Math.pow(p, 1.35) * (d.start - yMin);
      const y = d.start - travel;
      const n = new THREE.Vector3(Math.cos(d.a), 0, Math.sin(d.a));
      tmpQ.setFromUnitVectors(Z, n);
      const R = radiusAt(y) + d.s * 0.3;
      tmpP.set(n.x * R, y, n.z * R);
      tmpS.set(d.s, d.s * 1.6, d.s * 0.5);
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i * 2, tmpM);
      const ym = (d.start + y) / 2 + d.s;
      const Rm = radiusAt(ym) + 0.002;
      tmpP.set(n.x * Rm, ym, n.z * Rm);
      tmpS.set(d.s * 0.32, Math.max(0.001, (d.start - y) / 2), d.s * 0.18);
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i * 2 + 1, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [t, dripData, radiusAt, yMin]);

  return (
    <group>
      <instancedMesh ref={staticRef} args={[unitSphere, mat, count]} renderOrder={6} frustumCulled={false} />
      <instancedMesh ref={dripRef} args={[unitSphere, mat, drips * 2]} renderOrder={6} frustumCulled={false} />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Fake pour stream: ballistic curve from the bottle mouth to the liquid surface,
// tube with travelling radius wobble, falling head and detaching tail.
// ---------------------------------------------------------------------------
export type StreamSpec = {
  mouth: V3;
  dir: V3; // unit vector of the bottle neck
  speed: number;
  gravity: number;
  surfaceY: number;
  t: number;
  t0: number;
  t1: number;
  r0: number;
  r1: number;
  seed: number;
};

const SEG = 56;
const RING = 14;
const streamIndex = (() => {
  const idx: number[] = [];
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < RING; j++) {
      const a = i * (RING + 1) + j;
      const b = (i + 1) * (RING + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return idx;
})();

export const streamPoint = (s: StreamSpec, tau: number, T: number): V3 => {
  const k = tau / T;
  const amp = 0.006 + 0.012 * k;
  const ph = tau * 55 - s.t * 30 + s.seed;
  return [
    s.mouth[0] + s.dir[0] * s.speed * tau + Math.sin(ph) * amp,
    s.mouth[1] + s.dir[1] * s.speed * tau - 0.5 * s.gravity * tau * tau,
    s.mouth[2] + s.dir[2] * s.speed * tau + Math.cos(ph * 0.7) * amp * 0.7,
  ];
};

export const streamDuration = (s: StreamSpec) => {
  const vy = s.dir[1] * s.speed;
  const h = s.mouth[1] - s.surfaceY;
  return (vy + Math.sqrt(vy * vy + 2 * s.gravity * Math.max(0.001, h))) / s.gravity;
};

export const Stream: React.FC<{spec: StreamSpec; material: THREE.Material}> = ({spec, material}) => {
  const T = streamDuration(spec);
  const head = clamp(spec.t - spec.t0, 0, T);
  const tail = clamp(spec.t - spec.t1, 0, T);
  const visible = spec.t >= spec.t0 && head - tail > 0.002;

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (!visible) return g;
    const pos = new Float32Array((SEG + 1) * (RING + 1) * 3);
    const nor = new Float32Array((SEG + 1) * (RING + 1) * 3);
    const B = new THREE.Vector3(0, 0, 1);
    const Tn = new THREE.Vector3();
    const N = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const tau = lerp(tail, head, i / SEG);
      const p = streamPoint(spec, tau, T);
      const p2 = streamPoint(spec, tau + 0.002, T);
      Tn.set(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]).normalize();
      N.crossVectors(Tn, B).normalize();
      const Bv = new THREE.Vector3().crossVectors(N, Tn).normalize();
      const k = tau / T;
      let r = lerp(spec.r0, spec.r1, Math.sqrt(k));
      r *= 1 + 0.13 * Math.sin(tau * 90 - spec.t * 50 + spec.seed) + 0.07 * Math.sin(tau * 37 - spec.t * 23);
      // rounded falling head / detaching tail
      if (head < T) r *= Math.sqrt(clamp((head - tau) / 0.012 + 0.15));
      if (tail > 0) r *= Math.sqrt(clamp((tau - tail) / 0.012 + 0.15));
      for (let j = 0; j <= RING; j++) {
        const phi = (j / RING) * Math.PI * 2;
        const cx = Math.cos(phi);
        const sx = Math.sin(phi);
        const nx = N.x * cx + Bv.x * sx;
        const ny = N.y * cx + Bv.y * sx;
        const nz = N.z * cx + Bv.z * sx;
        const o = (i * (RING + 1) + j) * 3;
        pos[o] = p[0] + nx * r;
        pos[o + 1] = p[1] + ny * r;
        pos[o + 2] = p[2] + nz * r;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(streamIndex);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.t, spec.mouth[0], spec.mouth[1], spec.dir[0], spec.dir[1], spec.surfaceY, head, tail, visible, T]);
  useDisposable(geo);
  if (!visible) return null;
  return <mesh geometry={geo} material={material} renderOrder={3} frustumCulled={false} />;
};

/** Little droplets jumping out of the impact point while a stream hits the surface. */
export const Splash: React.FC<{at: V3; t: number; active: number; color: string; seed: number; scale?: number}> = ({
  at,
  t,
  active,
  color,
  seed,
  scale = 1,
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 18;
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({color, roughness: 0.05, emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.9}),
    [color],
  );
  const data = useMemo(() => {
    const r = rng(seed);
    return new Array(COUNT).fill(0).map(() => ({
      a: r() * Math.PI * 2,
      vh: 0.25 + r() * 0.5,
      vv: 1.2 + r() * 1.6,
      period: 0.18 + r() * 0.16,
      phase: r(),
      s: 0.006 + r() * 0.01,
    }));
  }, [seed]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    data.forEach((d, i) => {
      const lt = (((t / d.period + d.phase) % 1) + 1) % 1 * d.period;
      const y = d.vv * lt - 0.5 * 24 * lt * lt;
      const sc = active > 0 && y > -0.01 ? d.s * scale * active : 0;
      tmpP.set(at[0] + Math.cos(d.a) * d.vh * lt * scale, at[1] + Math.max(0, y) * scale, at[2] + Math.sin(d.a) * d.vh * lt * scale);
      tmpS.set(sc, sc * 1.3, sc);
      tmpQ.identity();
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [t, at, active, data, scale]);
  return <instancedMesh ref={ref} args={[unitSphere, mat, COUNT]} renderOrder={4} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------
// Cold mist: slowly sinking, rotating soft puffs.
// ---------------------------------------------------------------------------
export const Mist: React.FC<{
  center: V3;
  t: number;
  count: number;
  radius: number;
  height: number;
  opacity: number;
  seed: number;
  color?: string;
  size?: number;
}> = ({center, t, count, radius, height, opacity, seed, color = '#cfe0ff', size = 0.7}) => {
  const tex = mistTexture();
  const puffs = useMemo(() => {
    const r = rng(seed);
    return new Array(count).fill(0).map(() => ({
      a: r() * Math.PI * 2,
      rr: radius * (0.55 + r() * 0.75),
      h: r(),
      sink: 0.05 + r() * 0.08,
      spin: (r() - 0.5) * 0.5,
      s: size * (0.6 + r() * 0.8),
      rot: r() * 6,
      o: 0.5 + r() * 0.5,
    }));
  }, [count, radius, seed, size]);
  const mats = useMemo(
    () =>
      puffs.map(
        () =>
          new THREE.SpriteMaterial({map: tex, color, transparent: true, depthWrite: false, opacity: 0, fog: false}),
      ),
    [puffs, tex, color],
  );
  return (
    <group position={center}>
      {puffs.map((p, i) => {
        const cyc = (((p.h - t * p.sink) % 1) + 1) % 1; // sinks, wraps
        const a = p.a + t * p.spin;
        const m = mats[i];
        m.opacity = opacity * p.o * Math.sin(Math.PI * cyc);
        m.rotation = p.rot + t * p.spin * 0.6;
        const s = p.s * (1.3 - cyc * 0.5);
        return (
          <sprite
            key={i}
            material={m}
            position={[Math.cos(a) * p.rr, cyc * height, Math.sin(a) * p.rr]}
            scale={[s, s * 0.75, 1]}
            renderOrder={8}
          />
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Backdrop: dark gradient wall with amber/blue glows + floating bokeh.
// ---------------------------------------------------------------------------
export const Backdrop: React.FC<{t: number; bloomBoost: number}> = ({t, bloomBoost}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {uBoost: {value: 1}},
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vPos;
          uniform float uBoost;
          void main() {
            vec3 base = vec3(0.012, 0.012, 0.016);
            float amber = exp(-(pow(vPos.x + 2.4, 2.0) * 0.12 + pow(vPos.y - 1.6, 2.0) * 0.22));
            float blue = exp(-(pow(vPos.x - 2.8, 2.0) * 0.12 + pow(vPos.y - 1.9, 2.0) * 0.2));
            vec3 col = base + vec3(1.0, 0.45, 0.08) * amber * 0.32 * uBoost + vec3(0.12, 0.3, 1.0) * blue * 0.26 * uBoost;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );
  mat.uniforms.uBoost.value = bloomBoost;
  const bok = useMemo(() => {
    const r = rng(5);
    const tex = bokehTexture();
    return new Array(26).fill(0).map(() => {
      const warm = r() < 0.55;
      const x = warm ? -4 + r() * 3.8 : 0.2 + r() * 4.2;
      return {
        p: [x, 0.3 + r() * 3.5, -3.5 - r() * 2.5] as V3,
        s: 0.25 + r() * 0.6,
        drift: (r() - 0.5) * 0.08,
        mat: new THREE.SpriteMaterial({
          map: tex,
          color: warm ? new THREE.Color(1.0, 0.55, 0.15) : new THREE.Color(0.25, 0.5, 1.0),
          transparent: true,
          opacity: 0.08 + r() * 0.14,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      };
    });
  }, []);
  return (
    <group>
      <mesh position={[0, 3, -7]} material={mat}>
        <planeGeometry args={[40, 30]} />
      </mesh>
      {bok.map((b, i) => (
        <sprite key={i} material={b.mat} position={[b.p[0] + t * b.drift, b.p[1] + Math.sin(t * 0.6 + i) * 0.05, b.p[2]]} scale={[b.s, b.s, 1]} />
      ))}
    </group>
  );
};

/** Soft blob shadow on the table under an object. */
export const ContactShadow: React.FC<{pos: V3; r: number; opacity?: number}> = ({pos, r, opacity = 0.7}) => {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({map: softDotTexture(), color: '#000000', transparent: true, opacity, depthWrite: false}),
    [opacity],
  );
  return (
    <mesh position={[pos[0], 0.003, pos[2]]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={1}>
      <planeGeometry args={[r * 2.6, r * 2.6]} />
    </mesh>
  );
};

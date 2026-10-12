import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {BEER_FILL_TOP, PINT, SAMBUCA_FILL_TOP, SHOT, STORY} from '../timeline';
import {clamp, easeOutCubic, invLerp, lerp, rng, smooth, V3, wobble} from '../util';
import {Flame} from './Flame';
import {
  BEER_BOTTLE_H,
  beerBottleKeys,
  beerBottleProfile,
  crownCapGeometry,
  glassInnerRadius,
  glassOuterRadius,
  glassProfile,
  radiusFromKeys,
  SAMBUCA_BOTTLE_H,
  sambucaBottleKeys,
  sambucaBottleProfile,
} from './geometry';
import {ContactShadow, Droplets, Mist, Splash, Stream, StreamSpec, useDisposable} from './parts';
import {beerLabelTexture, foamTexture, frostTexture, sambucaLabelTexture, softDotTexture} from './textures';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const clearGlass = (opacity = 0.16) =>
  new THREE.MeshPhysicalMaterial({
    color: '#dfe9f2',
    transparent: true,
    opacity,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.6,
    specularIntensity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

const frostShell = (opacity: number, tint = '#e8f2ff') =>
  new THREE.MeshStandardMaterial({
    color: tint,
    alphaMap: frostTexture(),
    transparent: true,
    opacity,
    roughness: 0.55,
    envMapIntensity: 1.2,
    depthWrite: false,
  });

const beerMat = () =>
  new THREE.MeshPhysicalMaterial({
    color: '#f0960f',
    emissive: '#c25a00',
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.86,
    roughness: 0.12,
    clearcoat: 0.6,
    envMapIntensity: 1.4,
    depthWrite: false,
  });

const streamBeerMat = () =>
  new THREE.MeshPhysicalMaterial({
    color: '#ffb12e',
    emissive: '#ff8400',
    emissiveIntensity: 0.85,
    roughness: 0.06,
    clearcoat: 1,
    envMapIntensity: 2,
    transparent: true,
    opacity: 0.93,
  });

const sambucaMat = (opacity: number) =>
  new THREE.MeshPhysicalMaterial({
    color: '#eef4ff',
    emissive: '#10204a',
    emissiveIntensity: 0.4,
    transparent: true,
    opacity,
    roughness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0,
    envMapIntensity: 3.4,
    specularIntensity: 1,
    depthWrite: false,
  });

const up = (angle: number): V3 => [-Math.sin(angle), Math.cos(angle), 0];
const placeByMouth = (mouth: V3, angle: number, h: number): V3 => {
  const u = up(angle);
  return [mouth[0] - u[0] * h, mouth[1] - u[1] * h, mouth[2]];
};

// ---------------------------------------------------------------------------
// Bottle poses (pure functions of story time; changes are hidden by cuts)
// ---------------------------------------------------------------------------
const BEER_MOUTH_POUR: V3 = [-0.74, 1.88, 0.0];
export const beerBottlePose = (t: number) => {
  if (t < STORY.bottlesLeaveIntro) return {pos: [-0.42, 0, 1.0] as V3, angle: 0, pouring: false};
  if (t < STORY.beerBottleRest) {
    const angle = lerp(-1.42, -1.72, smooth(invLerp(2.6, 3.0, t))) + lerp(0, -0.4, smooth(invLerp(3.0, 5.6, t)));
    return {pos: placeByMouth(BEER_MOUTH_POUR, angle, BEER_BOTTLE_H), angle, pouring: true};
  }
  return {pos: [-1.15, 0, -1.25] as V3, angle: 0, pouring: false};
};

const SAMBUCA_MOUTH_POUR: V3 = [0.73, 1.12, SHOT.pos[2]];
export const sambucaBottlePose = (t: number) => {
  if (t < STORY.bottlesLeaveIntro) return {pos: [0.42, 0, 0.9] as V3, angle: 0, pouring: false};
  if (t < 5.9) return {pos: [1.35, 0, -0.8] as V3, angle: 0, pouring: false};
  if (t < STORY.sambucaBottleRest) {
    const angle = lerp(1.85, 2.12, smooth(invLerp(5.95, 6.75, t)));
    return {pos: placeByMouth(SAMBUCA_MOUTH_POUR, angle, SAMBUCA_BOTTLE_H), angle, pouring: true};
  }
  return {pos: [0.12, 0, -1.0] as V3, angle: 0, pouring: false};
};

// ---------------------------------------------------------------------------
// Beer bottle
// ---------------------------------------------------------------------------
export const BeerBottle: React.FC<{t: number}> = ({t}) => {
  const pose = beerBottlePose(t);
  const geo = useMemo(() => new THREE.LatheGeometry(beerBottleProfile(), 72), []);
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#6b3208',
        emissive: '#3a1400',
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.86,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMapIntensity: 2.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const inner = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#7a3a04', emissive: '#a24b00', emissiveIntensity: 0.55, roughness: 0.3}),
    [],
  );
  const frost = useMemo(() => frostShell(0.3, '#f4e9dc'), []);
  const label = useMemo(
    () => new THREE.MeshStandardMaterial({map: beerLabelTexture(), roughness: 0.55, envMapIntensity: 0.6, side: THREE.DoubleSide}),
    [],
  );
  const capGeo = useMemo(crownCapGeometry, []);
  const capMat = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#d4b04a', metalness: 1, roughness: 0.22, envMapIntensity: 2}),
    [],
  );
  const radiusAt = useMemo(() => radiusFromKeys(beerBottleKeys), []);

  // cap: on the bottle until the pop, then a world-space tumble
  const dtPop = t - STORY.capPop;
  const capOn = dtPop < 0;
  const capWorld: V3 = [
    pose.pos[0] + 0.55 * dtPop,
    BEER_BOTTLE_H + 0.03 + 7.5 * dtPop - 0.5 * 18 * dtPop * dtPop,
    pose.pos[2] + 1.0 * dtPop,
  ];
  const fill = t < STORY.bottlesLeaveIntro ? 1.7 : 0;

  return (
    <group>
      <group position={pose.pos} rotation={[0, 0, pose.angle]}>
        {fill > 0 && (
          <mesh position={[0, fill / 2 + 0.03, 0]} material={inner} renderOrder={1}>
            <cylinderGeometry args={[0.27, 0.27, fill, 40]} />
          </mesh>
        )}
        <mesh geometry={geo} material={glass} renderOrder={5} />
        <mesh geometry={geo} material={frost} scale={[1.012, 1, 1.012]} renderOrder={6} />
        <mesh position={[0, 0.95, 0]} rotation={[0, -Math.PI * 0.2, 0]} material={label} renderOrder={6}>
          <cylinderGeometry args={[0.305, 0.305, 0.72, 64, 1, true, -Math.PI * 0.5, Math.PI * 1.4]} />
        </mesh>
        <Droplets radiusAt={radiusAt} yMin={0.08} yMax={2.25} count={800} seed={3} t={t} drips={7} size={0.008} />
        {capOn && <mesh geometry={capGeo} material={capMat} position={[0, BEER_BOTTLE_H + 0.02, 0]} />}
      </group>
      {!capOn && dtPop < 1.2 && (
        <mesh geometry={capGeo} material={capMat} position={capWorld} rotation={[dtPop * 22, dtPop * 9, dtPop * 15]} />
      )}
      {/* vapor puff out of the neck after the pop */}
      {!capOn && dtPop < 1.6 && pose.angle === 0 && (
        <Mist
          center={[pose.pos[0], BEER_BOTTLE_H - 0.1 + dtPop * 0.5, pose.pos[2]]}
          t={t * 0.4}
          count={10}
          radius={0.05 + dtPop * 0.25}
          height={0.5 + dtPop * 0.6}
          opacity={0.55 * Math.exp(-dtPop * 2.5)}
          seed={77}
          size={0.35 + dtPop * 0.6}
          color="#eef4ff"
        />
      )}
      {/* sinking cold mist around the bottle */}
      {!pose.pouring && (
        <Mist center={[pose.pos[0], 0, pose.pos[2]]} t={t} count={22} radius={0.45} height={2.2} opacity={0.2} seed={41} size={0.75} />
      )}
      {!pose.pouring && <ContactShadow pos={pose.pos} r={0.42} />}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Sambuca bottle (clear glass, clear liquid, generic label)
// ---------------------------------------------------------------------------
export const SambucaBottle: React.FC<{t: number}> = ({t}) => {
  const pose = sambucaBottlePose(t);
  const geo = useMemo(() => new THREE.LatheGeometry(sambucaBottleProfile(), 72), []);
  const glass = useMemo(() => clearGlass(0.2), []);
  const liquid = useMemo(() => sambucaMat(0.22), []);
  const label = useMemo(
    () => new THREE.MeshStandardMaterial({map: sambucaLabelTexture(), roughness: 0.45, envMapIntensity: 0.7, side: THREE.DoubleSide}),
    [],
  );
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#cfd6e0', metalness: 1, roughness: 0.18, envMapIntensity: 2.2}),
    [],
  );
  // liquid inside drops after the pour; when tilted it is a short slug near the neck
  const level = t < 5.9 ? 1.75 : 1.45;
  return (
    <group>
      <group position={pose.pos} rotation={[0, 0, pose.angle]}>
        {!pose.pouring && (
          <mesh position={[0, level / 2 + 0.05, 0]} material={liquid} renderOrder={2}>
            <cylinderGeometry args={[0.3, 0.3, level, 48]} />
          </mesh>
        )}
        <mesh geometry={geo} material={glass} renderOrder={5} />
        <mesh position={[0, 1.15, 0]} rotation={[0, -Math.PI * 0.2, 0]} material={label} renderOrder={6}>
          <cylinderGeometry args={[0.334, 0.334, 0.95, 64, 1, true, -Math.PI * 0.5, Math.PI * 1.4]} />
        </mesh>
        {/* metal pourer spout */}
        <mesh position={[0, SAMBUCA_BOTTLE_H - 0.06, 0]} material={metal}>
          <cylinderGeometry args={[0.13, 0.13, 0.12, 36]} />
        </mesh>
        <mesh position={[0, SAMBUCA_BOTTLE_H + 0.06, 0]} material={metal}>
          <cylinderGeometry args={[0.04, 0.06, 0.18, 24, 1, true]} />
        </mesh>
      </group>
      {!pose.pouring && <ContactShadow pos={pose.pos} r={0.45} />}
    </group>
  );
};

/** Bottle mouth position + direction for the pour stream. */
const mouthOf = (pos: V3, angle: number, h: number): {mouth: V3; dir: V3} => {
  const u = up(angle);
  return {mouth: [pos[0] + u[0] * h, pos[1] + u[1] * h, pos[2]], dir: u};
};

// ---------------------------------------------------------------------------
// Pint glass + beer + bubbles + foam + stream
// ---------------------------------------------------------------------------
const beerTop = (t: number) => {
  const p = easeOutCubic(invLerp(STORY.beerLevel[0], STORY.beerLevel[1], t));
  const settle = smooth(invLerp(STORY.foamSettle[0], STORY.foamSettle[1], t)) * 0.06;
  return lerp(PINT.base, BEER_FILL_TOP - 0.06, p) + settle;
};
const foamThickness = (t: number) => {
  const g = easeOutCubic(invLerp(STORY.foamGrow[0], STORY.foamGrow[1], t)) * 0.27;
  const s = smooth(invLerp(STORY.foamSettle[0], STORY.foamSettle[1], t)) * 0.1;
  const early = smooth(invLerp(STORY.beerLevel[0], STORY.beerLevel[0] + 0.25, t)) * 0.025;
  return Math.max(early, g - s);
};

const Bubbles: React.FC<{t: number; top: number; inner: (y: number) => number; churn: number}> = ({t, top, inner, churn}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 320;
  const geo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#fff2cc',
        emissive: '#ffd27a',
        emissiveIntensity: 0.6,
        roughness: 0.1,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    [],
  );
  const data = useMemo(() => {
    const r = rng(17);
    return new Array(COUNT).fill(0).map(() => ({
      a: r() * Math.PI * 2,
      rr: Math.sqrt(r()) * 0.9,
      speed: 0.12 + r() * 0.3,
      phase: r(),
      s: 0.004 + Math.pow(r(), 2.5) * 0.012,
      wob: r() * 10,
      streamer: r() < 0.3, // nucleation trails from the bottom
    }));
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const span = top - PINT.base;
    const q = new THREE.Quaternion();
    data.forEach((d, i) => {
      if (span < 0.03) {
        m.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        return;
      }
      const speed = d.speed * (1 + churn * 1.5);
      const c = (((d.phase + (t * speed) / Math.max(0.3, span)) % 1) + 1) % 1;
      const y = PINT.base + 0.01 + c * (span - 0.02);
      const R = inner(y) * d.rr;
      const a = d.streamer ? d.a : d.a + Math.sin(t * 2 + d.wob) * 0.3;
      const x = Math.cos(a) * R + wobble(t * 4 + d.wob, d.wob) * 0.006;
      const z = Math.sin(a) * R;
      const s = d.s * (0.6 + c * 0.8) * (span > 0.1 ? 1 : span / 0.1);
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    });
    m.instanceMatrix.needsUpdate = true;
  }, [t, top, data, inner, churn]);
  return <instancedMesh ref={ref} args={[geo, mat, COUNT]} renderOrder={3} frustumCulled={false} />;
};

const Foam: React.FC<{bottom: number; thickness: number; inner: (y: number) => number; t: number}> = ({
  bottom,
  thickness,
  inner,
  t,
}) => {
  const mat = useMemo(() => {
    const tex = foamTexture();
    return new THREE.MeshStandardMaterial({
      color: '#fff6e6',
      map: tex,
      bumpMap: tex,
      bumpScale: 2.5,
      roughness: 0.85,
      emissive: '#3a2a12',
      emissiveIntensity: 0.25,
    });
  }, []);
  const geo = useMemo(() => {
    const h = Math.max(0.005, thickness);
    const top = bottom + h;
    const rB = inner(bottom) - 0.002;
    const rT = inner(top) - 0.002;
    const dome = 0.035 + h * 0.15;
    const pts = [
      new THREE.Vector2(rB * 0.98, 0),
      new THREE.Vector2(rT, h),
      new THREE.Vector2(rT * 0.92, h + dome * 0.55),
      new THREE.Vector2(rT * 0.7, h + dome * 0.9),
      new THREE.Vector2(rT * 0.35, h + dome),
      new THREE.Vector2(0, h + dome * 1.02),
    ];
    const g = new THREE.LatheGeometry(pts, 64);
    // lumpy surface
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (y > h * 0.8) {
        const a = Math.atan2(z, x);
        const n = Math.sin(a * 7 + t * 0.6) * 0.5 + Math.sin(a * 13 - y * 40) * 0.3 + Math.sin(x * 60 + z * 47) * 0.4;
        p.setY(i, y + n * 0.008);
      }
    }
    g.computeVertexNormals();
    return g;
  }, [bottom, thickness, inner, t]);
  useDisposable(geo);
  if (thickness <= 0.002) return null;
  return <mesh geometry={geo} material={mat} position={[0, bottom, 0]} renderOrder={4} />;
};

export const PintGlass: React.FC<{t: number}> = ({t}) => {
  const geo = useMemo(() => new THREE.LatheGeometry(glassProfile(PINT.rb, PINT.rt, PINT.h, PINT.wall, PINT.base), 80), []);
  const glass = useMemo(() => clearGlass(0.17), []);
  const frost = useMemo(() => frostShell(0.16, '#ffffff'), []);
  const beer = useMemo(beerMat, []);
  const streamMat = useMemo(streamBeerMat, []);
  const inner = useMemo(() => glassInnerRadius(PINT.rb, PINT.rt, PINT.h, PINT.wall), []);
  const outer = useMemo(() => glassOuterRadius(PINT.rb, PINT.rt, PINT.h), []);
  const top = beerTop(t);
  const foam = foamThickness(t);
  const level = top - PINT.base;
  const liquidGeo = useMemo(() => {
    const h = Math.max(0.001, level);
    return new THREE.CylinderGeometry(inner(top) - 0.003, inner(PINT.base) - 0.003, h, 64, 1, false);
  }, [level, top, inner]);
  useDisposable(liquidGeo);

  const bottle = beerBottlePose(t);
  const mo = mouthOf(bottle.pos, bottle.angle, BEER_BOTTLE_H);
  const surface = top + foam * 0.6;
  const spec: StreamSpec = {
    mouth: mo.mouth,
    dir: mo.dir,
    speed: 0.5,
    gravity: 98,
    surfaceY: surface,
    t,
    t0: STORY.beerPour[0],
    t1: STORY.beerPour[1],
    r0: 0.042,
    r1: 0.026,
    seed: 1,
  };
  const pouring = bottle.pouring && t > STORY.beerPour[0] && t < STORY.beerPour[1] + 0.3;
  const churn = clamp(1 - Math.abs(t - 4.3) / 1.6);
  // local coords: group is at PINT.pos, stream is world-space
  const impact: V3 = [mo.mouth[0] + mo.dir[0] * 0.5 * 0.17 - PINT.pos[0], surface, mo.mouth[2] - PINT.pos[2]];
  const splashActive = t > STORY.beerPour[0] + 0.17 && t < STORY.beerPour[1] + 0.1 ? 1 : 0;

  return (
    <group>
      <group position={PINT.pos}>
        {level > 0.004 && (
          <mesh geometry={liquidGeo} material={beer} position={[0, PINT.base + level / 2, 0]} renderOrder={2} />
        )}
        {level > 0.004 && <Bubbles t={t} top={top} inner={inner} churn={churn} />}
        <Foam bottom={top} thickness={foam} inner={inner} t={t} />
        {pouring && <Splash at={impact} t={t} active={splashActive} color="#ffe4a8" seed={9} />}
        <mesh geometry={geo} material={glass} renderOrder={5} />
        <mesh geometry={geo} material={frost} scale={[1.01, 1, 1.01]} renderOrder={6} />
        <Droplets radiusAt={outer} yMin={0.06} yMax={PINT.h - 0.04} count={1000} seed={5} t={t} drips={9} size={0.0075} />
      </group>
      {pouring && <Stream spec={spec} material={streamMat} />}
      <ContactShadow pos={PINT.pos} r={0.45} opacity={0.8} />
      {/* faint cold mist rolling off the frosted pint */}
      <Mist center={[PINT.pos[0], 0, PINT.pos[2]]} t={t + 3} count={10} radius={0.5} height={1.0} opacity={0.08} seed={8} size={0.7} />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Shot glass + sambuca + coffee beans + flame
// ---------------------------------------------------------------------------
const sambucaTop = (t: number) =>
  lerp(SHOT.base, SAMBUCA_FILL_TOP, easeOutCubic(invLerp(STORY.sambucaLevel[0], STORY.sambucaLevel[1], t)));

const BEAN_SPOTS: [number, number, number][] = [
  [-0.07, 0.03, 0.4],
  [0.065, 0.055, 2.1],
  [0.01, -0.075, 4.0],
];

const Bean: React.FC<{landAt: number; t: number; spot: [number, number, number]; surface: number; seed: number}> = ({
  landAt,
  t,
  spot,
  surface,
  seed,
}) => {
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({color: '#3a1d0c', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.6}),
    [],
  );
  const crease = useMemo(() => new THREE.MeshStandardMaterial({color: '#120804', roughness: 0.7}), []);
  const start = landAt - STORY.beanFall;
  if (t < start) return null;
  const dt = t - landAt;
  let y: number;
  let rx: number;
  if (dt < 0) {
    const g = (2 * 1.15) / (STORY.beanFall * STORY.beanFall);
    y = surface + 0.5 * g * dt * dt;
    rx = dt * 14 + seed;
  } else {
    // bob after hitting the surface
    y = surface - 0.012 - 0.03 * Math.exp(-dt * 6) * Math.cos(dt * 18);
    rx = 0.1 * Math.exp(-dt * 4) * Math.sin(dt * 20);
  }
  const drift = dt > 0 ? easeOutCubic(clamp(dt / 1.2)) : 0;
  return (
    <group position={[spot[0] * drift + spot[0] * 0.3, y, spot[1] * drift + spot[1] * 0.3]} rotation={[rx, spot[2] + Math.min(dt, 3) * 0.1, 0]}>
      <mesh material={mat} scale={[0.034, 0.022, 0.048]}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh material={crease} position={[0, 0.0205, 0]} scale={[0.0035, 0.002, 0.04]}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
    </group>
  );
};

const Ripples: React.FC<{t: number; surface: number}> = ({t, surface}) => {
  const mats = useMemo(
    () =>
      STORY.beans.map(
        () => new THREE.MeshBasicMaterial({color: '#dfe9ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}),
      ),
    [],
  );
  return (
    <group>
      {STORY.beans.map((land, i) => {
        const dt = t - land;
        if (dt < 0 || dt > 0.6) return null;
        const r = 0.02 + dt * 0.35;
        mats[i].opacity = 0.55 * (1 - dt / 0.6);
        const s = BEAN_SPOTS[i];
        return (
          <mesh key={i} material={mats[i]} position={[s[0] * 0.3, surface + 0.003, s[1] * 0.3]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={7}>
            <ringGeometry args={[r, r + 0.008, 48]} />
          </mesh>
        );
      })}
    </group>
  );
};

export const ShotGlass: React.FC<{t: number; camPos: V3}> = ({t, camPos}) => {
  const geo = useMemo(() => new THREE.LatheGeometry(glassProfile(SHOT.rb, SHOT.rt, SHOT.h, SHOT.wall, SHOT.base), 72), []);
  const glass = useMemo(() => clearGlass(0.2), []);
  const liquid = useMemo(() => sambucaMat(0.42), []);
  const surfaceMat = useMemo(() => sambucaMat(0.55), []);
  const streamMat = useMemo(() => sambucaMat(0.6), []);
  const inner = useMemo(() => glassInnerRadius(SHOT.rb, SHOT.rt, SHOT.h, SHOT.wall), []);
  const top = sambucaTop(t);
  const level = top - SHOT.base;
  const liquidGeo = useMemo(
    () => new THREE.CylinderGeometry(inner(top) - 0.003, inner(SHOT.base) - 0.003, Math.max(0.001, level), 56, 1, true),
    [level, top, inner],
  );
  useDisposable(liquidGeo);

  const bottle = sambucaBottlePose(t);
  const mo = mouthOf(bottle.pos, bottle.angle, SAMBUCA_BOTTLE_H + 0.15);
  const spec: StreamSpec = {
    mouth: mo.mouth,
    dir: mo.dir,
    speed: 0.45,
    gravity: 98,
    surfaceY: top,
    t,
    t0: STORY.sambucaPour[0],
    t1: STORY.sambucaPour[1],
    r0: 0.024,
    r1: 0.017,
    seed: 4,
  };
  const pouring = bottle.pouring && t > STORY.sambucaPour[0] && t < STORY.sambucaPour[1] + 0.25;
  const glow = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: softDotTexture(),
        color: new THREE.Color(0.2, 0.35, 1.0),
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const flameOn = t >= STORY.ignite;

  return (
    <group>
      <group position={SHOT.pos}>
        {level > 0.004 && (
          <>
            <mesh geometry={liquidGeo} material={liquid} position={[0, SHOT.base + level / 2, 0]} renderOrder={2} />
            <mesh material={surfaceMat} position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <circleGeometry args={[inner(top) - 0.003, 48]} />
            </mesh>
          </>
        )}
        {STORY.beans.map((land, i) => (
          <Bean key={i} landAt={land} t={t} spot={BEAN_SPOTS[i]} surface={top} seed={i * 1.7} />
        ))}
        <Ripples t={t} surface={top} />
        {pouring && (
          <Splash at={[mo.mouth[0] + mo.dir[0] * 0.45 * 0.11 - SHOT.pos[0], top, 0]} t={t} active={t > STORY.sambucaPour[0] + 0.1 && t < STORY.sambucaPour[1] ? 1 : 0} color="#e6eeff" seed={12} scale={0.7} />
        )}
        <mesh geometry={geo} material={glass} renderOrder={5} />
        {/* cool blue under-glow on the table from the accent light */}
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glow} renderOrder={1}>
          <planeGeometry args={[1.2, 1.2]} />
        </mesh>
      </group>
      {pouring && <Stream spec={spec} material={streamMat} />}
      {flameOn && (
        <Flame pos={[SHOT.pos[0], top + 0.002, SHOT.pos[2]]} t={t} ignite={STORY.ignite} camPos={camPos} radius={inner(top) * 0.95} />
      )}
      <ContactShadow pos={SHOT.pos} r={0.3} />
    </group>
  );
};


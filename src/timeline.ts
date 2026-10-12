import {clamp, easeInOutCubic, easeOutCubic, invLerp, lerp, smooth, V3, v3lerp, wobble} from './util';

// ---------------------------------------------------------------------------
// 120 BPM grid: 1 beat = 0.5 s = 15 frames @ 30 fps. Every cut/punch lands on it.
// ---------------------------------------------------------------------------
export const FPS = 30;
export const DURATION = 450;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BEAT = 15;
export const beat = (n: number) => n * BEAT;

// ---------------------------------------------------------------------------
// STORY TIME (seconds). Objects are pure functions of story time, so the edit can
// slow it down (slow-mo), speed it up (ramps), jump back (montage) or freeze it.
// ---------------------------------------------------------------------------
export const STORY = {
  capPop: 2.2,
  bottlesLeaveIntro: 2.6,
  beerPour: [3.0, 5.6] as [number, number],
  beerLevel: [3.12, 5.75] as [number, number],
  foamGrow: [3.5, 5.9] as [number, number],
  foamSettle: [5.9, 7.6] as [number, number],
  beerBottleRest: 5.95,
  sambucaPour: [6.0, 6.72] as [number, number],
  sambucaLevel: [6.06, 6.8] as [number, number],
  sambucaBottleRest: 7.0,
  beans: [6.3, 6.6, 6.9], // landing times
  beanFall: 0.28,
  ignite: 9.0,
};

// World layout (1 unit ~ 10 cm)
export const PINT = {pos: [-0.55, 0, 0] as V3, h: 1.5, rb: 0.33, rt: 0.43, wall: 0.025, base: 0.09};
export const SHOT = {pos: [0.55, 0, 0.15] as V3, h: 0.62, rb: 0.19, rt: 0.24, wall: 0.03, base: 0.16};
export const BEER_FILL_TOP = 1.2; // liquid top (local y) when full, foam sits above
export const SAMBUCA_FILL_TOP = 0.54;

export type Cam = {pos: V3; target: V3; fov: number; roll: number};
export type Fx = {
  flash: number; // white flash overlay 0..1
  shake: number; // camera shake amplitude
  ca: number; // chromatic aberration strength 0..1
  bloom: number; // bloom intensity
  punch: number; // 2D zoom punch (CSS scale - 1)
  whip: number; // signed whip-pan blur/offset amount
  fade: number; // fade to black 0..1
  desat: number; // freeze-frame grade 0..1
  dof: number; // depth of field focus distance hint (world units from camera)
  bokeh: number;
  text: number; // "FIRE & ICE" slam progress (frames since slam, -1 = hidden)
};
export type ShotState = {name: string; story: number; cam: Cam; fx: Fx; local: number; frame: number};

const baseFx = (): Fx => ({
  flash: 0,
  shake: 0,
  ca: 0.08,
  bloom: 1.0,
  punch: 0,
  whip: 0,
  fade: 0,
  desat: 0,
  dof: 3,
  bokeh: 2.5,
  text: -1,
});

// Impulse that decays after frame f0: 1 at f0, ~0 after `len` frames.
const impulse = (f: number, f0: number, len: number) => (f < f0 ? 0 : Math.exp(-((f - f0) / len) * 4) * (f - f0 < len * 2 ? 1 : 0));
const flashAt = (f: number, f0: number) => (f < f0 ? 0 : f - f0 < 2 ? 1 : Math.max(0, 1 - (f - f0 - 2) / 4));

const orbit = (center: V3, radius: number, height: number, angle: number): V3 => [
  center[0] + Math.sin(angle) * radius,
  height,
  center[2] + Math.cos(angle) * radius,
];

type ShotDef = {
  name: string;
  from: number;
  to: number;
  build: (u: number, f: number, local: number) => {story: number; cam: Cam; fx?: Partial<Fx>};
};

const pintTop: V3 = [PINT.pos[0], 1.35, PINT.pos[2]];
const shotCenter: V3 = [SHOT.pos[0], 0.5, SHOT.pos[2]];

export const SHOTS: ShotDef[] = [
  // 0–2s: slow macro push-in across both bottles, droplets sliding, mist drifting
  {
    name: 'macro-bottles',
    from: 0,
    to: beat(4),
    build: (u) => {
      const e = easeInOutCubic(u);
      return {
        story: u * 2.0,
        cam: {
          pos: v3lerp([-1.05, 0.95, 2.75], [0.55, 1.5, 2.3], e),
          target: v3lerp([-0.4, 1.0, 0.95], [0.3, 1.4, 0.9], e),
          fov: lerp(42, 36, e),
          roll: lerp(-0.04, 0.03, e),
        },
        fx: {dof: lerp(1.6, 1.05, e), bokeh: 4, bloom: 0.9},
      };
    },
  },
  // 2–3s: cap pops on the beat, flash + shake, cap tumbles in slow-mo
  {
    name: 'cap-pop',
    from: beat(4),
    to: beat(6),
    build: (u, f) => {
      const e = easeOutCubic(u);
      return {
        story: lerp(2.16, 2.6, u),
        cam: {
          pos: v3lerp([0.05, 2.0, 2.15], [-0.1, 2.2, 1.9], e),
          target: [-0.42, 2.62, 1.0],
          fov: lerp(46, 42, e),
          roll: 0.06,
        },
        fx: {
          flash: flashAt(f, beat(4)),
          shake: impulse(f, beat(4) + 1, 14) * 0.06,
          ca: 0.08 + impulse(f, beat(4), 10) * 0.9,
          punch: impulse(f, beat(4), 8) * 0.1,
          dof: 1.05,
          bokeh: 3,
        },
      };
    },
  },
  // 3–6s: beer pour, low angle, slow-mo then snap to speed on the beat (frame 135)
  {
    name: 'beer-pour',
    from: beat(6),
    to: beat(12),
    build: (u, f) => {
      // speed ramp: 0.35x for the first 1.5s, then snaps up
      const p = u < 0.5 ? 0.18 * (u / 0.5) : 0.18 + 0.82 * Math.pow((u - 0.5) / 0.5, 0.92);
      const e = easeInOutCubic(u);
      const snap = beat(9);
      return {
        story: lerp(3.0, 5.9, p),
        cam: {
          pos: v3lerp([0.35, 0.3, 2.45], [0.05, 0.45, 2.05], e),
          target: v3lerp([-0.6, 1.2, 0], [-0.56, 1.05, 0], e),
          fov: lerp(50, 47, e) - impulse(f, snap, 8) * 7,
          roll: -0.08 + e * 0.05,
        },
        fx: {
          punch: impulse(f, snap, 8) * 0.09,
          ca: 0.08 + impulse(f, snap, 8) * 0.8,
          shake: impulse(f, snap, 10) * 0.025,
          dof: 1.85,
          bokeh: 2.5,
          bloom: 1.15,
        },
      };
    },
  },
  // 6–8s: sambuca pour in slow motion, three beans land one per beat
  {
    name: 'sambuca-pour',
    from: beat(12),
    to: beat(16),
    build: (u, f) => {
      const e = easeInOutCubic(u);
      const hits = [beat(13), beat(14), beat(15)];
      const p = hits.reduce((a, h) => a + impulse(f, h, 7), 0);
      return {
        story: lerp(6.0, 7.2, u),
        cam: {
          pos: v3lerp([1.25, 1.05, 1.95], [1.0, 0.9, 1.7], e),
          target: v3lerp([0.52, 0.85, 0.15], [0.55, 0.72, 0.15], e),
          fov: lerp(44, 41, e) - p * 2.5,
          roll: 0.05,
        },
        fx: {punch: p * 0.04, ca: 0.06 + p * 0.35, shake: p * 0.008, dof: 1.35, bokeh: 3.5},
      };
    },
  },
  // 8–10s montage, one cut per beat
  {
    name: 'mtg-bubbles',
    from: beat(16),
    to: beat(17),
    build: (u, f) => ({
      story: lerp(7.6, 8.1, u),
      cam: {
        pos: [PINT.pos[0] + 0.1 - u * 0.08, 0.6 + u * 0.08, 0.95],
        target: [PINT.pos[0] - 0.02, 0.72 + u * 0.1, 0],
        fov: 30,
        roll: 0.1,
      },
      fx: {flash: flashAt(f, beat(16)) * 0.5, punch: impulse(f, beat(16), 6) * 0.06, ca: 0.35, dof: 0.62, bokeh: 5},
    }),
  },
  {
    name: 'mtg-foam',
    from: beat(17),
    to: beat(18),
    build: (u, f) => ({
      story: lerp(4.9, 5.9, u),
      cam: {
        pos: [PINT.pos[0] - 0.15, 1.8 - u * 0.08, 1.85],
        target: [PINT.pos[0], 1.28, 0],
        fov: 44 - u * 5,
        roll: -0.12,
      },
      fx: {punch: impulse(f, beat(17), 6) * 0.06, ca: 0.3, dof: 0.98, bokeh: 4},
    }),
  },
  {
    name: 'mtg-beans',
    from: beat(18),
    to: beat(19),
    build: (u, f) => ({
      story: lerp(7.9, 8.3, u),
      cam: {
        pos: [SHOT.pos[0] + 0.4 - u * 0.06, 1.25, SHOT.pos[2] + 0.95],
        target: [SHOT.pos[0], SAMBUCA_FILL_TOP, SHOT.pos[2]],
        fov: 30 - u * 3,
        roll: 0.15,
      },
      fx: {punch: impulse(f, beat(18), 6) * 0.06, ca: 0.3, dof: 0.63, bokeh: 5},
    }),
  },
  {
    name: 'mtg-ignite',
    from: beat(19),
    to: beat(20),
    build: (u, f, local) => {
      // whip-pan out over the last 5 frames
      const w = easeInOutCubic(invLerp(9, 15, local));
      const ig = beat(19) + 2;
      return {
        story: lerp(8.93, 9.45, u),
        cam: {
          pos: [SHOT.pos[0] + 0.35, 0.82, SHOT.pos[2] + 1.75],
          target: [SHOT.pos[0] + w * 3.5, 0.78 - w * 0.1, SHOT.pos[2]],
          fov: 42 - impulse(f, ig, 8) * 6,
          roll: -0.04 - w * 0.25,
        },
        fx: {
          flash: flashAt(f, ig) * 0.9,
          shake: impulse(f, ig, 10) * 0.035,
          ca: 0.1 + impulse(f, ig, 8) * 0.9 + w * 1.2,
          punch: impulse(f, ig, 7) * 0.1,
          whip: w,
          bloom: 1.6,
          dof: 1.05,
          bokeh: 3,
        },
      };
    },
  },
  // 10–13s: hero orbit, bloom peaking. Whip-pan lands in the first 6 frames.
  {
    name: 'hero-orbit',
    from: beat(20),
    to: beat(26),
    build: (u, f, local) => {
      const w = 1 - easeOutCubic(invLerp(0, 7, local));
      const a = lerp(-0.62, 0.55, easeInOutCubic(u)) - w * 0.9;
      const center: V3 = [0, 0.75, -0.2];
      const peak = smooth(invLerp(0.2, 0.75, u));
      return {
        story: lerp(10, 13, u),
        cam: {
          pos: orbit(center, lerp(4.4, 3.9, u), lerp(1.55, 1.3, u), a),
          target: [center[0], center[1] + 0.35, center[2]],
          fov: 44,
          roll: w * 0.22 + Math.sin(u * Math.PI) * 0.02,
        },
        fx: {whip: -w, ca: 0.1 + w * 1.2, bloom: lerp(1.2, 2.1, peak), dof: 2.55, bokeh: 2},
      };
    },
  },
  // 13–15s: zoom punch, freeze, FIRE & ICE slam, fade to black
  {
    name: 'finale',
    from: beat(26),
    to: beat(30),
    build: (_u, f, local) => {
      const freezeAt = 8; // frames after cut
      const lt = Math.min(local, freezeAt);
      const zoom = easeOutCubic(lt / freezeAt);
      const center: V3 = [0, 0.75, -0.2];
      const slam = beat(27);
      return {
        story: 13 + lt / FPS,
        cam: {
          pos: orbit(center, lerp(3.9, 3.0, zoom), lerp(1.3, 1.1, zoom), 0.55),
          target: [lerp(0, 0.15, zoom), center[1] + lerp(0.35, 0.25, zoom), center[2]],
          fov: lerp(44, 40, zoom),
          roll: 0.02,
        },
        fx: {
          punch: impulse(f, beat(26), 8) * 0.12 + impulse(f, slam, 9) * 0.07,
          shake: impulse(f, beat(26), 8) * 0.03 + impulse(f, slam, 10) * 0.04,
          flash: flashAt(f, beat(26)) * 0.35,
          ca: 0.1 + impulse(f, beat(26), 8) * 0.8 + impulse(f, slam, 8) * 0.8,
          desat: smooth(invLerp(freezeAt, freezeAt + 4, local)) * 0.55,
          bloom: 1.9,
          text: f >= slam ? f - slam : -1,
          fade: smooth(invLerp(beat(29), DURATION - 1, f)),
          dof: 2.05,
          bokeh: 2,
        },
      };
    },
  },
];

export const shotAt = (frame: number): ShotState => {
  const f = clamp(frame, 0, DURATION - 1);
  const def = SHOTS.find((s) => f >= s.from && f < s.to) ?? SHOTS[SHOTS.length - 1];
  const local = f - def.from;
  const u = local / (def.to - def.from);
  const r = def.build(u, f, local);
  const fx = {...baseFx(), ...r.fx};
  // camera shake: deterministic jitter on position + target
  const cam = {...r.cam};
  if (fx.shake > 0) {
    const s = fx.shake;
    cam.pos = [cam.pos[0] + wobble(f * 3.1, 1) * s, cam.pos[1] + wobble(f * 2.7, 2) * s, cam.pos[2]];
    cam.target = [cam.target[0] + wobble(f * 3.3, 3) * s * 0.6, cam.target[1] + wobble(f * 2.9, 4) * s * 0.6, cam.target[2]];
    cam.roll += wobble(f * 2.3, 5) * s * 0.8;
  }
  return {name: def.name, story: r.story, cam, fx, local, frame: f};
};

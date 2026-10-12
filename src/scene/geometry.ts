import * as THREE from 'three';

const v = (x: number, y: number) => new THREE.Vector2(x, y);

/** Thick-walled tapered glass (pint / shot): outside up, over the rim, inside down. */
export const glassProfile = (rb: number, rt: number, h: number, wall: number, base: number) => {
  const pts: THREE.Vector2[] = [v(0, 0), v(rb - 0.02, 0), v(rb, 0.02)];
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const y = 0.02 + ((h - 0.02) * i) / steps;
    pts.push(v(rb + (rt - rb) * (y / h), y));
  }
  pts.push(v(rt - wall * 0.5, h + 0.006));
  pts.push(v(rt - wall, h));
  for (let i = steps; i >= 0; i--) {
    const y = base + ((h - base) * i) / steps;
    pts.push(v(rb - wall + (rt - rb) * (y / h), y));
  }
  pts.push(v(0, base));
  return pts;
};

export const glassInnerRadius = (rb: number, rt: number, h: number, wall: number) => (y: number) =>
  rb - wall + (rt - rb) * (y / h);
export const glassOuterRadius = (rb: number, rt: number, h: number) => (y: number) => rb + (rt - rb) * (y / h);

/** Generic profile as list of [r, y] key points, smoothed through a spline. */
const smoothProfile = (keys: [number, number][], samples = 90) => {
  const curve = new THREE.SplineCurve(keys.map(([r, y]) => v(r, y)));
  return curve.getSpacedPoints(samples);
};

export const BEER_BOTTLE_H = 2.4;
export const beerBottleKeys: [number, number][] = [
  [0, 0],
  [0.27, 0.0],
  [0.3, 0.04],
  [0.3, 0.6],
  [0.3, 1.4],
  [0.27, 1.58],
  [0.17, 1.8],
  [0.125, 1.98],
  [0.12, 2.2],
  [0.125, 2.3],
  [0.14, 2.33],
  [0.14, 2.37],
  [0.12, 2.4],
];
export const beerBottleProfile = () => smoothProfile(beerBottleKeys, 120);

export const SAMBUCA_BOTTLE_H = 3.0;
export const sambucaBottleKeys: [number, number][] = [
  [0, 0.0],
  [0.29, 0.0],
  [0.33, 0.05],
  [0.33, 0.9],
  [0.33, 1.85],
  [0.3, 2.05],
  [0.19, 2.28],
  [0.12, 2.45],
  [0.11, 2.7],
  [0.12, 2.8],
  [0.12, 2.88],
];
export const sambucaBottleProfile = () => smoothProfile(sambucaBottleKeys, 120);

/** Linear interpolation of radius from key points (for placing droplets on bottles). */
export const radiusFromKeys = (keys: [number, number][]) => (y: number) => {
  for (let i = 1; i < keys.length; i++) {
    const [r0, y0] = keys[i - 1];
    const [r1, y1] = keys[i];
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return keys[keys.length - 1][0];
};

/** Crown cap with crimped skirt. */
export const crownCapGeometry = () => {
  const g = new THREE.CylinderGeometry(0.145, 0.155, 0.065, 42, 2, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    if (r > 0.1 && y < 0.03) {
      const k = 1 + 0.07 * Math.max(0, Math.cos(a * 21));
      p.setXYZ(i, x * k, y, z * k);
    }
  }
  g.computeVertexNormals();
  return g;
};

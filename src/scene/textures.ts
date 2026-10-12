import * as THREE from 'three';
import {rng} from '../util';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};

const cache = new Map<string, THREE.Texture>();
const memo = (key: string, make: () => THREE.Texture) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

/** Soft radial dot for mist, glows and bokeh. */
export const softDotTexture = () =>
  memo('soft', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

/** Wispy smoke puff (noisy blob) for mist. */
export const mistTexture = () =>
  memo('mist', () => {
    const [c, g] = canvas(256, 256);
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const x = 128 + (r() - 0.5) * 110;
      const y = 128 + (r() - 0.5) * 80;
      const rad = 30 + r() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.08 + r() * 0.1})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
    // fade edges
    const fade = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

/** Hard-edged bokeh disc with a slightly brighter rim. */
export const bokehTexture = () =>
  memo('bokeh', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.85, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.95, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

/** Condensation fog: fine speckle used as an alpha map on a shell around cold glass. */
export const frostTexture = () =>
  memo('frost', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#5a5a5a';
    g.fillRect(0, 0, 512, 512);
    const r = rng(11);
    for (let i = 0; i < 9000; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const s = 0.6 + r() * 2.4;
      const v = 120 + Math.floor(r() * 135);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    // a few clear drip tracks where droplets have wiped the fog away
    for (let i = 0; i < 7; i++) {
      const x = r() * 512;
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillRect(x, r() * 200, 3 + r() * 3, 200 + r() * 300);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
    return t;
  });

/** Foam bubbles texture (bump/colour). */
export const foamTexture = () =>
  memo('foam', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#e9dcc0';
    g.fillRect(0, 0, 512, 512);
    const r = rng(23);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const s = 1 + Math.pow(r(), 3) * 9;
      g.strokeStyle = `rgba(150,120,80,${0.25 + r() * 0.35})`;
      g.lineWidth = 0.8;
      g.fillStyle = `rgba(255,252,240,${0.5 + r() * 0.5})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

const FONT = '"Inter Display", "Inter", "DejaVu Sans", sans-serif';

/** Generic lager label – no real brand. */
export const beerLabelTexture = () =>
  memo('beerLabel', () => {
    const [c, g] = canvas(1024, 512);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#f3e6c4');
    grd.addColorStop(1, '#d9c491');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#8a1c12';
    g.lineWidth = 14;
    g.strokeRect(30, 30, 964, 452);
    g.strokeStyle = '#b8902e';
    g.lineWidth = 4;
    g.strokeRect(54, 54, 916, 404);
    g.fillStyle = '#8a1c12';
    g.textAlign = 'center';
    g.font = `900 64px ${FONT}`;
    g.fillText('ICE COLD', 512, 150);
    g.font = `900 170px ${FONT}`;
    g.fillText('LAGER', 512, 320);
    g.fillStyle = '#2b2116';
    g.font = `600 34px ${FONT}`;
    g.fillText('★  CRISP · GOLDEN · BREWED COLD  ★', 512, 400);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });

/** Generic sambuca label – no real brand. */
export const sambucaLabelTexture = () =>
  memo('sambucaLabel', () => {
    const [c, g] = canvas(1024, 640);
    g.fillStyle = '#f7f5ef';
    g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#1d2a5c';
    g.lineWidth = 10;
    g.strokeRect(26, 26, 972, 588);
    // star anise emblem
    g.save();
    g.translate(512, 170);
    g.fillStyle = '#5a3a22';
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.ellipse(0, -42, 15, 42, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c9a74c';
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#1d2a5c';
    g.textAlign = 'center';
    g.font = `900 150px ${FONT}`;
    g.fillText('SAMBUCA', 512, 390);
    g.font = `500 42px ${FONT}`;
    g.fillText("LIQUORE ALL'ANICE", 512, 460);
    g.fillStyle = '#9a7b2a';
    g.font = `600 32px ${FONT}`;
    g.fillText('70 cl  ·  40% vol', 512, 545);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });

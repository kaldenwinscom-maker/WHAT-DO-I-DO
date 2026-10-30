// Procedural block textures, generated on canvases at startup. No image files needed.
// Each generator paints a SIZE x SIZE tile; all use seeded noise so the look is stable.

import * as THREE from 'three';
import type { PhaseDef } from '../data/phases';

const SIZE = 64;

// ---------- helpers ----------

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(c: RGB, s: number): RGB {
  return [c[0] * s, c[1] * s, c[2] * s];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on a grid of `period` cells. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (i: number) => ((i % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fractal noise in [0,1]. `px,py` are pixel coords. */
function fbm(px: number, py: number, baseCells: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise((px / SIZE) * cells, (py / SIZE) * cells, cells, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return sum / norm;
}

class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly img: ImageData;

  constructor(size = SIZE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(size, size);
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    const i = (y * SIZE + x) * 4;
    const d = this.img.data;
    d[i] = Math.max(0, Math.min(255, c[0]));
    d[i + 1] = Math.max(0, Math.min(255, c[1]));
    d[i + 2] = Math.max(0, Math.min(255, c[2]));
    d[i + 3] = a;
  }

  get(x: number, y: number): RGB {
    const i = (y * SIZE + x) * 4;
    const d = this.img.data;
    return [d[i], d[i + 1], d[i + 2]];
  }

  fill(fn: (x: number, y: number) => RGB): void {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) this.set(x, y, fn(x, y));
  }

  /** Darkens tile edges and adds random chips, for a worn, handled look. */
  wear(strength = 0.22, seed = 7): void {
    const r = rng(seed);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const e = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
        let k = 1;
        if (e === 0) k -= strength * 1.3;
        else if (e === 1) k -= strength * 0.6;
        else if (e === 2) k -= strength * 0.2;
        this.set(x, y, scale(this.get(x, y), k));
      }
    }
    // Chips: tiny lighter/darker specks.
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * SIZE);
      const y = Math.floor(r() * SIZE);
      this.set(x, y, scale(this.get(x, y), r() < 0.5 ? 0.7 : 1.18));
    }
  }

  commit(): HTMLCanvasElement {
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

// ---------- generators ----------

function paintDirt(p: Painter, seed = 11): void {
  const base = hexToRgb('#6b4f36');
  const dark = hexToRgb('#3f2d1f');
  const light = hexToRgb('#8a6a4a');
  const r = rng(seed);
  p.fill((x, y) => {
    const n = fbm(x, y, 4, 4, seed);
    const fine = hash2(x, y, seed + 3);
    let c = mix(dark, base, n * 1.3);
    if (n > 0.62) c = mix(c, light, (n - 0.62) * 2.2);
    return scale(c, 0.9 + fine * 0.2);
  });
  // Embedded pebbles.
  for (let i = 0; i < 14; i++) {
    const cx = Math.floor(r() * SIZE);
    const cy = Math.floor(r() * SIZE);
    const rad = 1 + Math.floor(r() * 2);
    const tone = mix(hexToRgb('#6e675c'), hexToRgb('#9a9286'), r());
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++)
        if (x * x + y * y <= rad * rad) {
          const px = (cx + x + SIZE) % SIZE;
          const py = (cy + y + SIZE) % SIZE;
          p.set(px, py, scale(tone, y < 0 ? 1.1 : 0.85));
        }
  }
}

function paintTurfTop(p: Painter, seed = 21): void {
  const dark = hexToRgb('#3d4a26');
  const base = hexToRgb('#5d6b3a');
  const dry = hexToRgb('#7f7a45');
  p.fill((x, y) => {
    const n = fbm(x, y, 4, 4, seed);
    const patch = fbm(x, y, 2, 2, seed + 9);
    let c = mix(dark, base, n * 1.2);
    c = mix(c, dry, Math.max(0, patch - 0.55) * 1.8);
    const blade = hash2(x, Math.floor(y / 2), seed + 5);
    return scale(c, 0.82 + blade * 0.3);
  });
}

function paintTurfSide(p: Painter, seed = 31): void {
  paintDirt(p, seed);
  const r = rng(seed + 1);
  const grass = hexToRgb('#56643a');
  const grassDark = hexToRgb('#38432a');
  for (let x = 0; x < SIZE; x++) {
    const depth = 8 + Math.floor(fbm(x, 0, 6, 2, seed + 4) * 10) + (r() < 0.12 ? Math.floor(r() * 8) : 0);
    for (let y = 0; y < depth; y++) {
      const t = y / depth;
      const c = mix(grass, grassDark, t * 0.8 + hash2(x, y, seed) * 0.25);
      p.set(x, y, c);
    }
    // Shadow line under the grass.
    p.set(x, Math.min(SIZE - 1, depth), scale(p.get(x, Math.min(SIZE - 1, depth)), 0.6));
  }
}

function paintBark(p: Painter, seed = 41): void {
  const dark = hexToRgb('#3a2b1e');
  const base = hexToRgb('#5e4630');
  const light = hexToRgb('#7a5d40');
  p.fill((x, y) => {
    const streak = fbm(x * 4, y * 0.5, 2, 3, seed); // stretched vertically
    const n = fbm(x, y, 4, 3, seed + 2);
    let c = mix(dark, base, streak * 1.4);
    if (streak > 0.6) c = mix(c, light, (streak - 0.6) * 2);
    // Deep vertical grooves.
    const groove = valueNoise(x / 5, 0, Math.floor(SIZE / 5), seed + 6) > 0.72 ? 0.6 : 1;
    return scale(c, groove * (0.85 + n * 0.3));
  });
}

function paintLogTop(p: Painter, seed = 51): void {
  const bark = hexToRgb('#4a3726');
  const ringDark = hexToRgb('#8a6844');
  const ringLight = hexToRgb('#b08a5e');
  const c0 = SIZE / 2 - 0.5;
  p.fill((x, y) => {
    const dx = x - c0;
    const dy = y - c0;
    const n = fbm(x, y, 4, 2, seed);
    const d = Math.sqrt(dx * dx + dy * dy) + n * 4;
    if (d > SIZE * 0.44) return scale(bark, 0.8 + n * 0.4);
    const ring = (Math.sin(d * 1.1) + 1) / 2;
    return scale(mix(ringDark, ringLight, ring), 0.88 + hash2(x, y, seed) * 0.16);
  });
  // A radial crack.
  const r = rng(seed);
  const ang = r() * Math.PI * 2;
  for (let i = 4; i < SIZE * 0.4; i++) {
    const x = Math.round(c0 + Math.cos(ang) * i);
    const y = Math.round(c0 + Math.sin(ang) * i);
    p.set(x, y, scale(p.get(x, y), 0.5));
  }
}

function paintPlanks(p: Painter, seed = 61): void {
  const base = hexToRgb('#8a6a46');
  const dark = hexToRgb('#5e4630');
  const boards = 4;
  const h = SIZE / boards;
  p.fill((x, y) => {
    const b = Math.floor(y / h);
    const tone = 0.88 + hash2(b, 0, seed) * 0.22;
    const grain = fbm(x * 0.3 + b * 17, y * 3, 3, 3, seed + b);
    let c = scale(mix(dark, base, 0.4 + grain * 0.8), tone);
    const yy = y % h;
    if (yy === 0) c = scale(c, 0.45);
    else if (yy === 1) c = scale(c, 0.8);
    else if (yy === h - 1) c = scale(c, 1.08);
    // Staggered board ends.
    const seam = (b % 2 === 0 ? 20 : 44);
    if (x === seam) c = scale(c, 0.55);
    // Nails.
    if ((x === seam - 3 || x === seam + 3) && yy === Math.floor(h / 2)) c = hexToRgb('#3a3a3c');
    return c;
  });
}

function paintMud(p: Painter, seed = 71): void {
  const dark = hexToRgb('#2f2419');
  const base = hexToRgb('#4d3b2a');
  const wet = hexToRgb('#6a5a48');
  p.fill((x, y) => {
    const n = fbm(x, y, 3, 4, seed);
    let c = mix(dark, base, n * 1.3);
    if (n > 0.66) c = mix(c, wet, (n - 0.66) * 3);
    return c;
  });
}

/** Rune-stone with glowing veins. Returns [color, emissive] canvases. */
function paintMagic(palette: PhaseDef['palette'], seed = 91): [HTMLCanvasElement, HTMLCanvasElement] {
  const p = new Painter();
  const e = new Painter();
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark);
  const vein = hexToRgb(palette.vein);
  const glow = hexToRgb(palette.glow);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x, y, 4, 4, seed);
      // Veins appear where a ridged noise is near its midline.
      const ridge = 1 - Math.abs(fbm(x, y, 3, 3, seed + 13) * 2 - 1);
      const v = Math.max(0, (ridge - 0.86) / 0.14);
      let c = mix(dark, base, n * 1.3);
      // Carved frame around the face.
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      if (edge < 3) c = scale(c, 0.6 + edge * 0.1);
      else if (edge === 3) c = scale(c, 1.2);
      c = mix(c, vein, v * 0.85);
      p.set(x, y, c);
      e.set(x, y, scale(glow, v), 255);
    }
  }
  // Corner rune marks.
  const marks = [
    [8, 8],
    [SIZE - 10, 8],
    [8, SIZE - 10],
    [SIZE - 10, SIZE - 10],
  ];
  for (const [mx, my] of marks) {
    for (let i = 0; i < 3; i++) {
      p.set(mx + i, my, vein);
      p.set(mx, my + i, vein);
      e.set(mx + i, my, glow);
      e.set(mx, my + i, glow);
    }
  }
  p.wear(0.25, seed);
  return [p.commit(), e.commit()];
}

// ---------- public API ----------

const GENERATORS: Record<string, (p: Painter) => void> = {
  dirt: (p) => paintDirt(p),
  turf_top: (p) => paintTurfTop(p),
  turf_side: (p) => paintTurfSide(p),
  bark: (p) => paintBark(p),
  log_top: (p) => paintLogTop(p),
  planks: (p) => paintPlanks(p),
  mud: (p) => paintMud(p),
};

const canvasCache = new Map<string, HTMLCanvasElement>();
const textureCache = new Map<string, THREE.Texture>();
let maxAnisotropy = 1;

export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n;
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // keeps the chunky, hand-made grain up close
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Canvas for a named texture (also used to draw inventory icons). */
export function getTextureCanvas(key: string): HTMLCanvasElement {
  let c = canvasCache.get(key);
  if (!c) {
    const gen = GENERATORS[key];
    if (!gen) throw new Error(`Unknown texture: ${key}`);
    const p = new Painter();
    gen(p);
    if (key !== 'turf_top') p.wear(0.2, key.length * 13);
    c = p.commit();
    canvasCache.set(key, c);
  }
  return c;
}

export function getTexture(key: string): THREE.Texture {
  let t = textureCache.get(key);
  if (!t) {
    t = toTexture(getTextureCanvas(key));
    textureCache.set(key, t);
  }
  return t;
}

export function getMagicTextures(phase: PhaseDef): { map: THREE.Texture; emissive: THREE.Texture; canvas: HTMLCanvasElement } {
  const key = `magic:${phase.id}`;
  const cached = textureCache.get(key);
  const cachedE = textureCache.get(key + ':e');
  if (cached && cachedE) return { map: cached, emissive: cachedE, canvas: canvasCache.get(key)! };
  const [c, e] = paintMagic(phase.palette);
  canvasCache.set(key, c);
  const map = toTexture(c);
  const emissive = toTexture(e);
  textureCache.set(key, map);
  textureCache.set(key + ':e', emissive);
  return { map, emissive, canvas: c };
}

/** Transparent crack overlays, stage 0..stages-1 (increasingly broken). */
export function makeCrackTextures(stages = 6): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const r = rng(1234);
  // Pre-generate crack paths, then reveal more of them each stage.
  const paths: [number, number][][] = [];
  for (let i = 0; i < 10; i++) {
    let x = SIZE / 2 + (r() - 0.5) * 16;
    let y = SIZE / 2 + (r() - 0.5) * 16;
    let ang = r() * Math.PI * 2;
    const path: [number, number][] = [];
    for (let s = 0; s < 40; s++) {
      path.push([Math.round(x), Math.round(y)]);
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang);
      y += Math.sin(ang);
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) break;
    }
    paths.push(path);
  }
  for (let s = 0; s < stages; s++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    const frac = (s + 1) / stages;
    const count = Math.ceil(paths.length * frac);
    ctx.fillStyle = 'rgba(15,10,6,0.85)';
    for (let i = 0; i < count; i++) {
      const path = paths[i];
      const len = Math.ceil(path.length * Math.min(1, frac * 1.4));
      for (let j = 0; j < len; j++) ctx.fillRect(path[j][0], path[j][1], 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    out.push(tex);
  }
  return out;
}

/** A soft noise image used as a texture for HUD panels. Returns a data URL. */
export function makePanelNoiseDataUrl(): string {
  const p = new Painter();
  p.fill((x, y) => {
    const n = fbm(x, y, 4, 4, 501);
    const fine = hash2(x, y, 77);
    const v = 110 + n * 70 + fine * 30;
    return [v, v * 0.92, v * 0.82];
  });
  return p.commit().toDataURL();
}

// Small 3D models for every item. Used for inventory icons, the held item,
// and (later) physical drops. Each model is centred and roughly 1 unit across.

import * as THREE from 'three';
import type { ItemId } from '../data/items';
import { Assets } from '../render/Assets';
import { makeTriplanarMaterial } from '../render/triplanar';
import { makeRockGeometry } from '../world/rocks';
import { rng } from '../world/noise';

const matCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

const plain = (color: THREE.ColorRepresentation, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  cached(`plain:${color}:${roughness}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra }));

const stoneMat = (set: 'rock_face' | 'dark_rock_02' | 'forrest_ground_01', tint: string, scale = 2.5) =>
  cached(`tri:${set}:${tint}:${scale}`, () => makeTriplanarMaterial({ base: { set, scale, tint }, objectSpace: true }));

function barkMat(): THREE.MeshStandardMaterial {
  return cached('bark', () => {
    const s = Assets.set('bark_brown_02');
    const map = s.diff.clone();
    const nor = s.nor.clone();
    for (const t of [map, nor]) {
      t.repeat.set(2, 1);
      t.needsUpdate = true;
    }
    return new THREE.MeshStandardMaterial({ map, normalMap: nor, roughness: 0.95, color: '#c8b8a4' });
  });
}

/** Smooth hand-painted end grain for logs (drawn at high res, no pixels). */
function endGrainMat(): THREE.MeshStandardMaterial {
  return cached('endgrain', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const r = rng(3);
    ctx.fillStyle = '#9c7a52';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 26; i > 0; i--) {
      ctx.beginPath();
      ctx.ellipse(128 + (r() - 0.5) * 4, 128 + (r() - 0.5) * 4, i * 4.6, i * 4.4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(80,52,30,${0.25 + r() * 0.3})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(50,32,18,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(220, 90);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  });
}

/** Smooth procedural wood grain for planks until the plank texture arrives with building. */
function woodMat(): THREE.MeshStandardMaterial {
  return cached('wood', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const r = rng(8);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#8a6a48');
    g.addColorStop(1, '#7a5c3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 70; i++) {
      const y = r() * 128;
      ctx.strokeStyle = `rgba(60,40,22,${0.08 + r() * 0.18})`;
      ctx.lineWidth = 0.5 + r() * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 3);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  });
}

function rockMesh(seed: number, mat: THREE.Material, scale: THREE.Vector3Like, cuts = 6, lump = 0.25): THREE.Mesh {
  const m = new THREE.Mesh(makeRockGeometry(seed, { detail: 4, scale, lumpiness: lump, roughness: 0.05, cuts }), mat);
  return m;
}

function leafShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.28, -0.3, 0.3, 0.2, 0, 0.5);
  s.bezierCurveTo(-0.3, 0.2, -0.28, -0.3, 0, -0.5);
  return s;
}

function bend(geo: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getY(i) * p.getY(i) * amount + p.getX(i) * p.getX(i) * amount * 0.6);
  geo.computeVertexNormals();
  return geo;
}

const BUILDERS: Record<ItemId, () => THREE.Object3D> = {
  dirt: () => {
    const g = new THREE.Group();
    const pile = rockMesh(21, stoneMat('forrest_ground_01', '#8a7660', 1.6), { x: 0.55, y: 0.3, z: 0.5 }, 3, 0.35);
    g.add(pile);
    return g;
  },
  turf: () => {
    const g = new THREE.Group();
    const soil = rockMesh(22, stoneMat('forrest_ground_01', '#7a6650', 1.6), { x: 0.5, y: 0.22, z: 0.45 }, 6, 0.18);
    const top = rockMesh(23, plain('#5d6a3c', 1), { x: 0.5, y: 0.08, z: 0.45 }, 2, 0.15);
    top.position.y = 0.16;
    g.add(soil, top);
    const blade = new THREE.ConeGeometry(0.02, 0.22, 3);
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(blade, plain('#6b7244', 1));
      const a = i * 2.4;
      b.position.set(Math.cos(a) * 0.3 * Math.sqrt(i / 14), 0.3, Math.sin(a) * 0.28 * Math.sqrt(i / 14));
      b.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      g.add(b);
    }
    return g;
  },
  log: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 1, 14, 1, true), barkMat());
    const capGeo = new THREE.CircleGeometry(0.245, 14);
    const a = new THREE.Mesh(capGeo, endGrainMat());
    a.position.y = 0.5;
    a.rotation.x = -Math.PI / 2;
    const b = a.clone();
    b.position.y = -0.5;
    b.rotation.x = Math.PI / 2;
    g.add(body, a, b);
    g.rotation.z = Math.PI / 2;
    return g;
  },
  planks: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.22), woodMat());
      p.position.set((i - 1) * 0.04, i * 0.075, (i - 1) * 0.06);
      p.rotation.y = (i - 1) * 0.12;
      g.add(p);
    }
    return g;
  },
  stick: () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, -0.05, 0), new THREE.Vector3(-0.1, 0.03, 0.02), new THREE.Vector3(0.2, 0.0, -0.03), new THREE.Vector3(0.5, 0.06, 0)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), barkMat());
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.22, 5), barkMat());
    twig.position.set(0.05, 0.08, 0);
    twig.rotation.z = -0.9;
    const g = new THREE.Group();
    g.add(m, twig);
    return g;
  },
  seeds: () => {
    // A small tied burlap sack.
    const pts = [
      [0, -0.4],
      [0.3, -0.38],
      [0.4, -0.2],
      [0.38, 0.05],
      [0.25, 0.2],
      [0.1, 0.26],
      [0.08, 0.3],
      [0.16, 0.42],
      [0.05, 0.44],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const sack = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), plain('#8c7a5a', 1));
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), plain('#5a4630', 1));
    tie.position.y = 0.28;
    tie.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(sack, tie);
    return g;
  },
  berries: () => {
    const g = new THREE.Group();
    const r = rng(17);
    const berry = new THREE.SphereGeometry(0.12, 12, 10);
    const cols = ['#5a1e2e', '#6a2434', '#4a1828', '#7a3040'];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(berry, plain(cols[i % cols.length], 0.35));
      const a = i * 2.39;
      const rad = 0.08 + Math.sqrt(i / 9) * 0.22;
      m.position.set(Math.cos(a) * rad, (r() - 0.3) * 0.12 + (i < 3 ? 0.08 : 0), Math.sin(a) * rad);
      m.scale.setScalar(0.85 + r() * 0.3);
      g.add(m);
    }
    const leaf = new THREE.Mesh(bend(new THREE.ShapeGeometry(leafShape(), 8), 0.3), plain('#4f5a34', 0.8, { side: THREE.DoubleSide }));
    leaf.scale.setScalar(0.5);
    leaf.rotation.set(-1.1, 0.6, 0);
    leaf.position.set(0.15, 0.12, -0.2);
    g.add(leaf);
    return g;
  },
  pebble: () => rockMesh(31, stoneMat('rock_face', '#a09a90', 3), { x: 0.5, y: 0.33, z: 0.42 }, 5, 0.2),
  dry_leaves: () => {
    const g = new THREE.Group();
    const cols = ['#8a6a3c', '#7a5a34', '#9a7a44'];
    for (let i = 0; i < 3; i++) {
      const geo = bend(new THREE.ShapeGeometry(leafShape(), 8), 0.4);
      const m = new THREE.Mesh(geo, plain(cols[i], 0.9, { side: THREE.DoubleSide }));
      m.rotation.set(-1.2 + i * 0.2, i * 1.9, 0.3);
      m.position.set((i - 1) * 0.18, i * 0.04, (i % 2) * 0.1);
      m.scale.setScalar(0.85);
      g.add(m);
    }
    return g;
  },
  mud_clump: () => rockMesh(41, plain('#4a3a2a', 0.45), { x: 0.5, y: 0.32, z: 0.45 }, 0, 0.45),
  egg: () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      const y = -Math.cos(t) * 0.5;
      const r = Math.sin(t) * 0.36 * (1 - y * 0.25);
      pts.push(new THREE.Vector2(r, y));
    }
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 20), plain('#d8ccb0', 0.55));
  },
  feather: () => {
    const g = new THREE.Group();
    const vane = new THREE.Shape();
    vane.moveTo(0, -0.5);
    vane.bezierCurveTo(0.18, -0.2, 0.16, 0.3, 0, 0.5);
    vane.bezierCurveTo(-0.12, 0.3, -0.14, -0.2, 0, -0.42);
    const v = new THREE.Mesh(bend(new THREE.ShapeGeometry(vane, 10), 0.25), plain('#cfc8b8', 0.8, { side: THREE.DoubleSide }));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.1, 5), plain('#e8e2d4', 0.6));
    shaft.position.y = -0.03;
    g.add(v, shaft);
    g.rotation.z = -0.7;
    return g;
  },
  flint: () => rockMesh(51, stoneMat('dark_rock_02', '#55565c', 3), { x: 0.5, y: 0.25, z: 0.36 }, 12, 0.1),
  rot: () => rockMesh(61, plain('#3f4626', 0.5), { x: 0.5, y: 0.28, z: 0.45 }, 0, 0.5),
};

/** A fresh model for an item, centred at the origin and scaled to fit a unit sphere. */
export function makeItemModel(id: ItemId): THREE.Object3D {
  const inner = BUILDERS[id]();
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const wrap = new THREE.Group();
  wrap.add(inner);
  const box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  inner.position.sub(center);
  wrap.scale.setScalar(1 / size);
  const outer = new THREE.Group();
  outer.add(wrap);
  return outer;
}

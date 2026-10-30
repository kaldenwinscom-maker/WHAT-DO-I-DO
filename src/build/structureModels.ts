// 3D models for placeable structures, built from simple parts with PBR materials.
// Every model sits on the ground at the origin, front facing +Z.

import * as THREE from 'three';
import type { StructureId } from '../data/structures';
import { makeTriplanarMaterial } from '../render/triplanar';
import { makeRockGeometry } from '../world/rocks';
import { rng } from '../world/noise';

const mats = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

const wood = () => mat('wood', () => makeTriplanarMaterial({ base: { set: 'brown_planks_04', scale: 1.1, tint: '#b0a08a' }, objectSpace: true }));
const darkWood = () => mat('darkwood', () => makeTriplanarMaterial({ base: { set: 'brown_planks_04', scale: 1.1, tint: '#6e6252' }, objectSpace: true }));
const bark = () => mat('bark', () => makeTriplanarMaterial({ base: { set: 'bark_brown_02', scale: 2.2, tint: '#a09080' }, objectSpace: true }));
const stone = () => mat('stone', () => makeTriplanarMaterial({ base: { set: 'rock_face', scale: 2.4, tint: '#a39e94' }, objectSpace: true }));
const metal = () => mat('metal', () => new THREE.MeshStandardMaterial({ color: '#4c4946', metalness: 0.7, roughness: 0.5 }));
const rust = () => mat('rust', () => new THREE.MeshStandardMaterial({ color: '#6b4a33', metalness: 0.35, roughness: 0.8 }));
const cloth = () => mat('cloth', () => new THREE.MeshStandardMaterial({ color: '#8a7b62', roughness: 1, side: THREE.DoubleSide }));
const ropeM = () => mat('rope', () => new THREE.MeshStandardMaterial({ color: '#8c7650', roughness: 1 }));
const ash = () => mat('ash', () => new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 1 }));
const hay = () => mat('hay', () => new THREE.MeshStandardMaterial({ color: '#a89458', roughness: 1 }));

type V3 = [number, number, number];

function box(g: THREE.Object3D, size: V3, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  g.add(mesh);
  return mesh;
}

function cyl(g: THREE.Object3D, rTop: number, rBot: number, h: number, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], seg = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  g.add(mesh);
  return mesh;
}

/** A row of boards with small gaps and slight unevenness, like real planking. */
function boards(g: THREE.Object3D, count: number, along: 'x' | 'y', length: number, width: number, thick: number, m: THREE.Material, origin: V3, r: () => number): void {
  const step = width / count;
  for (let i = 0; i < count; i++) {
    const off = -width / 2 + step * (i + 0.5);
    const jitter = (r() - 0.5) * 0.01;
    if (along === 'x') box(g, [length + (r() - 0.5) * 0.04, thick, step - 0.012], m, [origin[0], origin[1] + jitter, origin[2] + off]);
    else box(g, [step - 0.012, length + (r() - 0.5) * 0.04, thick], m, [origin[0] + off, origin[1], origin[2] + jitter]);
  }
}

const BUILDERS: Record<StructureId, () => THREE.Object3D> = {
  crafting_table: () => {
    const g = new THREE.Group();
    const r = rng(11);
    // Thick top made of three heavy boards.
    boards(g, 3, 'x', 1.7, 0.85, 0.09, wood(), [0, 0.88, 0], r);
    for (const [x, z] of [
      [-0.72, -0.32],
      [0.72, -0.32],
      [-0.72, 0.32],
      [0.72, 0.32],
    ])
      box(g, [0.11, 0.84, 0.11], darkWood(), [x, 0.42, z], [z * 0.08, 0, -x * 0.04]);
    box(g, [1.46, 0.08, 0.07], darkWood(), [0, 0.22, 0.32]);
    box(g, [1.46, 0.08, 0.07], darkWood(), [0, 0.22, -0.32]);
    boards(g, 4, 'x', 1.4, 0.6, 0.04, darkWood(), [0, 0.27, 0], r);
    // A log and some offcuts on the shelf.
    cyl(g, 0.11, 0.12, 0.6, bark(), [-0.35, 0.4, 0.05], [0, 0, Math.PI / 2]);
    box(g, [0.4, 0.04, 0.12], wood(), [0.35, 0.31, -0.1], [0, 0.3, 0]);
    // Vise block on the front edge.
    box(g, [0.18, 0.16, 0.12], darkWood(), [0.62, 0.86, 0.44]);
    cyl(g, 0.015, 0.015, 0.3, metal(), [0.62, 0.86, 0.56], [Math.PI / 2, 0, 0], 6);
    // Hammer.
    cyl(g, 0.018, 0.02, 0.34, darkWood(), [-0.3, 0.955, 0.15], [0, 0, Math.PI / 2 - 0.3], 6);
    box(g, [0.05, 0.05, 0.14], metal(), [-0.45, 0.96, 0.11], [0, -0.3, 0]);
    // Saw.
    box(g, [0.5, 0.004, 0.11], metal(), [0.15, 0.937, -0.16], [0, 0.15, 0]);
    box(g, [0.12, 0.03, 0.08], darkWood(), [0.45, 0.95, -0.2], [0, 0.15, 0]);
    // Scattered nails.
    for (let i = 0; i < 6; i++) cyl(g, 0.004, 0.004, 0.06, rust(), [0.1 + r() * 0.3, 0.94, 0.15 + r() * 0.15], [Math.PI / 2, r() * 3, 0], 4);
    return g;
  },

  fire_pit: () => {
    const g = new THREE.Group();
    const r = rng(21);
    const geo = makeRockGeometry(41, { detail: 2, scale: { x: 1, y: 0.7, z: 0.8 }, lumpiness: 0.2, cuts: 8 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const m = new THREE.Mesh(geo, stone());
      m.position.set(Math.cos(a) * 0.58, 0.08, Math.sin(a) * 0.58);
      m.rotation.set((r() - 0.5) * 0.3, -a + (r() - 0.5) * 0.4, (r() - 0.5) * 0.3);
      m.scale.set(0.17, 0.14 + r() * 0.04, 0.12);
      g.add(m);
    }
    cyl(g, 0.48, 0.5, 0.04, ash(), [0, 0.02, 0], [0, 0, 0], 16);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      cyl(g, 0.045, 0.05, 0.62, bark(), [Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12], [0.5, -a, Math.PI / 2 - 0.35]);
    }
    return g;
  },

  storage_chest: () => {
    const g = new THREE.Group();
    const r = rng(31);
    boards(g, 4, 'x', 1.0, 0.54, 0.02, wood(), [0, 0.03, 0], r);
    box(g, [1.0, 0.42, 0.56], wood(), [0, 0.25, 0]);
    box(g, [1.04, 0.14, 0.6], darkWood(), [0, 0.53, 0]);
    for (const x of [-0.36, 0.36]) {
      box(g, [0.06, 0.6, 0.62], rust(), [x, 0.31, 0]);
    }
    box(g, [0.1, 0.12, 0.03], metal(), [0, 0.46, 0.31]);
    box(g, [0.14, 0.05, 0.03], metal(), [0.28, 0.55, -0.31]);
    box(g, [0.14, 0.05, 0.03], metal(), [-0.28, 0.55, -0.31]);
    return g;
  },

  chicken_coop: () => {
    const g = new THREE.Group();
    const r = rng(41);
    for (const [x, z] of [
      [-0.8, -0.6],
      [0.8, -0.6],
      [-0.8, 0.6],
      [0.8, 0.6],
    ])
      box(g, [0.09, 1.25, 0.09], darkWood(), [x, 0.62, z]);
    boards(g, 6, 'x', 1.75, 1.3, 0.04, wood(), [0, 0.5, 0], r);
    // Walls of vertical boards.
    boards(g, 7, 'y', 0.7, 1.6, 0.03, wood(), [0, 0.87, -0.62], r);
    const side = new THREE.Group();
    boards(side, 5, 'y', 0.7, 1.2, 0.03, wood(), [0, 0, 0], r);
    side.position.set(-0.8, 0.87, 0);
    side.rotation.y = Math.PI / 2;
    g.add(side);
    const side2 = side.clone();
    side2.position.x = 0.8;
    g.add(side2);
    // Front with a doorway hung with a cloth flap.
    box(g, [0.55, 0.7, 0.03], wood(), [-0.52, 0.87, 0.62]);
    box(g, [0.55, 0.7, 0.03], wood(), [0.52, 0.87, 0.62]);
    box(g, [0.5, 0.25, 0.03], wood(), [0, 1.1, 0.62]);
    box(g, [0.46, 0.42, 0.01], cloth(), [0, 0.76, 0.64], [0.05, 0, 0]);
    // Sloped roof.
    const roof = new THREE.Group();
    boards(roof, 6, 'x', 1.95, 1.55, 0.04, darkWood(), [0, 0, 0], r);
    roof.position.set(0, 1.38, 0);
    roof.rotation.x = 0.22;
    g.add(roof);
    // Ramp with stick rungs.
    box(g, [0.3, 0.03, 0.8], wood(), [0, 0.25, 0.98], [0.62, 0, 0]);
    for (let i = 0; i < 4; i++) cyl(g, 0.012, 0.012, 0.28, darkWood(), [0, 0.1 + i * 0.11, 1.2 - i * 0.13], [0, 0, Math.PI / 2], 5);
    // Rope lashings at the corners.
    for (const x of [-0.8, 0.8]) cyl(g, 0.06, 0.06, 0.05, ropeM(), [x, 0.5, 0.6], [0, 0, 0], 8);
    return g;
  },

  door: () => {
    const g = new THREE.Group();
    const r = rng(51);
    box(g, [0.12, 2.25, 0.16], darkWood(), [-0.55, 1.12, 0]);
    box(g, [0.12, 2.25, 0.16], darkWood(), [0.55, 1.12, 0]);
    box(g, [1.25, 0.14, 0.18], darkWood(), [0, 2.27, 0]);
    boards(g, 5, 'y', 2.02, 0.96, 0.05, wood(), [0, 1.04, 0], r);
    box(g, [0.92, 0.1, 0.03], darkWood(), [0, 0.55, 0.04]);
    box(g, [0.92, 0.1, 0.03], darkWood(), [0, 1.6, 0.04]);
    box(g, [0.98, 0.08, 0.03], darkWood(), [0, 1.07, 0.04], [0, 0, 0.98]);
    for (const y of [0.4, 1.75]) box(g, [0.22, 0.05, 0.02], metal(), [-0.38, y, 0.06]);
    cyl(g, 0.02, 0.02, 0.12, metal(), [0.36, 1.05, 0.08], [Math.PI / 2, 0, 0], 6);
    return g;
  },

  bed: () => {
    const g = new THREE.Group();
    const r = rng(61);
    for (const [x, z, h] of [
      [-0.5, -1, 0.75],
      [0.5, -1, 0.75],
      [-0.5, 1, 0.45],
      [0.5, 1, 0.45],
    ])
      box(g, [0.09, h, 0.09], darkWood(), [x, h / 2, z]);
    box(g, [0.07, 0.12, 2.0], darkWood(), [-0.5, 0.3, 0]);
    box(g, [0.07, 0.12, 2.0], darkWood(), [0.5, 0.3, 0]);
    boards(g, 3, 'x', 1.0, 0.3, 0.04, wood(), [0, 0.62, -1], r);
    for (let i = 0; i < 7; i++) box(g, [0.95, 0.03, 0.12], wood(), [0, 0.32, -0.85 + i * 0.28]);
    box(g, [0.92, 0.14, 1.85], cloth(), [0, 0.42, 0.03]);
    box(g, [0.55, 0.1, 0.3], mat('pillow', () => new THREE.MeshStandardMaterial({ color: '#a39478', roughness: 1 })), [0, 0.53, -0.72], [0.1, 0, 0]);
    cyl(g, 0.11, 0.11, 0.9, mat('blanket', () => new THREE.MeshStandardMaterial({ color: '#6a5442', roughness: 1 })), [0, 0.55, 0.7], [0, 0, Math.PI / 2], 12);
    for (const z of [-0.3, 0.4]) cyl(g, 0.115, 0.115, 0.04, ropeM(), [0.3, 0.55, z], [0, 0, Math.PI / 2], 12);
    return g;
  },

  rain_collector: () => {
    const g = new THREE.Group();
    // Barrel with iron bands.
    cyl(g, 0.34, 0.32, 0.8, wood(), [0, 0.4, 0], [0, 0, 0], 16);
    for (const y of [0.12, 0.4, 0.68]) cyl(g, 0.355, 0.355, 0.04, rust(), [0, y, 0], [0, 0, 0], 16);
    // Frame.
    for (const [x, z] of [
      [-0.55, -0.55],
      [0.55, -0.55],
      [-0.55, 0.55],
      [0.55, 0.55],
    ])
      box(g, [0.08, 1.85, 0.08], darkWood(), [x, 0.92, z]);
    for (const z of [-0.55, 0.55]) box(g, [1.2, 0.07, 0.07], darkWood(), [0, 1.8, z]);
    for (const x of [-0.55, 0.55]) box(g, [0.07, 0.07, 1.2], darkWood(), [x, 1.8, 0]);
    // Cloth funnel sagging into the barrel.
    const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.75, 4, 1, true), cloth());
    funnel.position.set(0, 1.42, 0);
    funnel.rotation.set(Math.PI, Math.PI / 4, 0);
    g.add(funnel);
    cyl(g, 0.05, 0.05, 0.3, cloth(), [0, 0.95, 0], [0, 0, 0], 8);
    return g;
  },

  cooking_station: () => {
    const g = new THREE.Group();
    const r = rng(81);
    // Stacked stone-brick counter.
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 0.15 : 0;
      for (let i = 0; i < 5; i++) {
        const x = -0.72 + i * 0.32 + off;
        if (x > 0.8) continue;
        box(g, [0.3, 0.2, 0.84], stone(), [x, 0.1 + row * 0.205, 0], [0, (r() - 0.5) * 0.04, 0]);
      }
    }
    boards(g, 3, 'x', 1.7, 0.86, 0.05, darkWood(), [0, 0.85, 0], r);
    // Posts and beam with a hanging pot.
    box(g, [0.1, 1.0, 0.1], darkWood(), [-0.82, 1.35, -0.3]);
    box(g, [0.1, 1.0, 0.1], darkWood(), [0.82, 1.35, -0.3]);
    box(g, [1.8, 0.12, 0.14], wood(), [0, 1.85, -0.3]);
    cyl(g, 0.01, 0.01, 0.42, ropeM(), [0.2, 1.6, -0.3], [0, 0, 0], 5);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), metal());
    pot.position.set(0.2, 1.42, -0.3);
    g.add(pot);
    cyl(g, 0.06, 0.06, 0.12, metal(), [-0.4, 0.94, 0.15], [0, 0, 0], 10);
    return g;
  },

  animal_feeder: () => {
    const g = new THREE.Group();
    const r = rng(91);
    for (const x of [-0.65, 0.65]) {
      box(g, [0.06, 0.5, 0.5], darkWood(), [x, 0.27, 0]);
    }
    const sideA = new THREE.Group();
    boards(sideA, 2, 'x', 1.3, 0.26, 0.03, wood(), [0, 0, 0], r);
    sideA.position.set(0, 0.35, 0.17);
    sideA.rotation.x = -0.45;
    g.add(sideA);
    const sideB = sideA.clone();
    sideB.position.z = -0.17;
    sideB.rotation.x = 0.45;
    g.add(sideB);
    box(g, [1.3, 0.03, 0.14], wood(), [0, 0.24, 0]);
    box(g, [1.2, 0.08, 0.22], hay(), [0, 0.3, 0]);
    for (const x of [-0.5, 0.5]) box(g, [0.06, 0.04, 0.6], rust(), [x, 0.52, 0]);
    return g;
  },
};

export function makeStructureModel(id: StructureId): THREE.Object3D {
  const g = BUILDERS[id]();
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

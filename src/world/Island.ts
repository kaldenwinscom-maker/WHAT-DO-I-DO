// A floating island: an uneven soil top over a jagged rock underside, built as one mesh
// from a polar grid. The top surface is an analytic heightfield, so collision matches it.

import * as THREE from 'three';
import { fbm3, fbmAngle, rng } from './noise';
import { makeRockGeometry } from './rocks';
import type { Terrain } from './Physics';

export interface IslandParams {
  seed: number;
  /** Average radius of the walkable top, metres. */
  radius: number;
  /** How far the rocky underside hangs down, metres. */
  depth: number;
  /** Height variation of the top surface, metres. */
  bumpiness: number;
  position?: THREE.Vector3Like;
  /** Mesh resolution: angular segments. */
  segments?: number;
}

const TOP_RINGS = 16;
const LIP_RINGS = 3;
const UNDER_RINGS = 14;

export class Island implements Terrain {
  readonly mesh: THREE.Mesh;
  readonly origin = new THREE.Vector3();
  private readonly p: Required<Omit<IslandParams, 'position'>>;

  constructor(params: IslandParams, material: THREE.Material) {
    this.p = { segments: 96, ...params };
    if (params.position) this.origin.copy(params.position);
    this.mesh = new THREE.Mesh(this.buildGeometry(), material);
    this.mesh.position.copy(this.origin);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  /** Radius of the walkable top at a given angle. */
  rimRadius(angle: number): number {
    return this.p.radius * (1 + fbmAngle(angle, 1.4, 3, this.p.seed) * 0.9);
  }

  /** Local-space top height (relative to origin). */
  private topHeight(lx: number, lz: number): number {
    const { seed, bumpiness } = this.p;
    const r = Math.hypot(lx, lz);
    const R = this.rimRadius(Math.atan2(lz, lx));
    const t = Math.min(1, r / R);
    let h = fbm3(lx * 0.18, 3.1, lz * 0.18, 3, seed + 3) * bumpiness * 2 + fbm3(lx * 0.7, 9.2, lz * 0.7, 2, seed + 5) * bumpiness * 0.5;
    // Gentle dome, rounding off towards the rim.
    h += (1 - t * t) * bumpiness * 0.6;
    const edge = THREE.MathUtils.smoothstep(t, 0.8, 1);
    h -= edge * edge * 0.35;
    return h;
  }

  heightAt(x: number, z: number): number | null {
    const lx = x - this.origin.x;
    const lz = z - this.origin.z;
    const r = Math.hypot(lx, lz);
    if (r > this.rimRadius(Math.atan2(lz, lx))) return null;
    return this.origin.y + this.topHeight(lx, lz);
  }

  /** Random point on the walkable top, at least `margin` from the rim. */
  randomTopPoint(rand: () => number, margin = 0.3): THREE.Vector3 {
    for (let tries = 0; tries < 50; tries++) {
      const a = rand() * Math.PI * 2;
      const R = this.rimRadius(a) - margin;
      const r = Math.sqrt(rand()) * R;
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      return new THREE.Vector3(this.origin.x + lx, this.origin.y + this.topHeight(lx, lz), this.origin.z + lz);
    }
    return this.origin.clone();
  }

  private buildGeometry(): THREE.BufferGeometry {
    const { seed, depth, segments: M } = this.p;
    const rows: number[][] = []; // row -> [x,y,z] per segment, flattened
    const angles = Array.from({ length: M }, (_, j) => (j / M) * Math.PI * 2);
    const rims = angles.map((a) => this.rimRadius(a));

    // Top surface, centre to rim.
    for (let i = 0; i <= TOP_RINGS; i++) {
      const row: number[] = [];
      for (let j = 0; j < M; j++) {
        const r = (i / TOP_RINGS) * rims[j];
        const x = Math.cos(angles[j]) * r;
        const z = Math.sin(angles[j]) * r;
        row.push(x, this.topHeight(x, z), z);
      }
      rows.push(row);
    }

    // Lip: the edge curls over and down.
    const rimY = rows[TOP_RINGS].filter((_, k) => k % 3 === 1);
    for (let i = 1; i <= LIP_RINGS; i++) {
      const row: number[] = [];
      const t = i / LIP_RINGS;
      for (let j = 0; j < M; j++) {
        const r = rims[j] * (1 + Math.sin(t * Math.PI) * 0.035);
        row.push(Math.cos(angles[j]) * r, rimY[j] - t * 0.55, Math.sin(angles[j]) * r);
      }
      rows.push(row);
    }

    // Underside: a craggy, uneven cone hanging into the void.
    const v = new THREE.Vector3();
    for (let i = 1; i <= UNDER_RINGS; i++) {
      const t = i / UNDER_RINGS;
      const row: number[] = [];
      for (let j = 0; j < M; j++) {
        const a = angles[j];
        // Some sides hang deeper than others.
        const sag = 0.65 + (fbmAngle(a, 1.8, 2, seed + 11) + 0.5) * 0.7;
        const shrink = Math.pow(1 - t, 0.9 + sag * 0.5);
        const r = rims[j] * (0.97 * shrink + 0.02);
        const y = rimY[j] - 0.55 - t * depth * sag;
        v.set(Math.cos(a) * r, y, Math.sin(a) * r);
        // Craggy displacement, strongest mid-way down.
        const s = Math.sin(t * Math.PI) * 0.9 + 0.1;
        const n1 = fbm3(v.x * 0.35, v.y * 0.35, v.z * 0.35, 4, seed + 21);
        const n2 = fbm3(v.x * 1.3, v.y * 1.3, v.z * 1.3, 2, seed + 23);
        const radial = 1 + (n1 * 0.9 + n2 * 0.25) * s;
        v.x *= radial;
        v.z *= radial;
        v.y += fbm3(v.x * 0.5, 0, v.z * 0.5, 2, seed + 31) * depth * 0.25 * s;
        row.push(v.x, v.y, v.z);
      }
      rows.push(row);
    }

    const positions: number[] = [];
    rows.forEach((row) => positions.push(...row));
    const indices: number[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * M + j;
        const b = i * M + ((j + 1) % M);
        const c = (i + 1) * M + j;
        const d = (i + 1) * M + ((j + 1) % M);
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // The centre and tip rings collapse to a point: give those vertices a clean normal.
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let j = 0; j < M; j++) {
      nrm.setXYZ(j, 0, 1, 0);
      nrm.setXYZ((rows.length - 1) * M + j, 0, -1, 0);
    }
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------------------------------------------------------------------------------- grass

/** Shared wind clock for anything that sways. */
export const windUniforms = { uTime: { value: 0 } };

function makeTuftGeometry(): THREE.BufferGeometry {
  // Three tapered, slightly bent blades crossing at the base.
  const pos: number[] = [];
  const hgt: number[] = [];
  const idx: number[] = [];
  const SEG = 3;
  const BLADES = 5;
  for (let b = 0; b < BLADES; b++) {
    const rot = (b / BLADES) * Math.PI * 2 + b * 0.7;
    const lean = 0.08 + (b % 3) * 0.06;
    const ox = Math.cos(rot + 1.3) * 0.05 * ((b % 2) + 0.5);
    const oz = Math.sin(rot + 1.3) * 0.05 * ((b % 2) + 0.5);
    const hScale = 0.7 + ((b * 37) % 10) / 22;
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const w = 0.016 * (1 - t * 0.9);
      const bend = t * t * lean;
      for (const side of [-1, 1]) {
        const lx = side * w;
        pos.push(ox + Math.cos(rot) * lx + Math.cos(rot + Math.PI / 2) * bend, t * hScale, oz + Math.sin(rot) * lx + Math.sin(rot + Math.PI / 2) * bend);
        hgt.push(t);
      }
    }
    for (let s = 0; s < SEG; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('grassH', new THREE.Float32BufferAttribute(hgt, 1));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  return geo;
}

function makeGrassMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute float grassH;
        varying float vGrassH;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGrassH = grassH;
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float gust = sin(uTime * 0.7 + ip.x * 0.15) * 0.5 + 0.5;
          float sway = sin(uTime * 2.1 + ip.x * 0.9 + ip.z * 0.7) * (0.35 + gust * 0.65)
                     + sin(uTime * 4.3 + ip.z * 1.7) * 0.15;
          vec3 windW = vec3(0.8, 0.0, 0.45) * sway * grassH * grassH * 0.22;
          transformed += inverse(mat3(instanceMatrix)) * windW;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGrassH;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.5, 1.1, vGrassH);`);
  };
  return mat;
}

export function makeGrass(island: Island, count: number, avoid: { x: number; z: number; r: number }[], seed = 5): THREE.InstancedMesh {
  const tufts = Math.max(1, Math.floor(count / 5));
  const mesh = new THREE.InstancedMesh(makeTuftGeometry(), makeGrassMaterial(), tufts);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  const r = rng(seed);
  const palette = ['#7d8450', '#8e8a58', '#6f7a4a', '#9a9262', '#7a805a', '#a29468', '#8a8a5c'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  for (let tries = 0; placed < tufts && tries < tufts * 8; tries++) {
    const p = island.randomTopPoint(r, 0.25);
    if (avoid.some((a) => Math.hypot(p.x - a.x, p.z - a.z) < a.r)) continue;
    // Clumpy: denser where the noise is high.
    const clump = fbm3(p.x * 0.45, 0, p.z * 0.45, 2, seed) + 0.5;
    if (r() > clump * 1.4) continue;
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    const h = 0.16 + r() * 0.26 * (0.6 + clump);
    s.set(0.9 + r() * 0.5, h, 0.9 + r() * 0.5);
    m.compose(p.setY(p.y - 0.02), q, s);
    mesh.setMatrixAt(placed, m);
    const c = palette[Math.floor(r() * palette.length)].clone().multiplyScalar(0.85 + r() * 0.3);
    mesh.setColorAt(placed, c);
    placed++;
  }
  mesh.count = placed;
  return mesh;
}

export function makeStones(island: Island, count: number, material: THREE.Material, avoid: { x: number; z: number; r: number }[], seed = 9): THREE.InstancedMesh {
  const geo = makeRockGeometry(seed, { detail: 3, scale: { x: 1, y: 0.75, z: 0.85 }, lumpiness: 0.3, roughness: 0.08, cuts: 7 });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const r = rng(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 10; tries++) {
    const p = island.randomTopPoint(r, 0.15);
    if (avoid.some((a) => Math.hypot(p.x - a.x, p.z - a.z) < a.r)) continue;
    e.set(r() * 0.5, r() * Math.PI * 2, r() * 0.5);
    q.setFromEuler(e);
    const size = r() < 0.15 ? 0.22 + r() * 0.18 : 0.06 + r() * 0.1;
    s.set(size, size, size);
    m.compose(p.setY(p.y - size * 0.1), q, s);
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  return mesh;
}

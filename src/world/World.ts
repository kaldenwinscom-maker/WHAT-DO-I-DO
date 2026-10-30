// Voxel storage + rendering. Each block type is drawn with a single InstancedMesh.
// Block (x,y,z) occupies the unit cube [x,x+1] x [y,y+1] x [z,z+1].
// The magic block lives in the voxel map (so it collides and can be built on)
// but is rendered separately by MagicBlock.

import * as THREE from 'three';
import { BLOCKS, type BlockId } from '../data/blocks';
import { getTexture } from './textures';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit face (points toward where a new block would go). */
  nx: number;
  ny: number;
  nz: number;
  id: BlockId;
  distance: number;
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

function hashPos(x: number, y: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function faceMaterial(texKey: string): THREE.MeshStandardMaterial {
  let m = materialCache.get(texKey);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: getTexture(texKey), roughness: 0.95, metalness: 0 });
    materialCache.set(texKey, m);
  }
  return m;
}

/** Materials in BoxGeometry face order: +x, -x, +y, -y, +z, -z. */
export function blockMaterials(id: BlockId): THREE.Material[] {
  const t = BLOCKS[id].textures;
  return [t.side, t.side, t.top, t.bottom, t.side, t.side].map(faceMaterial);
}

export class World {
  readonly group = new THREE.Group();
  private blocks = new Map<string, BlockId>();
  private meshes = new Map<BlockId, THREE.InstancedMesh>();
  private dirty = new Set<BlockId>();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  /** Called whenever a block is added or removed (used by the save system). */
  onChange: (() => void) | null = null;

  constructor() {
    this.geometry.translate(0.5, 0.5, 0.5);
  }

  get(x: number, y: number, z: number): BlockId | undefined {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.blocks.has(key(x, y, z));
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    const k = key(x, y, z);
    const prev = this.blocks.get(k);
    if (prev === id) return;
    if (prev) this.dirty.add(prev);
    this.blocks.set(k, id);
    this.dirty.add(id);
    this.onChange?.();
  }

  remove(x: number, y: number, z: number): BlockId | undefined {
    const k = key(x, y, z);
    const prev = this.blocks.get(k);
    if (!prev) return undefined;
    this.blocks.delete(k);
    this.dirty.add(prev);
    this.onChange?.();
    return prev;
  }

  clear(): void {
    for (const id of this.blocks.values()) this.dirty.add(id);
    this.blocks.clear();
  }

  get size(): number {
    return this.blocks.size;
  }

  *entries(): IterableIterator<[number, number, number, BlockId]> {
    for (const [k, id] of this.blocks) {
      const [x, y, z] = k.split(',').map(Number);
      yield [x, y, z, id];
    }
  }

  /** Rebuild instance buffers for block types that changed this frame. */
  update(): void {
    if (this.dirty.size === 0) return;
    const byType = new Map<BlockId, [number, number, number][]>();
    for (const id of this.dirty) byType.set(id, []);
    for (const [x, y, z, id] of this.entries()) byType.get(id)?.push([x, y, z]);
    for (const [id, positions] of byType) {
      if (id === 'magic') continue;
      this.rebuildType(id, positions);
    }
    this.dirty.clear();
  }

  private rebuildType(id: BlockId, positions: [number, number, number][]): void {
    let mesh = this.meshes.get(id);
    if (!mesh || mesh.instanceMatrix.count < positions.length) {
      let capacity = mesh ? mesh.instanceMatrix.count : 256;
      while (capacity < positions.length) capacity *= 2;
      if (mesh) {
        this.group.remove(mesh);
        mesh.dispose();
      }
      mesh = new THREE.InstancedMesh(this.geometry, blockMaterials(id), capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // bounds change constantly; the platform is always near anyway
      this.meshes.set(id, mesh);
      this.group.add(mesh);
    }
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i];
      m.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m);
      // Slight per-block tint so large surfaces don't look copy-pasted.
      const v = 0.9 + hashPos(x, y, z) * 0.12;
      c.setRGB(v, v, v);
      mesh.setColorAt(i, c);
    }
    mesh.count = positions.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Voxel DDA raycast (Amanatides & Woo). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    const frac = (v: number, s: number) => (s > 0 ? Math.ceil(v) - v || 1 : v - Math.floor(v));
    let tMaxX = stepX !== 0 ? frac(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = stepY !== 0 ? frac(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = stepZ !== 0 ? frac(origin.z, stepZ) * tDeltaZ : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const id = this.get(x, y, z);
      if (id) return { x, y, z, nx, ny, nz, id, distance: t };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        ny = -stepY;
        nx = nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nz = -stepZ;
        nx = ny = 0;
      }
    }
    return null;
  }

  serialize(): [number, number, number, BlockId][] {
    return [...this.entries()];
  }

  load(data: [number, number, number, BlockId][]): void {
    this.clear();
    for (const [x, y, z, id] of data) if (BLOCKS[id]) this.blocks.set(key(x, y, z), id);
    for (const id of this.blocks.values()) this.dirty.add(id);
    // Also mark every type dirty so meshes for now-absent types get emptied.
    for (const id of this.meshes.keys()) this.dirty.add(id);
  }
}

// Placed structures (crafting tables, blueprint builds): their meshes, colliders, and the
// rules for where something can be placed.

import * as THREE from 'three';
import { STRUCTURES, type StructureId } from '../data/structures';
import type { CraftQueue } from '../crafting/Crafting';
import type { Physics, Collider } from '../world/Physics';
import { makeStructureModel } from './structureModels';

export interface PlacedStructure {
  uid: number;
  type: StructureId;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Crafting queue (crafting tables only). */
  queue: CraftQueue;
  mesh: THREE.Object3D;
  collider: Collider | null;
}

export interface SavedStructure {
  type: StructureId;
  x: number;
  y: number;
  z: number;
  rot: number;
  queue?: CraftQueue;
}

/** Highest allowed difference in ground height under a footprint (metres). */
const MAX_SLOPE = 0.45;

export class Structures {
  readonly group = new THREE.Group();
  list: PlacedStructure[] = [];
  private nextUid = 1;

  constructor(private readonly physics: Physics) {}

  add(type: StructureId, x: number, y: number, z: number, rot: number, queue: CraftQueue = []): PlacedStructure {
    const def = STRUCTURES[type];
    const mesh = makeStructureModel(type);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.userData.structureUid = this.nextUid;
    this.group.add(mesh);
    const collider: Collider | null =
      def.height > 0 ? { kind: 'obox', x, z, hx: def.size.w / 2, hz: def.size.d / 2, rot, y0: y - 0.5, y1: y + def.height } : null;
    if (collider) this.physics.colliders.push(collider);
    const s: PlacedStructure = { uid: this.nextUid++, type, x, y, z, rot, queue, mesh, collider };
    this.list.push(s);
    return s;
  }

  clear(): void {
    for (const s of this.list) {
      this.group.remove(s.mesh);
      if (s.collider) this.physics.colliders.splice(this.physics.colliders.indexOf(s.collider), 1);
    }
    this.list = [];
  }

  /** Closest structure of a type within `range` metres (horizontal) of a point. */
  nearest(type: StructureId, pos: THREE.Vector3, range: number): PlacedStructure | null {
    let best: PlacedStructure | null = null;
    let bestD = range;
    for (const s of this.list) {
      if (s.type !== type) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  /** Footprint sample points (world XZ) for a structure at a spot. */
  footprint(type: StructureId, x: number, z: number, rot: number, inset = 0): [number, number][] {
    const { w, d } = STRUCTURES[type].size;
    const hx = w / 2 - inset;
    const hz = d / 2 - inset;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const pts: [number, number][] = [];
    for (const fx of [-1, 0, 1])
      for (const fz of [-1, 0, 1]) {
        const lx = fx * hx;
        const lz = fz * hz;
        pts.push([x + lx * cos + lz * sin, z - lx * sin + lz * cos]);
      }
    return pts;
  }

  /**
   * Can `type` go at (x,z) with this rotation? Returns the height to place it at.
   * Needs solid ground under the whole footprint, a fairly flat spot, and no overlap with
   * the Monolith, other structures or the player.
   */
  check(
    type: StructureId,
    x: number,
    z: number,
    rot: number,
    terrainHeight: (x: number, z: number) => number | null,
    player: { x: number; z: number; r: number },
  ): { ok: boolean; y: number; reason?: string } {
    const pts = this.footprint(type, x, z, rot);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [px, pz] of pts) {
      const h = terrainHeight(px, pz);
      if (h === null) return { ok: false, y: terrainHeight(x, z) ?? 0, reason: 'Needs solid ground' };
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    const y = hi - 0.04;
    if (hi - lo > MAX_SLOPE) return { ok: false, y, reason: 'Too steep' };

    const probe: Collider = { kind: 'obox', x, z, hx: STRUCTURES[type].size.w / 2, hz: STRUCTURES[type].size.d / 2, rot, y0: 0, y1: 0 };
    if (this.physics.overlaps2D(probe, player.x, player.z, player.r)) return { ok: false, y, reason: 'You are in the way' };
    const inner = this.footprint(type, x, z, rot, 0.05);
    for (const c of this.physics.colliders) {
      if (inner.some(([px, pz]) => this.physics.overlaps2D(c, px, pz, 0.02))) return { ok: false, y, reason: 'Something is in the way' };
      const cx = c.kind === 'box' ? (c.min.x + c.max.x) / 2 : c.x;
      const cz = c.kind === 'box' ? (c.min.z + c.max.z) / 2 : c.z;
      if (this.physics.overlaps2D(probe, cx, cz, 0.05)) return { ok: false, y, reason: 'Something is in the way' };
    }
    // Structures without colliders (fire pit) still can't overlap others.
    for (const s of this.list) {
      if (s.collider) continue;
      const r = Math.max(STRUCTURES[s.type].size.w, STRUCTURES[s.type].size.d) / 2;
      if (this.physics.overlaps2D(probe, s.x, s.z, r * 0.8)) return { ok: false, y, reason: 'Something is in the way' };
    }
    return { ok: true, y };
  }

  serialize(): SavedStructure[] {
    return this.list.map((s) => ({ type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot, queue: s.queue.length ? s.queue : undefined }));
  }
}

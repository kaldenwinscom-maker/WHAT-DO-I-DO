// Simple character collision against terrain heightfields and static colliders.
// The player is a vertical cylinder; colliders are vertical cylinders or axis-aligned boxes
// (building pieces will add rotated boxes later).

import * as THREE from 'three';

export interface Terrain {
  /** Ground height at a world XZ, or null if there is no ground (the void). */
  heightAt(x: number, z: number): number | null;
}

export type Collider =
  | { kind: 'cylinder'; x: number; z: number; r: number; y0: number; y1: number }
  | { kind: 'box'; min: THREE.Vector3; max: THREE.Vector3 };

export class Physics {
  readonly terrains: Terrain[] = [];
  readonly colliders: Collider[] = [];

  /**
   * Highest standable surface under a circle of radius `r` at (x,z), at or below `maxY`.
   * Returns -Infinity over the void.
   */
  groundHeight(x: number, z: number, r: number, maxY: number): number {
    let best = -Infinity;
    const k = r * 0.7;
    const samples: [number, number][] = [
      [x, z],
      [x + k, z],
      [x - k, z],
      [x, z + k],
      [x, z - k],
    ];
    for (const t of this.terrains) {
      for (const [sx, sz] of samples) {
        const h = t.heightAt(sx, sz);
        if (h !== null && h > best && h <= maxY) best = h;
      }
    }
    for (const c of this.colliders) {
      const top = c.kind === 'cylinder' ? c.y1 : c.max.y;
      if (top > maxY) continue;
      if (c.kind === 'cylinder') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + r * 0.5 && c.y1 > best) best = c.y1;
      } else if (x + r * 0.5 > c.min.x && x - r * 0.5 < c.max.x && z + r * 0.5 > c.min.z && z - r * 0.5 < c.max.z) {
        if (c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }

  /** Lowest ceiling above `y` that a body of radius r at (x,z) would hit. */
  ceilingHeight(x: number, z: number, r: number, y: number): number {
    let best = Infinity;
    for (const c of this.colliders) {
      const bottom = c.kind === 'cylinder' ? c.y0 : c.min.y;
      if (bottom < y || bottom >= best) continue;
      if (this.overlaps2D(c, x, z, r)) best = bottom;
    }
    return best;
  }

  /**
   * Push a body (feet at `pos.y`, radius r, height h) out of any colliders it overlaps.
   * Ledges below `stepHeight` are ignored here so the body can walk up onto them.
   */
  resolveHorizontal(pos: THREE.Vector3, r: number, h: number, stepHeight: number): boolean {
    let hit = false;
    const lo = pos.y + stepHeight;
    const hi = pos.y + h;
    for (const c of this.colliders) {
      if (c.kind === 'cylinder') {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d < min) {
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          pos.x = c.x + nx * min;
          pos.z = c.z + nz * min;
          hit = true;
        }
      } else {
        if (c.max.y <= lo || c.min.y >= hi) continue;
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Centre is inside the box: push out along the shallowest side.
          const exits = [pos.x - c.min.x + r, c.max.x - pos.x + r, pos.z - c.min.z + r, c.max.z - pos.z + r];
          const m = Math.min(...exits);
          if (m === exits[0]) pos.x = c.min.x - r;
          else if (m === exits[1]) pos.x = c.max.x + r;
          else if (m === exits[2]) pos.z = c.min.z - r;
          else pos.z = c.max.z + r;
        }
        hit = true;
      }
    }
    return hit;
  }

  private overlaps2D(c: Collider, x: number, z: number, r: number): boolean {
    if (c.kind === 'cylinder') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    return x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z;
  }
}

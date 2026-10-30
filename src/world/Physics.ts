// Simple character collision against terrain heightfields and static colliders.
// The player is a vertical cylinder; colliders are vertical cylinders, axis-aligned boxes,
// or boxes rotated around Y (placed structures).

import * as THREE from 'three';

export interface Terrain {
  /** Ground height at a world XZ, or null if there is no ground (the void). */
  heightAt(x: number, z: number): number | null;
}

export type Collider =
  | { kind: 'cylinder'; x: number; z: number; r: number; y0: number; y1: number }
  | { kind: 'box'; min: THREE.Vector3; max: THREE.Vector3 }
  /** Box of half-size hx/hz centred on x/z, rotated by `rot` radians around Y. */
  | { kind: 'obox'; x: number; z: number; hx: number; hz: number; rot: number; y0: number; y1: number };

const top = (c: Collider) => (c.kind === 'box' ? c.max.y : c.y1);
const bottom = (c: Collider) => (c.kind === 'box' ? c.min.y : c.y0);

/** World XZ -> collider-local XZ for a rotated box. */
function toLocal(c: { x: number; z: number; rot: number }, x: number, z: number): [number, number] {
  const dx = x - c.x;
  const dz = z - c.z;
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

function toWorld(c: { x: number; z: number; rot: number }, lx: number, lz: number): [number, number] {
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  return [c.x + lx * cos + lz * sin, c.z - lx * sin + lz * cos];
}

/** Push a circle (centre px,pz radius r) out of a rectangle [minX,maxX]x[minZ,maxZ]. Returns the new centre, or null if no overlap. */
function pushOutOfRect(px: number, pz: number, r: number, minX: number, maxX: number, minZ: number, maxZ: number): [number, number] | null {
  const cx = Math.max(minX, Math.min(px, maxX));
  const cz = Math.max(minZ, Math.min(pz, maxZ));
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // Centre is inside: push out along the shallowest side.
  const exits = [px - minX + r, maxX - px + r, pz - minZ + r, maxZ - pz + r];
  const m = Math.min(...exits);
  if (m === exits[0]) return [minX - r, pz];
  if (m === exits[1]) return [maxX + r, pz];
  if (m === exits[2]) return [px, minZ - r];
  return [px, maxZ + r];
}

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
      const y = top(c);
      if (y > maxY || y <= best) continue;
      if (this.overlaps2D(c, x, z, r * 0.5)) best = y;
    }
    return best;
  }

  /** Lowest ceiling above `y` that a body of radius r at (x,z) would hit. */
  ceilingHeight(x: number, z: number, r: number, y: number): number {
    let best = Infinity;
    for (const c of this.colliders) {
      const b = bottom(c);
      if (b < y || b >= best) continue;
      if (this.overlaps2D(c, x, z, r)) best = b;
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
      if (top(c) <= lo || bottom(c) >= hi) continue;
      if (c.kind === 'cylinder') {
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
      } else if (c.kind === 'box') {
        const out = pushOutOfRect(pos.x, pos.z, r, c.min.x, c.max.x, c.min.z, c.max.z);
        if (out) {
          [pos.x, pos.z] = out;
          hit = true;
        }
      } else {
        const [lx, lz] = toLocal(c, pos.x, pos.z);
        const out = pushOutOfRect(lx, lz, r, -c.hx, c.hx, -c.hz, c.hz);
        if (out) {
          [pos.x, pos.z] = toWorld(c, out[0], out[1]);
          hit = true;
        }
      }
    }
    return hit;
  }

  /** Does a circle at (x,z) of radius r overlap the collider's footprint? */
  overlaps2D(c: Collider, x: number, z: number, r: number): boolean {
    if (c.kind === 'cylinder') return Math.hypot(x - c.x, z - c.z) < c.r + r;
    if (c.kind === 'box') return x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z;
    const [lx, lz] = toLocal(c, x, z);
    return lx + r > -c.hx && lx - r < c.hx && lz + r > -c.hz && lz - r < c.hz;
  }
}

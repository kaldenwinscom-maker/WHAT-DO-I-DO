// Organic rock shapes: a noise-displaced sphere with a few flat "fracture" cuts.
// Used for the Monolith, scattered stones, debris chips and rock items.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, rng } from './noise';

export interface RockShape {
  /** Icosahedron subdivision. 2-4 for pebbles, 20+ for a hero rock. */
  detail: number;
  /** Overall size along each axis (radius-ish). */
  scale: THREE.Vector3Like;
  /** Large-scale lumpiness (0..0.6). */
  lumpiness?: number;
  /** Fine surface roughness (0..0.15). */
  roughness?: number;
  /** Number of flat fracture planes. */
  cuts?: number;
  /** Flatten the underside below this local Y (in unit-sphere space, e.g. -0.6). */
  flattenBelow?: number;
}

export function makeRockGeometry(seed: number, shape: RockShape): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, shape.detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(seed);
  const lump = shape.lumpiness ?? 0.3;
  const rough = shape.roughness ?? 0.06;
  const offs = [r() * 100, r() * 100, r() * 100];

  const cuts: { n: THREE.Vector3; d: number }[] = [];
  for (let i = 0; i < (shape.cuts ?? 6); i++) {
    const n = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
    cuts.push({ n, d: 0.55 + r() * 0.3 });
  }

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const big = fbm3(v.x * 1.1 + offs[0], v.y * 1.1 + offs[1], v.z * 1.1 + offs[2], 3, seed);
    const fine = fbm3(v.x * 4.5 + offs[1], v.y * 4.5 + offs[2], v.z * 4.5 + offs[0], 3, seed + 7);
    v.multiplyScalar(1 + big * lump * 2 + fine * rough * 2);
    for (const c of cuts) {
      const dist = v.dot(c.n);
      if (dist > c.d) v.addScaledVector(c.n, -(dist - c.d) * 0.9);
    }
    if (shape.flattenBelow !== undefined && v.y < shape.flattenBelow) {
      v.y = shape.flattenBelow + (v.y - shape.flattenBelow) * 0.25;
    }
    pos.setXYZ(i, v.x * shape.scale.x, v.y * shape.scale.y, v.z * shape.scale.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

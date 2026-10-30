// Small debris chunks for breaking blocks. One instanced mesh, fixed pool.

import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  color: THREE.Color;
}

const MAX = 400;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  }

  /** Burst of debris at a block's center, sampled from a texture canvas for colours. */
  burst(x: number, y: number, z: number, palette: string[] | HTMLCanvasElement, count = 14, power = 3): void {
    const cols = Array.isArray(palette) ? palette.map((c) => new THREE.Color(c)) : sampleCanvas(palette, 8);
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      const life = 0.5 + Math.random() * 0.6;
      this.parts.push({
        pos: new THREE.Vector3(x + 0.5 + (Math.random() - 0.5) * 0.8, y + 0.5 + (Math.random() - 0.5) * 0.8, z + 0.5 + (Math.random() - 0.5) * 0.8),
        vel: new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power + 1, (Math.random() - 0.5) * power),
        life,
        maxLife: life,
        size: 0.06 + Math.random() * 0.1,
        spin: Math.random() * 10,
        color: cols[Math.floor(Math.random() * cols.length)],
      });
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.spin += dt * 8;
      this.parts[w] = p;
      const sz = p.size * Math.min(1, p.life / (p.maxLife * 0.4));
      this.e.set(p.spin, p.spin * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(sz);
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(w, this.m);
      this.mesh.setColorAt(w, p.color);
      w++;
    }
    this.parts.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const sampleCache = new WeakMap<HTMLCanvasElement, THREE.Color[]>();
function sampleCanvas(c: HTMLCanvasElement, n: number): THREE.Color[] {
  const cached = sampleCache.get(c);
  if (cached) return cached;
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out: THREE.Color[] = [];
  for (let i = 0; i < n; i++) {
    const o = Math.floor(Math.random() * c.width * c.height) * 4;
    out.push(new THREE.Color().setRGB(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255, THREE.SRGBColorSpace));
  }
  sampleCache.set(c, out);
  return out;
}

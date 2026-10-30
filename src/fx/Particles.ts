// Debris and dust: rock chips, a broken-off chunk when the Monolith cracks, and soft dust puffs.
// Chips and chunks bounce on the terrain using the same physics the player uses.

import * as THREE from 'three';
import type { PhaseLook } from '../data/phases';
import { layersFromLook } from '../block/Monolith';
import { makeTriplanarMaterial, setTriLayers } from '../render/triplanar';
import { makeRockGeometry } from '../world/rocks';
import type { Physics } from '../world/Physics';

const MAX_CHIPS = 300;
const MAX_DUST = 260;
const MAX_CHUNKS = 6;
const GRAVITY = 16;

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  life: number;
  maxLife: number;
  resting: boolean;
  color?: THREE.Color;
}

interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

const dustVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (600.0 / -mvPosition.z);
    vAlpha = aAlpha;
    vColor = aColor;
    #include <fog_vertex>
  }
`;

const dustFrag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <fog_fragment>
  }
`;

export class Particles {
  readonly group = new THREE.Group();
  private readonly chipMesh: THREE.InstancedMesh;
  private readonly chipMat: THREE.MeshStandardMaterial;
  private chips: Body[] = [];
  private readonly chunkMat: THREE.MeshStandardMaterial;
  private readonly chunkGeos: THREE.BufferGeometry[];
  private chunks: { body: Body; mesh: THREE.Mesh }[] = [];
  private readonly dustPoints: THREE.Points;
  private puffs: Puff[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly chipColor = new THREE.Color();
  private readonly dustColor = new THREE.Color('#9a9080');

  constructor(
    private readonly physics: Physics,
    look: PhaseLook,
  ) {
    const chipGeo = makeRockGeometry(77, { detail: 1, scale: { x: 1, y: 0.7, z: 0.85 }, lumpiness: 0.3, cuts: 4 });
    this.chipMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    this.chipMesh = new THREE.InstancedMesh(chipGeo, this.chipMat, MAX_CHIPS);
    this.chipMesh.count = 0;
    this.chipMesh.castShadow = true;
    this.chipMesh.frustumCulled = false;
    for (let i = 0; i < MAX_CHIPS; i++) this.chipMesh.setColorAt(i, new THREE.Color(1, 1, 1));
    this.group.add(this.chipMesh);

    const layers = layersFromLook(look);
    this.chunkMat = makeTriplanarMaterial({ base: layers.base, top: layers.top ?? { ...layers.base, amount: 0 }, objectSpace: true });
    this.chunkGeos = [0, 1, 2].map((i) =>
      makeRockGeometry(500 + i, { detail: 4, scale: { x: 1, y: 0.75, z: 0.85 }, lumpiness: 0.25, roughness: 0.05, cuts: 7 }),
    );

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_DUST), 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_DUST), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    this.dustPoints = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: dustVert,
        fragmentShader: dustFrag,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    this.dustPoints.frustumCulled = false;
    this.group.add(this.dustPoints);
    this.setLook(look);
  }

  setLook(look: PhaseLook): void {
    const layers = layersFromLook(look);
    setTriLayers(this.chunkMat, layers.base, layers.top);
    this.chipColor.set(look.base.tint).multiplyScalar(0.42);
    this.dustColor.set(look.base.tint).lerp(new THREE.Color('#8a8172'), 0.6);
  }

  /** Small stone chips flying out from a point, biased along `dir`. */
  chipBurst(point: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number, color = this.chipColor): void {
    for (let i = 0; i < count; i++) {
      if (this.chips.length >= MAX_CHIPS) this.chips.shift();
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.4, (Math.random() - 0.5) * 2)
        .multiplyScalar(speed * 0.6)
        .addScaledVector(dir, speed * (0.4 + Math.random() * 0.6));
      const life = 1.6 + Math.random() * 1.6;
      this.chips.push({
        pos: point.clone(),
        vel: v,
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        size: 0.025 + Math.random() * 0.05,
        life,
        maxLife: life,
        resting: false,
        color: color.clone().multiplyScalar(0.75 + Math.random() * 0.45),
      });
    }
  }

  /** A fist-sized piece of the Monolith breaking away. */
  chunk(point: THREE.Vector3, dir: THREE.Vector3): void {
    if (this.chunks.length >= MAX_CHUNKS) {
      const old = this.chunks.shift()!;
      this.group.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(this.chunkGeos[Math.floor(Math.random() * this.chunkGeos.length)], this.chunkMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const size = 0.09 + Math.random() * 0.06;
    mesh.scale.setScalar(size);
    this.group.add(mesh);
    const vel = dir.clone().multiplyScalar(2.6 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 3 + Math.random(), (Math.random() - 0.5) * 1.2));
    this.chunks.push({
      mesh,
      body: {
        pos: point.clone().addScaledVector(dir, 0.15),
        vel,
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
        size,
        life: 6,
        maxLife: 6,
        resting: false,
      },
    });
  }

  /** Soft, billowing dust. */
  dust(point: THREE.Vector3, count: number, spread: number, size = 0.5, color = this.dustColor): void {
    for (let i = 0; i < count; i++) {
      if (this.puffs.length >= MAX_DUST) this.puffs.shift();
      const life = 0.9 + Math.random() * 1.2;
      this.puffs.push({
        pos: point.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9),
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: color.clone().multiplyScalar(0.85 + Math.random() * 0.3),
      });
    }
  }

  private stepBody(b: Body, dt: number, radius: number): void {
    if (b.resting) return;
    b.vel.y -= GRAVITY * dt;
    b.pos.addScaledVector(b.vel, dt);
    b.rot.x += b.spin.x * dt;
    b.rot.y += b.spin.y * dt;
    b.rot.z += b.spin.z * dt;
    // Bounce off the Monolith / building colliders sideways.
    if (this.physics.resolveHorizontal(b.pos, radius, radius * 2, 0)) {
      b.vel.x *= -0.4;
      b.vel.z *= -0.4;
    }
    const ground = this.physics.groundHeight(b.pos.x, b.pos.z, radius, b.pos.y + radius + 0.3);
    if (ground > -Infinity && b.pos.y - radius < ground) {
      b.pos.y = ground + radius;
      if (b.vel.y < 0) b.vel.y *= -0.32;
      b.vel.x *= 0.62;
      b.vel.z *= 0.62;
      b.spin.multiplyScalar(0.6);
      if (Math.abs(b.vel.y) < 0.4 && Math.hypot(b.vel.x, b.vel.z) < 0.15) b.resting = true;
    }
  }

  update(dt: number): void {
    // Chips.
    let w = 0;
    for (const c of this.chips) {
      c.life -= dt;
      if (c.life <= 0 || c.pos.y < -60) continue;
      this.stepBody(c, dt, c.size);
      this.chips[w] = c;
      const fade = Math.min(1, c.life / 0.5);
      this.q.setFromEuler(c.rot);
      this.s.setScalar(c.size * fade);
      this.m.compose(c.pos, this.q, this.s);
      this.chipMesh.setMatrixAt(w, this.m);
      this.chipMesh.setColorAt(w, c.color!);
      w++;
    }
    this.chips.length = w;
    this.chipMesh.count = w;
    this.chipMesh.instanceMatrix.needsUpdate = true;
    if (this.chipMesh.instanceColor) this.chipMesh.instanceColor.needsUpdate = true;

    // Chunks: settle, then sink into the ground and vanish.
    this.chunks = this.chunks.filter(({ body, mesh }) => {
      body.life -= dt;
      if (body.life <= 0 || body.pos.y < -60) {
        this.group.remove(mesh);
        return false;
      }
      this.stepBody(body, dt, body.size * 0.8);
      const sink = body.life < 1.2 ? (1.2 - body.life) * body.size : 0;
      mesh.position.copy(body.pos).y -= sink;
      mesh.rotation.copy(body.rot);
      return true;
    });

    // Dust puffs.
    const geo = this.dustPoints.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const size = geo.getAttribute('aSize') as THREE.BufferAttribute;
    const alpha = geo.getAttribute('aAlpha') as THREE.BufferAttribute;
    const col = geo.getAttribute('aColor') as THREE.BufferAttribute;
    w = 0;
    for (const p of this.puffs) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.multiplyScalar(Math.exp(-1.6 * dt));
      p.vel.y += 0.15 * dt;
      p.pos.addScaledVector(p.vel, dt);
      this.puffs[w] = p;
      const t = 1 - p.life / p.maxLife;
      pos.setXYZ(w, p.pos.x, p.pos.y, p.pos.z);
      size.setX(w, p.size * (0.5 + t * 1.6));
      alpha.setX(w, Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * (1 - t) * 0.55);
      col.setXYZ(w, p.color.r, p.color.g, p.color.b);
      w++;
    }
    this.puffs.length = w;
    geo.setDrawRange(0, w);
    pos.needsUpdate = size.needsUpdate = alpha.needsUpdate = col.needsUpdate = true;
  }
}

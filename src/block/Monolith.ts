// The Monolith: a large natural boulder at the heart of the island. It never disappears;
// each break rolls loot, knocks a chunk out of it, and the rock slowly re-forms.

import * as THREE from 'three';
import { PHASES, phaseIndexForBreaks, type PhaseDef, type PhaseLook } from '../data/phases';
import { makeTriplanarMaterial, setTriLayers, type TriLayer } from '../render/triplanar';
import { makeRockGeometry } from '../world/rocks';
import type { Collider } from '../world/Physics';

// Ashima/stegu 3D simplex noise (MIT).
const SNOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

const VARYINGS = /* glsl */ `
  uniform vec3 uChipPos;
  uniform float uChipAmount;
  uniform float uChipRadius;
  varying float vChip;
`;

export function layersFromLook(look: PhaseLook): { base: TriLayer; top?: TriLayer & { amount: number; threshold: number } } {
  return { base: { ...look.base, normalStrength: 1.3 }, top: look.top ? { ...look.top, normalStrength: 1.1 } : undefined };
}

export class Monolith {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly collider: Collider;
  /** Top of the rock in world space. */
  readonly topY: number;
  private readonly uniforms = {
    uVeinColor: { value: new THREE.Color() },
    uVeinIntensity: { value: 2 },
    uChipPos: { value: new THREE.Vector3(0, 10, 0) },
    uChipAmount: { value: 0 },
    uChipRadius: { value: 0.42 },
    uHit: { value: 0 },
    uTime: { value: 0 },
  };
  private readonly light: THREE.PointLight;
  private breaks = 0;
  private phaseIndex = -1;
  private elapsed = 0;
  private readonly basePos = new THREE.Vector3();
  /** Fired when the phase look changes, so debris can match. */
  onPhaseLook: ((look: PhaseLook) => void) | null = null;

  constructor(groundY: number) {
    const geo = makeRockGeometry(1337, {
      detail: 26,
      scale: { x: 1.12, y: 1.55, z: 0.95 },
      lumpiness: 0.36,
      roughness: 0.05,
      cuts: 16,
      flattenBelow: -0.5,
    });
    const first = layersFromLook(PHASES[0].look);
    this.material = makeTriplanarMaterial({
      base: first.base,
      top: first.top ?? { ...first.base, amount: 0 },
      roughness: 1,
      extend: {
        uniforms: this.uniforms,
        vertexHeader: VARYINGS,
        fragmentHeader: `${VARYINGS}\n${SNOISE}\nuniform vec3 uVeinColor;\nuniform float uVeinIntensity;\nuniform float uHit;\nuniform float uTime;`,
        vertexBody: /* glsl */ `
          float chipD = distance(position, uChipPos);
          vChip = (1.0 - smoothstep(0.0, uChipRadius, chipD)) * uChipAmount;
          transformed -= normal * vChip * 0.3;
        `,
        fragmentBody: /* glsl */ `
          float vn = snoise(vObjPos * 1.3) + 0.45 * snoise(vObjPos * 3.4 + 3.1) + 0.15 * snoise(vObjPos * 9.0);
          float patchMask = smoothstep(0.0, 0.45, snoise(vObjPos * 0.7 + 11.0));
          float core = (1.0 - smoothstep(0.0, 0.022, abs(vn))) * patchMask;
          float halo = (1.0 - smoothstep(0.0, 0.12, abs(vn))) * patchMask;
          float pulse = 0.7 + 0.3 * sin(uTime * 1.4 + vObjPos.y * 2.3);
          diffuseColor.rgb *= 1.0 - halo * 0.45;
          totalEmissiveRadiance += uVeinColor * (core + halo * 0.12) * uVeinIntensity * pulse * (1.0 + uHit * 2.5);
          // The freshly broken spot glows hot while it re-forms.
          totalEmissiveRadiance += uVeinColor * smoothstep(0.15, 0.9, vChip) * (1.5 + uHit * 3.0);
        `,
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const box = geo.boundingBox!;
    this.basePos.set(0, groundY - box.min.y - 0.28, 0);
    this.mesh.position.copy(this.basePos);
    this.topY = this.basePos.y + box.max.y;
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    this.collider = { kind: 'cylinder', x: 0, z: 0, r: radius * 0.86, y0: groundY - 2, y1: this.topY };

    this.light = new THREE.PointLight(0xffffff, 1, 11, 2);
    this.light.position.set(0, box.max.y * 0.3, 0);
    this.mesh.add(this.light);
    this.applyPhase();
  }

  get totalBreaks(): number {
    return this.breaks;
  }

  set totalBreaks(n: number) {
    this.breaks = Math.max(0, Math.floor(n));
    this.applyPhase();
  }

  get phase(): PhaseDef {
    return PHASES[this.phaseIndex];
  }

  get phaseNumber(): number {
    return this.phaseIndex;
  }

  get phaseProgress(): { done: number; needed: number; frac: number; next: PhaseDef | null } {
    const cur = PHASES[this.phaseIndex];
    const next = PHASES[this.phaseIndex + 1] ?? null;
    if (!next) return { done: this.breaks - cur.startsAt, needed: 0, frac: 1, next: null };
    const done = this.breaks - cur.startsAt;
    const needed = next.startsAt - cur.startsAt;
    return { done, needed, frac: done / needed, next };
  }

  /** A hit landed (not yet broken). Flashes the veins. */
  hit(): void {
    this.uniforms.uHit.value = 1;
  }

  /** The Monolith broke at a world-space point. Returns true if this entered a new phase. */
  registerBreak(point: THREE.Vector3): boolean {
    this.breaks++;
    this.uniforms.uHit.value = 1;
    this.uniforms.uChipAmount.value = 1;
    this.uniforms.uChipPos.value.copy(this.mesh.worldToLocal(point.clone()));
    const before = this.phaseIndex;
    this.applyPhase();
    return this.phaseIndex !== before;
  }

  private applyPhase(): void {
    const idx = phaseIndexForBreaks(this.breaks);
    if (idx === this.phaseIndex) return;
    this.phaseIndex = idx;
    const look = PHASES[idx].look;
    const layers = layersFromLook(look);
    setTriLayers(this.material, layers.base, layers.top);
    this.uniforms.uVeinColor.value.set(look.veinColor);
    this.uniforms.uVeinIntensity.value = look.veinIntensity;
    this.light.color.set(look.veinColor);
    this.onPhaseLook?.(look);
  }

  /** `mining` is 0..1 while being mined; `daylight` 0..1 makes the glow matter more at night. */
  update(dt: number, mining: number, daylight: number): void {
    this.elapsed += dt;
    const u = this.uniforms;
    u.uTime.value = this.elapsed;
    u.uHit.value = Math.max(0, u.uHit.value - dt * 3.5);
    // Re-forms over ~1.6 seconds, easing out.
    u.uChipAmount.value = Math.max(0, u.uChipAmount.value - dt * 0.62);
    const pulse = 0.75 + Math.sin(this.elapsed * 1.4) * 0.25;
    this.light.intensity = (0.8 + (1 - daylight) * 7) * pulse * (1 + u.uHit.value * 1.5) + mining * 2;
    if (mining > 0) {
      const j = 0.01 * mining;
      this.mesh.position.set(this.basePos.x + (Math.random() - 0.5) * j, this.basePos.y, this.basePos.z + (Math.random() - 0.5) * j);
    } else {
      this.mesh.position.copy(this.basePos);
    }
  }
}

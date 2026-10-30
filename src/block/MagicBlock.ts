// The Last Block: sits at grid (0,0,0), never disappears, and rolls loot each time it breaks.

import * as THREE from 'three';
import { PHASES, phaseIndexForBreaks, type PhaseDef } from '../data/phases';
import { getMagicTextures } from '../world/textures';

export const MAGIC_POS = { x: 0, y: 0, z: 0 } as const;

export class MagicBlock {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private breaks = 0;
  private phaseIndex = -1;
  /** 0..1 squash/pop animation timer after a break. */
  private pop = 1;
  private elapsed = 0;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, emissiveIntensity: 1 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.material);
    this.mesh.position.set(MAGIC_POS.x + 0.5, MAGIC_POS.y + 0.5, MAGIC_POS.z + 0.5);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.light = new THREE.PointLight(0xffffff, 0.8, 6, 2);
    this.light.position.set(0, 0.2, 0);
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

  /** Progress through the current phase: { done, needed, frac }. needed = 0 in the final phase. */
  get phaseProgress(): { done: number; needed: number; frac: number; next: PhaseDef | null } {
    const cur = PHASES[this.phaseIndex];
    const next = PHASES[this.phaseIndex + 1] ?? null;
    if (!next) return { done: this.breaks - cur.startsAt, needed: 0, frac: 1, next: null };
    const done = this.breaks - cur.startsAt;
    const needed = next.startsAt - cur.startsAt;
    return { done, needed, frac: done / needed, next };
  }

  /** Registers a break. Returns true if this break moved the block into a new phase. */
  registerBreak(): boolean {
    this.breaks++;
    this.pop = 0;
    const before = this.phaseIndex;
    this.applyPhase();
    return this.phaseIndex !== before;
  }

  private applyPhase(): void {
    const idx = phaseIndexForBreaks(this.breaks);
    if (idx === this.phaseIndex) return;
    this.phaseIndex = idx;
    const { map, emissive } = getMagicTextures(PHASES[idx]);
    this.material.map = map;
    this.material.emissiveMap = emissive;
    this.material.emissive.set(0xffffff);
    this.material.needsUpdate = true;
    this.light.color.set(PHASES[idx].palette.glow);
  }

  /** `mining` is 0..1 while the player is mining it (makes it tremble). */
  update(dt: number, mining: number): void {
    this.elapsed += dt;
    const pulse = 0.55 + Math.sin(this.elapsed * 2.2) * 0.25;
    this.material.emissiveIntensity = pulse + mining * 0.8;
    this.light.intensity = 0.5 + pulse * 0.6 + mining;

    this.pop = Math.min(1, this.pop + dt * 4);
    // Squash, then overshoot back to full size.
    const p = this.pop;
    const s = p < 1 ? 0.75 + 0.25 * (1 - Math.cos(p * Math.PI * 1.5) * (1 - p)) : 1;
    this.mesh.scale.setScalar(s);
    if (mining > 0) {
      const j = 0.015 * mining;
      this.mesh.position.set(0.5 + (Math.random() - 0.5) * j, 0.5 + (Math.random() - 0.5) * j, 0.5 + (Math.random() - 0.5) * j);
    } else {
      this.mesh.position.set(0.5, 0.5, 0.5);
    }
  }
}

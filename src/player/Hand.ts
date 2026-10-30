// The held item, shown in the lower right of the view. Swings when mining, bobs while walking
// and lags slightly behind mouse movement. Hands and proper tools arrive in a later stage.

import * as THREE from 'three';
import type { ItemId } from '../data/items';
import { makeItemModel } from '../items/itemModels';

const REST = new THREE.Vector3(0.3, -0.27, -0.52);

export class Hand {
  readonly root = new THREE.Group();
  private current: ItemId | null | undefined = undefined;
  private model: THREE.Object3D | null = null;
  private swing = 1;
  private mining = false;
  private t = 0;
  private sway = new THREE.Vector2();
  private equip = 1;

  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.root.position.copy(REST);
  }

  setItem(id: ItemId | null): void {
    if (id === this.current) return;
    this.current = id;
    if (this.model) this.root.remove(this.model);
    this.model = null;
    if (id) {
      this.model = makeItemModel(id);
      this.model.scale.setScalar(0.16);
      this.model.rotation.set(0.25, -0.6, 0.1);
      this.model.traverse((o) => (o.castShadow = false));
      this.root.add(this.model);
    }
    this.equip = 0;
  }

  triggerSwing(): void {
    if (this.swing >= 0.5) this.swing = 0;
  }

  setMining(m: boolean): void {
    this.mining = m;
  }

  /** `moving` 0..1 walk amount; `look` is this frame's mouse delta for sway. */
  update(dt: number, moving: number, lookDX: number, lookDY: number): void {
    this.t += dt;
    if (this.mining && this.swing >= 1) this.swing = 0;
    this.swing = Math.min(1, this.swing + dt * 3.2);
    this.equip = Math.min(1, this.equip + dt * 4);
    // Sway lags behind the view.
    this.sway.x += (THREE.MathUtils.clamp(-lookDX * 0.0006, -0.04, 0.04) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(lookDY * 0.0006, -0.04, 0.04) - this.sway.y) * Math.min(1, dt * 10);

    // Wind-up then a fast strike forward.
    const p = this.swing;
    const strike = p < 0.35 ? -Math.sin((p / 0.35) * Math.PI * 0.5) * 0.4 : Math.sin(((p - 0.35) / 0.65) * Math.PI);
    const bobX = Math.sin(this.t * 7.5) * 0.012 * moving;
    const bobY = Math.abs(Math.cos(this.t * 7.5)) * 0.016 * moving;
    const drop = (1 - this.equip) * 0.25;
    this.root.position.set(REST.x + bobX + this.sway.x - strike * 0.1, REST.y + bobY + this.sway.y - strike * 0.05 - drop, REST.z - strike * 0.14);
    this.root.rotation.set(-strike * 0.9, strike * 0.25, strike * 0.2);
  }
}

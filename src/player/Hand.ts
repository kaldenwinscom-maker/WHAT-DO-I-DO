// The held item, drawn in the lower-right of the view. Swings when mining or placing.

import * as THREE from 'three';
import { ITEMS, type ItemId } from '../data/items';
import { blockMaterials } from '../world/World';
import { itemIconCanvas } from '../ui/icons';

export class Hand {
  readonly root = new THREE.Group();
  private current: ItemId | null | undefined = undefined;
  private model: THREE.Object3D | null = null;
  private swing = 1;
  private mining = false;
  private t = 0;
  private readonly cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly fist: THREE.Mesh;

  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.root.position.set(0.36, -0.3, -0.58);
    // A simple gloved fist for when nothing is held.
    this.fist = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x6a5240, roughness: 1 }),
    );
    this.fist.rotation.set(0.2, -0.25, 0);
  }

  setItem(id: ItemId | null): void {
    if (id === this.current) return;
    this.current = id;
    if (this.model) this.root.remove(this.model);
    if (!id) {
      this.model = this.fist;
    } else {
      const def = ITEMS[id];
      if (def.places) {
        const m = new THREE.Mesh(this.cubeGeo, blockMaterials(def.places));
        m.scale.setScalar(0.15);
        m.rotation.set(0.15, 0.7, 0);
        this.model = m;
      } else {
        const tex = new THREE.CanvasTexture(itemIconCanvas(id));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.24, 0.24),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, fog: false }),
        );
        m.rotation.set(0, -0.4, 0.15);
        this.model = m;
      }
    }
    this.root.add(this.model);
    this.swing = 0.6; // little "equip" bob
  }

  triggerSwing(): void {
    if (this.swing >= 0.5) this.swing = 0;
  }

  setMining(m: boolean): void {
    this.mining = m;
  }

  update(dt: number, moving: number): void {
    this.t += dt;
    if (this.mining && this.swing >= 1) this.swing = 0;
    this.swing = Math.min(1, this.swing + dt * 4);
    const s = Math.sin(this.swing * Math.PI);
    const bobX = Math.sin(this.t * 7) * 0.012 * moving;
    const bobY = Math.abs(Math.cos(this.t * 7)) * 0.014 * moving;
    this.root.position.set(0.36 + bobX - s * 0.12, -0.3 + bobY - s * 0.06, -0.58 - s * 0.12);
    this.root.rotation.set(-s * 0.9, s * 0.3, 0);
  }
}

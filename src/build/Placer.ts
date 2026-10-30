// Placement mode: a translucent ghost of the structure follows your aim; blue = can place,
// red = can't. R (or the mouse wheel) rotates. Left click places, right click cancels.

import * as THREE from 'three';
import type { StructureId } from '../data/structures';
import { makeStructureModel } from './structureModels';
import type { Structures } from './Structures';

const REACH = 7;
const ROT_STEP = Math.PI / 8;

export interface PlaceRequest {
  type: StructureId;
  /** Shown in the hint while placing. */
  label: string;
  onPlace(x: number, y: number, z: number, rot: number): void;
}

export class Placer {
  readonly group = new THREE.Group();
  request: PlaceRequest | null = null;
  valid = false;
  reason = '';
  private ghost: THREE.Object3D | null = null;
  private rot = 0;
  private readonly pos = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ghostMat = new THREE.MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: 0.38, depthWrite: false });
  private readonly edgeMat = new THREE.LineBasicMaterial({ color: 0x9ccaff, transparent: true, opacity: 0.6 });

  constructor(
    private readonly structures: Structures,
    private readonly terrainMeshes: THREE.Object3D[],
    private readonly terrainHeight: (x: number, z: number) => number | null,
  ) {}

  get active(): boolean {
    return this.request !== null;
  }

  start(req: PlaceRequest, initialRot: number): void {
    this.cancel();
    this.request = req;
    this.rot = initialRot;
    const model = makeStructureModel(req.type);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = this.ghostMat;
        m.castShadow = m.receiveShadow = false;
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), this.edgeMat));
      }
    });
    this.ghost = model;
    this.group.add(model);
  }

  cancel(): void {
    if (this.ghost) this.group.remove(this.ghost);
    this.ghost = null;
    this.request = null;
  }

  rotate(steps: number): void {
    this.rot += steps * ROT_STEP;
  }

  update(camera: THREE.Camera, player: { x: number; z: number; r: number }): void {
    if (!this.request || !this.ghost) return;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    this.raycaster.set(camera.position, dir);
    this.raycaster.far = REACH;
    const hit = this.raycaster.intersectObjects(this.terrainMeshes, false)[0];
    if (hit) this.pos.copy(hit.point);
    else {
      // Aiming past the edge: hold the ghost out in front so you can see why it's invalid.
      this.pos.copy(camera.position).addScaledVector(dir.setY(0).normalize(), 3);
      this.pos.y = (this.terrainHeight(this.pos.x, this.pos.z) ?? camera.position.y - 1.6);
    }
    // Snap to a 25 cm grid so rows of structures line up.
    this.pos.x = Math.round(this.pos.x * 4) / 4;
    this.pos.z = Math.round(this.pos.z * 4) / 4;
    const res = this.structures.check(this.request.type, this.pos.x, this.pos.z, this.rot, this.terrainHeight, player);
    this.valid = !!hit && res.ok;
    this.reason = hit ? (res.reason ?? '') : 'Needs solid ground';
    this.pos.y = res.y;
    this.ghost.position.copy(this.pos);
    this.ghost.rotation.y = this.rot;
    const color = this.valid ? 0x5aa0ff : 0xff5040;
    this.ghostMat.color.setHex(color);
    this.edgeMat.color.setHex(this.valid ? 0x9ccaff : 0xff8a70);
  }

  /** Place if valid. Returns true when placed. */
  confirm(): boolean {
    if (!this.request || !this.valid) return false;
    const req = this.request;
    const { x, y, z } = this.pos;
    const rot = this.rot;
    this.cancel();
    req.onPlace(x, y, z, rot);
    return true;
  }
}

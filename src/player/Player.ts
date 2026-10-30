// First-person controller: mouse look, walking, sprinting, jumping, crouching and voxel collision.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { World } from '../world/World';
import type { Input } from './Input';

const P = CONFIG.player;
const EPS = 1e-4;
const CROUCH_SPEED = 1.9;
const CROUCH_EYE_DROP = 0.28;

type Axis = 'x' | 'y' | 'z';

export class Player {
  /** Feet position (center of the bottom of the bounding box). */
  readonly position = new THREE.Vector3(0.5, 1, 0.5);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.35;
  onGround = false;
  crouching = false;
  sprinting = false;
  mouseSensitivity: number = P.mouseSensitivity;
  private bobTime = 0;
  private eyeOffset = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  get eyePosition(): THREE.Vector3 {
    return this.camera.position;
  }

  lookDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldDirection(out);
  }

  knock(v: THREE.Vector3): void {
    this.velocity.copy(v);
    this.onGround = false;
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  /** Does the player's box overlap the given block cell? */
  overlapsBlock(bx: number, by: number, bz: number): boolean {
    const hw = P.width / 2;
    const p = this.position;
    return (
      p.x + hw > bx && p.x - hw < bx + 1 && p.y + P.height > by && p.y < by + 1 && p.z + hw > bz && p.z - hw < bz + 1
    );
  }

  update(dt: number, input: Input | null, world: World): void {
    // ---- intent ----
    let fx = 0;
    let fz = 0;
    let jump = false;
    if (input) {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) fz += 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) fz -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) fx += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) fx -= 1;
      jump = input.isDown('Space');
      this.crouching = input.isDown('AltLeft') || input.isDown('AltRight') || input.isDown('KeyZ');
      this.sprinting = !this.crouching && fz > 0 && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    } else {
      this.crouching = this.sprinting = false;
    }

    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? P.sprintSpeed : P.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward is -Z rotated by yaw.
    let wx = -sin * fz + cos * fx;
    let wz = -cos * fz - sin * fx;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }

    // ---- horizontal velocity ----
    if (this.onGround) {
      const k = 1 - Math.exp(-18 * dt);
      this.velocity.x += (wx - this.velocity.x) * k;
      this.velocity.z += (wz - this.velocity.z) * k;
    } else if (len > 0) {
      // Weak air control so knockback carries you.
      const k = 1 - Math.exp(-2.5 * dt);
      this.velocity.x += (wx - this.velocity.x) * k;
      this.velocity.z += (wz - this.velocity.z) * k;
    }

    // ---- vertical ----
    if (jump && this.onGround) {
      this.velocity.y = P.jumpVelocity;
      this.onGround = false;
    }
    this.velocity.y = Math.max(-P.maxFallSpeed, this.velocity.y - P.gravity * dt);

    // ---- integrate with collision, in substeps to avoid tunnelling ----
    const maxStep = 0.35;
    const travel = Math.max(Math.abs(this.velocity.x), Math.abs(this.velocity.y), Math.abs(this.velocity.z)) * dt;
    const steps = Math.max(1, Math.ceil(travel / maxStep));
    const sdt = dt / steps;
    const wasOnGround = this.onGround;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('y', this.velocity.y * sdt, world);
      const guard = this.crouching && (wasOnGround || this.onGround);
      this.moveHorizontal('x', this.velocity.x * sdt, world, guard);
      this.moveHorizontal('z', this.velocity.z * sdt, world, guard);
    }

    // ---- camera ----
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horizSpeed > 0.5) this.bobTime += dt * horizSpeed * 1.9;
    const bob = this.onGround ? Math.sin(this.bobTime) * 0.04 * Math.min(1, horizSpeed / P.walkSpeed) : 0;
    const targetEye = this.crouching ? CROUCH_EYE_DROP : 0;
    this.eyeOffset += (targetEye - this.eyeOffset) * (1 - Math.exp(-14 * dt));
    this.camera.position.set(this.position.x, this.position.y + P.eyeHeight - this.eyeOffset + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const targetFov = this.sprinting && horizSpeed > P.walkSpeed ? 82 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-8 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private moveHorizontal(axis: 'x' | 'z', d: number, world: World, edgeGuard: boolean): void {
    if (d === 0) return;
    const before = this.position[axis];
    this.moveAxis(axis, d, world);
    if (edgeGuard && !this.hasSupport(world)) {
      this.position[axis] = before;
      this.velocity[axis] = 0;
    }
  }

  /** Is there any block directly beneath the player's footprint? */
  private hasSupport(world: World): boolean {
    const hw = P.width / 2 - 0.05;
    const y = Math.floor(this.position.y - 0.05);
    const p = this.position;
    for (const [ox, oz] of [
      [-hw, -hw],
      [hw, -hw],
      [-hw, hw],
      [hw, hw],
    ]) {
      if (world.isSolid(Math.floor(p.x + ox), y, Math.floor(p.z + oz))) return true;
    }
    return false;
  }

  private moveAxis(axis: Axis, d: number, world: World): void {
    if (d === 0) return;
    this.position[axis] += d;
    const hw = P.width / 2;
    const p = this.position;
    const minX = Math.floor(p.x - hw + EPS);
    const maxX = Math.floor(p.x + hw - EPS);
    const minY = Math.floor(p.y + EPS);
    const maxY = Math.floor(p.y + P.height - EPS);
    const minZ = Math.floor(p.z - hw + EPS);
    const maxZ = Math.floor(p.z + hw - EPS);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!world.isSolid(x, y, z)) continue;
          if (axis === 'y') {
            if (d > 0) p.y = y - P.height - EPS;
            else {
              p.y = y + 1 + EPS;
              this.onGround = true;
            }
            this.velocity.y = 0;
          } else if (axis === 'x') {
            p.x = d > 0 ? x - hw - EPS : x + 1 + hw + EPS;
            this.velocity.x = 0;
          } else {
            p.z = d > 0 ? z - hw - EPS : z + 1 + hw + EPS;
            this.velocity.z = 0;
          }
          return;
        }
      }
    }
  }
}

// First-person controller: mouse look, walking, sprinting, jumping, crouching, collision
// against the terrain and colliders, and camera shake.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Physics } from '../world/Physics';
import type { Input } from './Input';

const P = CONFIG.player;
const CROUCH_SPEED = 1.9;
const CROUCH_EYE_DROP = 0.32;

export class Player {
  /** Feet position (centre of the bottom of the body). */
  readonly position = new THREE.Vector3(0, 1, 0);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.2;
  onGround = false;
  crouching = false;
  sprinting = false;
  mouseSensitivity: number = P.mouseSensitivity;
  /** Set by the survival system: out of stamina means no sprinting or jumping. */
  allowSprint = true;
  allowJump = true;
  /** True on the frame a jump started. */
  jumped = false;
  /** Downward speed at the last landing (m/s), consumed by fall damage. Reset by the reader. */
  landingSpeed = 0;
  private bobTime = 0;
  private eyeOffset = 0;
  private trauma = 0;
  private shakeTime = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  lookDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return this.camera.getWorldDirection(out);
  }

  /** Add camera shake (0..1; it stacks and decays). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  knock(v: THREE.Vector3): void {
    this.velocity.copy(v);
    this.onGround = false;
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  update(dt: number, input: Input | null, physics: Physics): void {
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
      this.sprinting = this.allowSprint && !this.crouching && fz > 0 && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    } else {
      this.crouching = this.sprinting = false;
    }

    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? P.sprintSpeed : P.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fz + cos * fx;
    let wz = -cos * fz - sin * fx;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }

    if (this.onGround) {
      const k = 1 - Math.exp(-16 * dt);
      this.velocity.x += (wx - this.velocity.x) * k;
      this.velocity.z += (wz - this.velocity.z) * k;
    } else if (len > 0) {
      // Weak air control so knockback carries you.
      const k = 1 - Math.exp(-2.5 * dt);
      this.velocity.x += (wx - this.velocity.x) * k;
      this.velocity.z += (wz - this.velocity.z) * k;
    }

    this.jumped = false;
    if (jump && this.onGround && this.allowJump) {
      this.velocity.y = P.jumpVelocity;
      this.onGround = false;
      this.jumped = true;
    }
    this.velocity.y = Math.max(-P.maxFallSpeed, this.velocity.y - P.gravity * dt);

    // ---- integrate in substeps ----
    const travel = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.25));
    const sdt = dt / steps;
    const wasOnGround = this.onGround;
    for (let i = 0; i < steps; i++) this.substep(sdt, physics, this.crouching && wasOnGround);

    // ---- camera ----
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && horiz > 0.5) this.bobTime += dt * horiz * 1.8;
    const bob = this.onGround ? Math.sin(this.bobTime) * 0.035 * Math.min(1, horiz / P.walkSpeed) : 0;
    const targetEye = this.crouching ? CROUCH_EYE_DROP : 0;
    this.eyeOffset += (targetEye - this.eyeOffset) * (1 - Math.exp(-14 * dt));

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeTime += dt;
    const sh = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.shakeTime * f + o) * 0.6 + Math.sin(this.shakeTime * f * 2.3 + o * 3) * 0.4;
    this.camera.position.set(
      this.position.x + n(31, 1) * sh * 0.05,
      this.position.y + P.eyeHeight - this.eyeOffset + bob + n(37, 2) * sh * 0.05,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch + n(29, 3) * sh * 0.05, this.yaw + n(23, 4) * sh * 0.05, n(19, 5) * sh * 0.07);

    const targetFov = this.sprinting && horiz > P.walkSpeed ? 80 : 74;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-8 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private substep(dt: number, physics: Physics, edgeGuard: boolean): void {
    const p = this.position;
    const before = p.clone();

    // Horizontal.
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    physics.resolveHorizontal(p, P.radius, P.height, P.stepHeight);
    if (edgeGuard) {
      const g = physics.groundHeight(p.x, p.z, P.radius * 0.6, p.y + P.stepHeight);
      if (g < p.y - 0.6) {
        p.x = before.x;
        p.z = before.z;
        this.velocity.x = this.velocity.z = 0;
      }
    }

    // Vertical.
    p.y += this.velocity.y * dt;
    if (this.velocity.y > 0) {
      const ceil = physics.ceilingHeight(p.x, p.z, P.radius, before.y + P.height - 0.01);
      if (p.y + P.height > ceil) {
        p.y = ceil - P.height;
        this.velocity.y = 0;
      }
    }
    const ground = physics.groundHeight(p.x, p.z, P.radius, Math.max(p.y, before.y) + P.stepHeight);
    // Snap down onto ground we were already standing on (walking down slopes).
    const snap = this.onGround && this.velocity.y <= 0 ? 0.3 : 0;
    if (ground > -Infinity && p.y <= ground + snap) {
      if (!this.onGround && this.velocity.y < 0) this.landingSpeed = Math.max(this.landingSpeed, -this.velocity.y);
      p.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}

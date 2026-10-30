// Hooks for things that happen at night. Nothing threatening is registered yet; this is
// where night enemies, storms or raids will plug in later.
//
// To add one, push an object into NIGHT_EVENTS, for example:
//
//   NIGHT_EVENTS.push({
//     id: 'wolves',
//     onNightStart: (ctx) => { if (ctx.day >= 3) ctx.toast('You hear howling…', ''); },
//     onNightUpdate: (ctx, dt) => { /* spawn wolves away from torches */ },
//     onDawn: (ctx) => { /* survivors retreat */ },
//   });

import type * as THREE from 'three';

export interface NightContext {
  /** Current day number (the night belongs to this day). */
  day: number;
  /** 0..1 how far through the night we are. */
  progress: number;
  playerPosition: THREE.Vector3;
  /** Show a message on screen. */
  toast(title: string, detail: string): void;
  /** Hurt the player (cause is shown on the game over screen if it kills them). */
  damagePlayer(amount: number, cause: string): void;
}

export interface NightEvent {
  id: string;
  onNightStart?(ctx: NightContext): void;
  onNightUpdate?(ctx: NightContext, dt: number): void;
  onDawn?(ctx: NightContext): void;
}

export const NIGHT_EVENTS: NightEvent[] = [];

export class NightEvents {
  private active = false;

  /** Call every frame with the clock's night state. */
  update(isNight: boolean, ctx: NightContext, dt: number): void {
    if (isNight && !this.active) {
      this.active = true;
      for (const e of NIGHT_EVENTS) e.onNightStart?.(ctx);
    } else if (!isNight && this.active) {
      this.active = false;
      for (const e of NIGHT_EVENTS) e.onDawn?.(ctx);
    }
    if (this.active) for (const e of NIGHT_EVENTS) e.onNightUpdate?.(ctx, dt);
  }

  /** After loading a save, sync without firing start events. */
  sync(isNight: boolean): void {
    this.active = isNight;
  }
}

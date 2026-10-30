// Health, hunger, stamina and sickness. Rates live in CONFIG.survival.

import { CONFIG } from '../config';
import type { FoodStats } from '../data/items';

const S = CONFIG.survival;

export interface SurvivalState {
  health: number;
  hunger: number;
  stamina: number;
  sickSeconds: number;
}

export class Survival {
  health: number = S.maxHealth;
  hunger: number = S.maxHunger;
  stamina: number = S.maxStamina;
  /** Seconds of food poisoning left. */
  sickSeconds = 0;
  dead = false;
  causeOfDeath = '';
  /** Called once when health reaches 0. */
  onDeath: ((cause: string) => void) | null = null;
  /** Called whenever damage is taken (for screen flashes). */
  onDamage: ((amount: number, cause: string) => void) | null = null;
  private staminaCooldown = 0;
  private starvingCause = 'Starved to death';

  get sick(): boolean {
    return this.sickSeconds > 0;
  }

  get starving(): boolean {
    return this.hunger <= 0;
  }

  get canSprint(): boolean {
    return this.stamina > S.staminaMinToAct * 0.5;
  }

  get canJump(): boolean {
    return this.stamina >= S.staminaMinToAct;
  }

  useStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaCooldown = S.staminaRegenDelay;
  }

  damage(amount: number, cause: string): void {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.onDamage?.(amount, cause);
    if (this.health <= 0) {
      this.dead = true;
      this.causeOfDeath = cause;
      this.onDeath?.(cause);
    }
  }

  /** Eat something. Returns whether it made you sick. */
  eat(food: FoodStats): boolean {
    this.hunger = Math.min(S.maxHunger, this.hunger + food.hunger);
    if (food.health) this.health = Math.min(S.maxHealth, this.health + food.health);
    if (food.sickChance && Math.random() < food.sickChance) {
      this.sickSeconds = Math.max(this.sickSeconds, S.sickness.durationSeconds);
      return true;
    }
    return false;
  }

  update(dt: number, ctx: { sprinting: boolean; mining: boolean; isNight: boolean }): void {
    if (this.dead) return;
    const min = dt / 60;

    // Hunger: faster when cold (night) or sick.
    let drain = S.hungerDrainPerMinute * min;
    if (ctx.isNight) drain *= S.nightHungerMultiplier;
    if (this.sick) drain *= S.sickness.hungerDrainMultiplier;
    this.hunger = Math.max(0, this.hunger - drain);

    // Stamina.
    if (ctx.sprinting) this.useStamina(S.sprintStaminaPerSecond * dt);
    if (ctx.mining) this.useStamina(S.miningStaminaPerSecond * dt);
    if (this.staminaCooldown > 0) this.staminaCooldown -= dt;
    else {
      const regen = S.staminaRegenPerSecond * (ctx.isNight ? S.nightStaminaRegenMultiplier : 1) * (this.starving ? 0.4 : 1);
      this.stamina = Math.min(S.maxStamina, this.stamina + regen * dt);
    }

    // Sickness.
    if (this.sick) {
      this.sickSeconds = Math.max(0, this.sickSeconds - dt);
      this.damage(S.sickness.damagePerMinute * min, 'Died of food poisoning');
    }

    // Health: starve, or slowly heal when well fed.
    if (this.starving) this.damage(S.starvingDamagePerMinute * min, this.starvingCause);
    else if (this.hunger > S.regenHungerThreshold && !this.sick) {
      this.health = Math.min(S.maxHealth, this.health + S.regenPerMinute * min);
    }
  }

  reset(): void {
    this.health = S.maxHealth;
    this.hunger = S.maxHunger;
    this.stamina = S.maxStamina;
    this.sickSeconds = 0;
    this.dead = false;
    this.causeOfDeath = '';
  }

  serialize(): SurvivalState {
    return { health: this.health, hunger: this.hunger, stamina: this.stamina, sickSeconds: this.sickSeconds };
  }

  load(s: SurvivalState): void {
    this.health = Math.max(1, Math.min(S.maxHealth, s.health));
    this.hunger = Math.max(0, Math.min(S.maxHunger, s.hunger));
    this.stamina = Math.max(0, Math.min(S.maxStamina, s.stamina));
    this.sickSeconds = Math.max(0, s.sickSeconds ?? 0);
    this.dead = false;
  }
}

// Bad / weird loot events. Each returns a short message for the pop-up.
// Tune their strength in EVENT_SETTINGS (src/data/loot.ts).

import * as THREE from 'three';
import { EVENT_SETTINGS, type LootEventId } from '../data/loot';
import { ITEMS, type ItemId } from '../data/items';
import type { Inventory } from '../inventory/Inventory';

export interface EventContext {
  inventory: Inventory;
  playerPosition: THREE.Vector3;
  /** Centre of the Monolith, the source of bursts. */
  monolithPosition: THREE.Vector3;
  knockPlayer(velocity: THREE.Vector3): void;
  /**
   * Break away up to `count` pieces from the edge of the base, never the ground under the
   * player. Returns how many actually broke.
   */
  crumbleEdge(count: number): number;
}

export interface EventOutcome {
  title: string;
  detail: string;
  sound: 'boom' | 'rot' | 'crumble' | 'dud';
}

/** Bad / neutral events. ('blueprint' is a good find and is handled by the game directly.) */
export function runLootEvent(event: Exclude<LootEventId, 'blueprint'>, ctx: EventContext): EventOutcome {
  switch (event) {
    case 'burst':
      return burst(ctx);
    case 'rot':
      return rot(ctx);
    case 'crumble':
      return crumble(ctx);
    case 'dud':
      return { title: 'Dud', detail: 'Nothing but dust.', sound: 'dud' };
  }
}

function burst(ctx: EventContext): EventOutcome {
  const s = EVENT_SETTINGS.burst;
  const dir = new THREE.Vector3(ctx.playerPosition.x - ctx.monolithPosition.x, 0, ctx.playerPosition.z - ctx.monolithPosition.z);
  if (dir.lengthSq() < 0.01) {
    const a = Math.random() * Math.PI * 2;
    dir.set(Math.cos(a), 0, Math.sin(a));
  }
  dir.normalize().multiplyScalar(s.horizontalForce);
  dir.y = s.upwardForce;
  ctx.knockPlayer(dir);
  return { title: 'Unstable Burst!', detail: 'The Monolith lashes out and throws you back.', sound: 'boom' };
}

function rot(ctx: EventContext): EventOutcome {
  const inv = ctx.inventory;
  const perishable: number[] = [];
  inv.slots.forEach((s, i) => {
    if (s && ITEMS[s.item].perishable) perishable.push(i);
  });
  if (perishable.length === 0) {
    return { title: 'Foul Air', detail: 'A rotten smell passes. Nothing of yours spoiled… this time.', sound: 'rot' };
  }
  const lost = new Map<ItemId, number>();
  let budget = 1 + Math.floor(Math.random() * EVENT_SETTINGS.rot.maxItemsRotted);
  while (budget > 0 && perishable.length > 0) {
    const pi = Math.floor(Math.random() * perishable.length);
    const slot = perishable[pi];
    const taken = inv.takeFromSlot(slot, 1);
    if (!taken) {
      perishable.splice(pi, 1);
      continue;
    }
    lost.set(taken.item, (lost.get(taken.item) ?? 0) + 1);
    if (!inv.slots[slot]) perishable.splice(pi, 1);
    budget--;
  }
  const total = [...lost.values()].reduce((a, b) => a + b, 0);
  inv.add('rot', total);
  const list = [...lost].map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ');
  return { title: 'Rot!', detail: `${list} spoiled.`, sound: 'rot' };
}

function crumble(ctx: EventContext): EventOutcome {
  const s = EVENT_SETTINGS.crumble;
  const n = s.minBlocks + Math.floor(Math.random() * (s.maxBlocks - s.minBlocks + 1));
  const removed = ctx.crumbleEdge(n);
  if (removed === 0) {
    return { title: 'Tremor', detail: 'The island shudders. Loose rock tumbles into the void.', sound: 'crumble' };
  }
  return {
    title: 'Crumble!',
    detail: `${removed} piece${removed === 1 ? '' : 's'} of your base fell into the void.`,
    sound: 'crumble',
  };
}

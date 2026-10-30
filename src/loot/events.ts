// Bad / weird loot events. Each returns a short message for the pop-up.
// Tune their strength in EVENT_SETTINGS (src/data/loot.ts).

import * as THREE from 'three';
import { EVENT_SETTINGS, type LootEventId } from '../data/loot';
import { ITEMS, type ItemId } from '../data/items';
import type { Inventory } from '../inventory/Inventory';
import type { World } from '../world/World';

export interface EventContext {
  inventory: Inventory;
  world: World;
  playerPosition: THREE.Vector3;
  knockPlayer(velocity: THREE.Vector3): void;
  /** Visual + audio hook for blocks removed by an event. */
  onBlockRemoved(x: number, y: number, z: number): void;
}

export interface EventOutcome {
  title: string;
  detail: string;
  sound: 'boom' | 'rot' | 'crumble' | 'dud';
}

export function runLootEvent(event: LootEventId, ctx: EventContext): EventOutcome {
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
  const dir = new THREE.Vector3(ctx.playerPosition.x - 0.5, 0, ctx.playerPosition.z - 0.5);
  if (dir.lengthSq() < 0.01) {
    const a = Math.random() * Math.PI * 2;
    dir.set(Math.cos(a), 0, Math.sin(a));
  }
  dir.normalize().multiplyScalar(s.horizontalForce);
  dir.y = s.upwardForce;
  ctx.knockPlayer(dir);
  return { title: 'Unstable Burst!', detail: 'The block lashes out and throws you back.', sound: 'boom' };
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
  const p = ctx.playerPosition;
  const standX = Math.floor(p.x);
  const standZ = Math.floor(p.z);
  const candidates: [number, number, number, number][] = [];
  for (const [x, y, z, id] of ctx.world.entries()) {
    if (id === 'magic') continue;
    // Never pull the floor straight out from under the player.
    if (x === standX && z === standZ) continue;
    // Edge blocks (farther from the magic block) are more likely to crumble.
    candidates.push([x, y, z, 1 + Math.hypot(x, z)]);
  }
  if (candidates.length === 0) {
    return { title: 'Tremor', detail: 'The ground shudders. Good thing there is nothing to lose.', sound: 'crumble' };
  }
  const n = s.minBlocks + Math.floor(Math.random() * (s.maxBlocks - s.minBlocks + 1));
  let removed = 0;
  for (let i = 0; i < n && candidates.length > 0; i++) {
    const total = candidates.reduce((a, c) => a + c[3], 0);
    let r = Math.random() * total;
    let pick = 0;
    for (; pick < candidates.length - 1; pick++) {
      r -= candidates[pick][3];
      if (r <= 0) break;
    }
    const [x, y, z] = candidates.splice(pick, 1)[0];
    ctx.world.remove(x, y, z);
    ctx.onBlockRemoved(x, y, z);
    removed++;
  }
  return {
    title: 'Crumble!',
    detail: `${removed} block${removed === 1 ? '' : 's'} of your island fell into the void.`,
    sound: 'crumble',
  };
}

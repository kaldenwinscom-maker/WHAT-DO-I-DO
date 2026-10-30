// Turns the data in src/data/loot.ts into actual drops.

import { LOOT_TABLES, RARITY_ORDER, RARITY_WEIGHTS, type LootEntry, type LootTable, type Rarity } from '../data/loot';
import { PHASES } from '../data/phases';
import type { ItemId } from '../data/items';
import type { LootEventId } from '../data/loot';

export type LootResult =
  | { kind: 'items'; rarity: Rarity; items: { item: ItemId; count: number }[]; label?: string }
  | { kind: 'event'; rarity: Rarity; event: LootEventId };

function randInt(min: number, max: number, rand: () => number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pickWeighted<T extends { weight: number }>(list: T[], rand: () => number): T {
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

/** Table for a phase, falling back to the closest earlier phase that has one. */
export function tableForPhase(phaseIndex: number): LootTable {
  for (let i = phaseIndex; i >= 0; i--) {
    const t = LOOT_TABLES[PHASES[i].id];
    if (t) return t;
  }
  throw new Error('No loot table defined for the first phase.');
}

export function rollRarity(rand: () => number = Math.random): Rarity {
  const tiers = RARITY_ORDER.map((r) => ({ rarity: r, weight: RARITY_WEIGHTS[r] }));
  return pickWeighted(tiers, rand).rarity;
}

export function rollLoot(phaseIndex: number, rand: () => number = Math.random): LootResult {
  const table = tableForPhase(phaseIndex);
  let rarity = rollRarity(rand);
  let entries: LootEntry[] | undefined = table[rarity];
  // Fall back to lower tiers if this one is empty.
  let idx = RARITY_ORDER.indexOf(rarity);
  while ((!entries || entries.length === 0) && idx > 0) {
    idx--;
    rarity = RARITY_ORDER[idx];
    entries = table[rarity];
  }
  if (!entries || entries.length === 0) return { kind: 'event', rarity: 'junk', event: 'dud' };

  const e = pickWeighted(entries, rand);
  switch (e.kind) {
    case 'item':
      return { kind: 'items', rarity, items: [{ item: e.item, count: randInt(e.min, e.max, rand) }] };
    case 'bundle':
      return {
        kind: 'items',
        rarity,
        label: e.label,
        items: e.items.map((i) => ({ item: i.item, count: randInt(i.min, i.max, rand) })),
      };
    case 'event':
      return { kind: 'event', rarity, event: e.event };
  }
}

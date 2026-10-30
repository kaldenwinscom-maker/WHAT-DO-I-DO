// Loot tables for the magic block. This is the main file for rebalancing.
//
// How a roll works:
//   1. Pick a rarity tier using RARITY_WEIGHTS.
//   2. Pick one entry from that tier in the current phase's table, using each entry's `weight`.
// If a phase has no entries for the rolled tier, the roll drops down a tier until something is found.
// If a phase has no table yet, the most recent earlier phase's table is used.

import type { ItemId } from './items';
import type { PhaseId } from './phases';

export type Rarity = 'junk' | 'common' | 'uncommon' | 'rare' | 'epic';

export const RARITY_ORDER: Rarity[] = ['junk', 'common', 'uncommon', 'rare', 'epic'];

/** Relative chance of each tier (they don't need to add up to 100). */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  junk: 45,
  common: 30,
  uncommon: 15,
  rare: 8,
  epic: 2,
};

export const RARITY_COLORS: Record<Rarity, string> = {
  junk: '#9a9488',
  common: '#d8d0bc',
  uncommon: '#8fc06a',
  rare: '#6aa8d8',
  epic: '#c88ae0',
};

/** Bad (or weird) things that can come out of the block. Implemented in src/loot/events.ts. */
export type LootEventId =
  /** The block bursts and throws the player back. Dangerous near edges. */
  | 'burst'
  /** A few perishable items in the inventory turn to rot. */
  | 'rot'
  /** A few pieces at the edge of the base break away into the void. */
  | 'crumble'
  /** Nothing at all. */
  | 'dud';

export type LootEntry =
  | { kind: 'item'; item: ItemId; min: number; max: number; weight: number }
  | { kind: 'bundle'; label: string; items: { item: ItemId; min: number; max: number }[]; weight: number }
  | { kind: 'event'; event: LootEventId; weight: number };

export type LootTable = Partial<Record<Rarity, LootEntry[]>>;

export const LOOT_TABLES: Partial<Record<PhaseId, LootTable>> = {
  meadow: {
    junk: [
      { kind: 'item', item: 'pebble', min: 1, max: 2, weight: 30 },
      { kind: 'item', item: 'dry_leaves', min: 1, max: 3, weight: 25 },
      { kind: 'event', event: 'dud', weight: 10 },
      { kind: 'event', event: 'burst', weight: 18 },
      { kind: 'event', event: 'rot', weight: 10 },
      { kind: 'event', event: 'crumble', weight: 7 },
    ],
    common: [
      { kind: 'item', item: 'dirt', min: 1, max: 3, weight: 40 },
      { kind: 'item', item: 'stick', min: 1, max: 2, weight: 25 },
      { kind: 'item', item: 'seeds', min: 1, max: 2, weight: 20 },
      { kind: 'item', item: 'mud_clump', min: 1, max: 2, weight: 15 },
    ],
    uncommon: [
      { kind: 'item', item: 'turf', min: 1, max: 2, weight: 35 },
      { kind: 'item', item: 'log', min: 1, max: 1, weight: 30 },
      { kind: 'item', item: 'egg', min: 1, max: 1, weight: 15 },
      { kind: 'item', item: 'feather', min: 1, max: 3, weight: 10 },
      { kind: 'item', item: 'flint', min: 1, max: 1, weight: 10 },
    ],
    rare: [
      { kind: 'item', item: 'log', min: 2, max: 4, weight: 40 },
      { kind: 'item', item: 'dirt', min: 6, max: 10, weight: 35 },
      { kind: 'item', item: 'turf', min: 4, max: 6, weight: 25 },
    ],
    epic: [
      {
        kind: 'bundle',
        label: 'Meadow Cache',
        items: [
          { item: 'dirt', min: 8, max: 12 },
          { item: 'log', min: 3, max: 5 },
          { item: 'seeds', min: 3, max: 5 },
          { item: 'flint', min: 1, max: 2 },
        ],
        weight: 1,
      },
    ],
  },
};

/**
 * The first few breaks of a fresh world always give these, so a new player can
 * start building right away. Set to [] to disable.
 */
export const STARTER_DROPS: { item: ItemId; count: number }[] = [
  { item: 'dirt', count: 2 },
  { item: 'dirt', count: 2 },
  { item: 'log', count: 1 },
  { item: 'dirt', count: 3 },
];

/** Tunables for loot events. */
export const EVENT_SETTINGS = {
  burst: { horizontalForce: 9, upwardForce: 7 },
  rot: { maxItemsRotted: 4 },
  crumble: { minBlocks: 1, maxBlocks: 3 },
};

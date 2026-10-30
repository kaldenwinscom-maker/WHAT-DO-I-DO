// Every item in the game. Add new items here, then reference them from loot.ts, recipes.ts
// or blueprints.ts. Each item's 3D look (icons, held item) is built in src/items/itemModels.ts.

import type { StructureId } from './structures';

export type ItemId =
  // raw materials
  | 'log'
  | 'stone'
  | 'fiber'
  | 'iron_ore'
  | 'dirt'
  | 'turf'
  | 'mud_clump'
  | 'flint'
  | 'feather'
  | 'dry_leaves'
  | 'seeds'
  // food
  | 'berries'
  | 'egg'
  // components (made at the crafting table)
  | 'planks'
  | 'stick'
  | 'rope'
  | 'cloth'
  | 'stone_brick'
  | 'nails'
  | 'hinge'
  | 'wood_frame'
  | 'beam'
  // tools and placeables
  | 'rock'
  | 'stone_hatchet'
  | 'torch'
  | 'crafting_table'
  // junk
  | 'rot';

/** What eating an item does. */
export interface FoodStats {
  /** Hunger restored (out of 100). */
  hunger: number;
  /** Health restored directly. */
  health?: number;
  /** 0..1 chance of food poisoning (raw food). */
  sickChance?: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  maxStack: number;
  /** Perishable items can rot during a "Rot" loot event. */
  perishable?: boolean;
  /** Edible items: right-click while holding to eat. */
  food?: FoodStats;
  /** Held tools mine the Monolith faster (1 = bare hands). */
  miningSpeed?: number;
  /** Right-click while holding to place this structure. */
  places?: StructureId;
  /** Held torches light the area and burn out after this many seconds. */
  burnSeconds?: number;
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // ---- raw materials ----
  log: { id: 'log', name: 'Wood', maxStack: 64, description: 'A rough log. Split it into planks and sticks.' },
  stone: { id: 'stone', name: 'Stone', maxStack: 64, description: 'A fist-sized stone. Shaped into bricks and tools.' },
  fiber: { id: 'fiber', name: 'Plant Fiber', maxStack: 64, description: 'Tough stringy plant fiber. Twisted into rope or woven into cloth.' },
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', maxStack: 64, description: 'Rust-streaked rock with iron in it. Hammered into nails and hinges.' },
  dirt: { id: 'dirt', name: 'Dirt', maxStack: 64, description: 'Loose earth. Will be packed into foundations.' },
  turf: { id: 'turf', name: 'Turf', maxStack: 64, description: 'A sod of soil held together by roots.' },
  mud_clump: { id: 'mud_clump', name: 'Mud Clump', maxStack: 64, description: 'Sticky, wet earth.' },
  flint: { id: 'flint', name: 'Flint', maxStack: 64, description: 'Sharp edges. Makes a good tool head.' },
  feather: { id: 'feather', name: 'Feather', maxStack: 64, description: 'Light and soft.' },
  dry_leaves: { id: 'dry_leaves', name: 'Dry Leaves', maxStack: 64, perishable: true, description: 'Dry tinder. Bundled into crude torches.' },
  seeds: { id: 'seeds', name: 'Seeds', maxStack: 64, perishable: true, description: 'A small sack of seeds. Could grow, given soil and time.' },

  // ---- food ----
  berries: {
    id: 'berries',
    name: 'Wild Berries',
    maxStack: 32,
    perishable: true,
    food: { hunger: 9 },
    description: 'Sour, but filling enough. Right-click to eat.',
  },
  egg: {
    id: 'egg',
    name: 'Egg',
    maxStack: 16,
    perishable: true,
    food: { hunger: 14, sickChance: 0.12 },
    description: 'Can be eaten raw (risky) or, one day, hatched. Right-click to eat.',
  },

  // ---- components ----
  planks: { id: 'planks', name: 'Wood Planks', maxStack: 64, description: 'Split timber. The backbone of most structures.' },
  stick: { id: 'stick', name: 'Sticks', maxStack: 64, description: 'Handles, kindling and light framing.' },
  rope: { id: 'rope', name: 'Rope', maxStack: 32, description: 'Twisted fiber rope. Lashes things together.' },
  cloth: { id: 'cloth', name: 'Cloth', maxStack: 32, description: 'Coarse woven cloth.' },
  stone_brick: { id: 'stone_brick', name: 'Stone Bricks', maxStack: 64, description: 'Roughly squared stone blocks.' },
  nails: { id: 'nails', name: 'Nails', maxStack: 99, description: 'Hand-forged iron nails.' },
  hinge: { id: 'hinge', name: 'Hinge', maxStack: 16, description: 'A crude iron hinge for lids and doors.' },
  wood_frame: { id: 'wood_frame', name: 'Wooden Frame', maxStack: 8, description: 'A nailed timber frame.' },
  beam: { id: 'beam', name: 'Beam', maxStack: 8, description: 'A heavy rope-bound beam.' },

  // ---- tools and placeables ----
  rock: { id: 'rock', name: 'Rock', maxStack: 1, miningSpeed: 1.2, description: 'A good, heavy rock. Hits the Monolith harder than bare hands.' },
  stone_hatchet: {
    id: 'stone_hatchet',
    name: 'Stone Hatchet',
    maxStack: 1,
    miningSpeed: 1.6,
    description: 'A flint-edged stone head lashed to a handle. Breaks the Monolith much faster.',
  },
  torch: {
    id: 'torch',
    name: 'Torch',
    maxStack: 16,
    burnSeconds: 150,
    description: 'Lights the dark around you while held. Burns out after a while.',
  },
  crafting_table: {
    id: 'crafting_table',
    name: 'Crafting Table',
    maxStack: 1,
    places: 'crafting_table',
    description: 'A sturdy workbench. Right-click while holding it to place it, then press E at the table to craft components.',
  },

  // ---- junk ----
  rot: { id: 'rot', name: 'Rot', maxStack: 64, description: 'Whatever this was, it is gone now. Useless.' },
};

/** Old item ids from earlier versions, mapped to their replacements when a save loads. */
export const ITEM_ALIASES: Record<string, ItemId> = { pebble: 'stone' };

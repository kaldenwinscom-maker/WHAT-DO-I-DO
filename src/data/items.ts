// Every item in the game. Add new items here, then reference them from loot.ts.
// Each item's 3D look (used for icons, the held item, and drops) is built in src/items/itemModels.ts.

export type ItemId =
  | 'dirt'
  | 'turf'
  | 'log'
  | 'planks'
  | 'stick'
  | 'seeds'
  | 'berries'
  | 'pebble'
  | 'dry_leaves'
  | 'mud_clump'
  | 'egg'
  | 'feather'
  | 'flint'
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
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: { id: 'dirt', name: 'Dirt', maxStack: 64, description: 'Loose earth. Packs into foundations.' },
  turf: { id: 'turf', name: 'Turf', maxStack: 64, description: 'A sod of soil held together by roots.' },
  log: { id: 'log', name: 'Log', maxStack: 64, description: 'A rough, heavy log.' },
  planks: { id: 'planks', name: 'Planks', maxStack: 64, description: 'Split timber.' },
  stick: { id: 'stick', name: 'Stick', maxStack: 64, description: 'Useful for handles, kindling and twig walls.' },
  berries: {
    id: 'berries',
    name: 'Wild Berries',
    maxStack: 32,
    perishable: true,
    food: { hunger: 9 },
    description: 'Sour, but filling enough. Right-click to eat.',
  },
  seeds: { id: 'seeds', name: 'Seeds', maxStack: 64, perishable: true, description: 'A small sack of seeds. Could grow, given soil and time.' },
  pebble: { id: 'pebble', name: 'Pebble', maxStack: 64, description: 'A small grey stone.' },
  dry_leaves: { id: 'dry_leaves', name: 'Dry Leaves', maxStack: 64, perishable: true, description: 'Junk. Crumbles at a touch.' },
  mud_clump: { id: 'mud_clump', name: 'Mud Clump', maxStack: 64, description: 'Sticky, wet earth.' },
  egg: {
    id: 'egg',
    name: 'Egg',
    maxStack: 16,
    perishable: true,
    food: { hunger: 14, sickChance: 0.12 },
    description: 'Can be eaten raw (risky) or, one day, hatched. Right-click to eat.',
  },
  feather: { id: 'feather', name: 'Feather', maxStack: 64, description: 'Light and soft.' },
  flint: { id: 'flint', name: 'Flint', maxStack: 64, description: 'Sharp edges. Good for tools.' },
  rot: { id: 'rot', name: 'Rot', maxStack: 64, description: 'Whatever this was, it is gone now.' },
};

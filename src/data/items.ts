// Every item in the game. Add new items here, then reference them from loot.ts.

import type { BlockId } from './blocks';

export type ItemId =
  | 'dirt'
  | 'turf'
  | 'log'
  | 'planks'
  | 'stick'
  | 'seeds'
  | 'pebble'
  | 'dry_leaves'
  | 'mud_clump'
  | 'egg'
  | 'feather'
  | 'flint'
  | 'rot';

export type IconShape = 'pebble' | 'leaf' | 'stick' | 'seeds' | 'egg' | 'feather' | 'blob' | 'shard';

export interface ItemDef {
  id: ItemId;
  name: string;
  maxStack: number;
  /** If set, right-click places this block. */
  places?: BlockId;
  /** Perishable items can rot during a "Rot" loot event. */
  perishable?: boolean;
  /** Icon: either drawn from the block's textures, or a simple procedural shape. */
  icon: { kind: 'block' } | { kind: 'shape'; shape: IconShape; color: string; accent?: string };
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: { id: 'dirt', name: 'Dirt', maxStack: 64, places: 'dirt', icon: { kind: 'block' }, description: 'Loose earth. The start of every island.' },
  turf: { id: 'turf', name: 'Turf', maxStack: 64, places: 'turf', icon: { kind: 'block' }, description: 'Dirt with a scruffy coat of grass.' },
  log: { id: 'log', name: 'Log', maxStack: 64, places: 'log', icon: { kind: 'block' }, description: 'A rough, heavy log.' },
  planks: { id: 'planks', name: 'Planks', maxStack: 64, places: 'planks', icon: { kind: 'block' }, description: 'Split timber.' },
  stick: { id: 'stick', name: 'Stick', maxStack: 64, icon: { kind: 'shape', shape: 'stick', color: '#7a5a3a', accent: '#4e3824' }, description: 'Useful for handles and kindling.' },
  seeds: { id: 'seeds', name: 'Seeds', maxStack: 64, perishable: true, icon: { kind: 'shape', shape: 'seeds', color: '#b49a5a', accent: '#6f5d33' }, description: 'Could grow, given dirt and time.' },
  pebble: { id: 'pebble', name: 'Pebble', maxStack: 64, icon: { kind: 'shape', shape: 'pebble', color: '#8a8780', accent: '#5a5852' }, description: 'Junk. A small grey stone.' },
  dry_leaves: { id: 'dry_leaves', name: 'Dry Leaves', maxStack: 64, perishable: true, icon: { kind: 'shape', shape: 'leaf', color: '#9a7b45', accent: '#5d4a28' }, description: 'Junk. Crumbles at a touch.' },
  mud_clump: { id: 'mud_clump', name: 'Mud Clump', maxStack: 64, places: 'packed_mud', icon: { kind: 'shape', shape: 'blob', color: '#5b4632', accent: '#3a2c1f' }, description: 'Sticky. Can be packed into a block.' },
  egg: { id: 'egg', name: 'Egg', maxStack: 16, perishable: true, icon: { kind: 'shape', shape: 'egg', color: '#e2d6bd', accent: '#a99a7c' }, description: 'Fragile. Something might hatch from this one day.' },
  feather: { id: 'feather', name: 'Feather', maxStack: 64, icon: { kind: 'shape', shape: 'feather', color: '#d9d4c7', accent: '#8f897a' }, description: 'Light and soft.' },
  flint: { id: 'flint', name: 'Flint', maxStack: 64, icon: { kind: 'shape', shape: 'shard', color: '#3e3f44', accent: '#6c6e76' }, description: 'Sharp edges. Good for tools.' },
  rot: { id: 'rot', name: 'Rot', maxStack: 64, icon: { kind: 'shape', shape: 'blob', color: '#4f5a2c', accent: '#2c3218' }, description: 'Whatever this was, it is gone now.' },
};

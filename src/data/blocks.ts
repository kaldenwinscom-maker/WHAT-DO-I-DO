// Placeable block types. Edit hardness to change how long blocks take to break by hand.
// Texture keys refer to generators in src/world/textures.ts.

import type { ItemId } from './items';

export type BlockId = 'magic' | 'dirt' | 'turf' | 'log' | 'planks' | 'packed_mud';

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Seconds to break with bare hands. */
  hardness: number;
  textures: { top: string; bottom: string; side: string };
  /** Item given back when this block is broken. */
  drop: ItemId | null;
  sound: 'soft' | 'wood' | 'stone';
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  magic: {
    id: 'magic',
    name: 'The Last Block',
    hardness: 1.0,
    textures: { top: 'magic', bottom: 'magic', side: 'magic' },
    drop: null,
    sound: 'stone',
  },
  dirt: {
    id: 'dirt',
    name: 'Dirt',
    hardness: 0.45,
    textures: { top: 'dirt', bottom: 'dirt', side: 'dirt' },
    drop: 'dirt',
    sound: 'soft',
  },
  turf: {
    id: 'turf',
    name: 'Turf',
    hardness: 0.55,
    textures: { top: 'turf_top', bottom: 'dirt', side: 'turf_side' },
    drop: 'turf',
    sound: 'soft',
  },
  log: {
    id: 'log',
    name: 'Log',
    hardness: 1.4,
    textures: { top: 'log_top', bottom: 'log_top', side: 'bark' },
    drop: 'log',
    sound: 'wood',
  },
  planks: {
    id: 'planks',
    name: 'Planks',
    hardness: 1.0,
    textures: { top: 'planks', bottom: 'planks', side: 'planks' },
    drop: 'planks',
    sound: 'wood',
  },
  packed_mud: {
    id: 'packed_mud',
    name: 'Packed Mud',
    hardness: 0.6,
    textures: { top: 'mud', bottom: 'mud', side: 'mud' },
    drop: 'mud_clump',
    sound: 'soft',
  },
};

/** Blocks that can be placed (everything except the magic block). */
export const PLACEABLE_BLOCKS = (Object.keys(BLOCKS) as BlockId[]).filter((b) => b !== 'magic');

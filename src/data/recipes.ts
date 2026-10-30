// Crafting recipes. `station: 'hand'` can be crafted anywhere (C key);
// `station: 'table'` needs the Crafting Table that stands by the Monolith (press E at the table).
// `time` is seconds per craft. Several recipes may make the same item.

import type { ItemId } from './items';

export type Station = 'hand' | 'table';

export interface Recipe {
  id: string;
  station: Station;
  output: { item: ItemId; count: number };
  inputs: { item: ItemId; count: number }[];
  time: number;
  /** Optional display name, when two recipes make the same item. */
  label?: string;
}

export const RECIPES: Recipe[] = [
  // ---- hand crafting: only the basics ----
  { id: 'hand_sticks', station: 'hand', output: { item: 'stick', count: 3 }, inputs: [{ item: 'log', count: 1 }], time: 2.5 },
  { id: 'hand_rock', station: 'hand', output: { item: 'rock', count: 1 }, inputs: [{ item: 'stone', count: 3 }], time: 2 },
  {
    id: 'hand_hatchet',
    station: 'hand',
    output: { item: 'stone_hatchet', count: 1 },
    inputs: [{ item: 'stone', count: 2 }, { item: 'flint', count: 1 }, { item: 'stick', count: 2 }, { item: 'fiber', count: 2 }],
    time: 5,
  },
  { id: 'hand_torch', station: 'hand', output: { item: 'torch', count: 1 }, inputs: [{ item: 'stick', count: 1 }, { item: 'cloth', count: 1 }], time: 2 },
  {
    id: 'hand_torch_crude',
    label: 'Torch (crude)',
    station: 'hand',
    output: { item: 'torch', count: 1 },
    inputs: [{ item: 'stick', count: 1 }, { item: 'dry_leaves', count: 2 }, { item: 'fiber', count: 1 }],
    time: 3,
  },

  // ---- crafting table: components ----
  { id: 'planks', station: 'table', output: { item: 'planks', count: 1 }, inputs: [{ item: 'log', count: 2 }], time: 3 },
  { id: 'sticks', station: 'table', output: { item: 'stick', count: 3 }, inputs: [{ item: 'log', count: 1 }], time: 2 },
  { id: 'rope', station: 'table', output: { item: 'rope', count: 1 }, inputs: [{ item: 'fiber', count: 3 }], time: 4 },
  { id: 'cloth', station: 'table', output: { item: 'cloth', count: 1 }, inputs: [{ item: 'fiber', count: 4 }], time: 5 },
  { id: 'stone_brick', station: 'table', output: { item: 'stone_brick', count: 1 }, inputs: [{ item: 'stone', count: 3 }], time: 4 },
  { id: 'nails', station: 'table', output: { item: 'nails', count: 5 }, inputs: [{ item: 'iron_ore', count: 1 }], time: 4 },
  { id: 'hinge', station: 'table', output: { item: 'hinge', count: 1 }, inputs: [{ item: 'iron_ore', count: 2 }], time: 6 },
  { id: 'wood_frame', station: 'table', output: { item: 'wood_frame', count: 1 }, inputs: [{ item: 'planks', count: 4 }, { item: 'nails', count: 2 }], time: 6 },
  { id: 'beam', station: 'table', output: { item: 'beam', count: 1 }, inputs: [{ item: 'planks', count: 3 }, { item: 'rope', count: 1 }], time: 6 },
];

export const recipeById = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);

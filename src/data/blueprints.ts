// Blueprints: plans for big structures. You must own a blueprint to build its structure,
// and building uses COMPONENTS made at the crafting table (see recipes.ts).
//
// How each blueprint unlocks:
//   - `day`: unlocks automatically at sunrise of that day (Day 1 = available from the start).
//     The day list is in CONFIG.blueprints.dayUnlocks (src/config.ts).
//   - `monolith`: can drop from the Monolith as a rare "Blueprint" find.
//   - `area`: will be found in loot in a new island area (areas arrive with island expansion).
// `hint` is what the locked blueprint shows in the B menu.

import type { ItemId } from './items';
import type { StructureId } from './structures';

/** Every structure except the Crafting Table (which is part of the island) can have a blueprint. */
export type BlueprintId = Exclude<StructureId, 'crafting_table'>;

export interface BlueprintDef {
  id: BlueprintId;
  name: string;
  description: string;
  components: { item: ItemId; count: number }[];
  /** Can drop from the Monolith. */
  monolith: boolean;
  /** Name of the future island area where it can be found, if any. */
  area?: string;
}

export const BLUEPRINTS: BlueprintDef[] = [
  {
    id: 'fire_pit',
    name: 'Fire Pit',
    description: 'A ring of stone bricks around a fire bed. Warmth, light and cooking.',
    components: [
      { item: 'stone_brick', count: 10 },
      { item: 'planks', count: 3 },
    ],
    monolith: false,
  },
  {
    id: 'chicken_coop',
    name: 'Chicken Coop',
    description: 'A raised hutch for hatching and keeping chickens.',
    components: [
      { item: 'planks', count: 8 },
      { item: 'stick', count: 4 },
      { item: 'rope', count: 2 },
      { item: 'cloth', count: 1 },
    ],
    monolith: false,
  },
  {
    id: 'animal_feeder',
    name: 'Animal Feeder',
    description: 'A wooden trough. Animals eat from it.',
    components: [
      { item: 'planks', count: 4 },
      { item: 'nails', count: 2 },
    ],
    monolith: true,
  },
  {
    id: 'storage_chest',
    name: 'Storage Chest',
    description: 'A nailed wooden chest with an iron-hinged lid.',
    components: [
      { item: 'planks', count: 6 },
      { item: 'nails', count: 4 },
      { item: 'hinge', count: 1 },
    ],
    monolith: true,
    area: 'Abandoned Camp',
  },
  {
    id: 'door',
    name: 'Door',
    description: 'A framed plank door on iron hinges.',
    components: [
      { item: 'wood_frame', count: 1 },
      { item: 'planks', count: 4 },
      { item: 'hinge', count: 2 },
    ],
    monolith: true,
  },
  {
    id: 'bed',
    name: 'Bed',
    description: 'A timber bed with a cloth mattress. Somewhere to rest.',
    components: [
      { item: 'wood_frame', count: 1 },
      { item: 'cloth', count: 4 },
      { item: 'rope', count: 2 },
    ],
    monolith: true,
    area: 'Ruined Village',
  },
  {
    id: 'rain_collector',
    name: 'Rain Collector',
    description: 'A cloth funnel over a barrel that catches rainwater.',
    components: [
      { item: 'wood_frame', count: 1 },
      { item: 'planks', count: 4 },
      { item: 'cloth', count: 2 },
    ],
    monolith: true,
  },
  {
    id: 'cooking_station',
    name: 'Cooking Station',
    description: 'A stone counter with a hanging pot. Better meals.',
    components: [
      { item: 'stone_brick', count: 6 },
      { item: 'beam', count: 1 },
      { item: 'nails', count: 4 },
    ],
    monolith: true,
    area: 'Ruined Village',
  },
];

export const blueprintById = (id: string): BlueprintDef | undefined => BLUEPRINTS.find((b) => b.id === id);

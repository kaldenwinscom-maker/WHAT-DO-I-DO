// Placeable structures: their size on the ground (for collision and placement checks).
// How they look is built in src/build/structureModels.ts.

export type StructureId =
  | 'crafting_table'
  | 'fire_pit'
  | 'storage_chest'
  | 'chicken_coop'
  | 'door'
  | 'bed'
  | 'rain_collector'
  | 'cooking_station'
  | 'animal_feeder';

export interface StructureDef {
  id: StructureId;
  name: string;
  /** Footprint width (x) and depth (z) in metres, before rotation. */
  size: { w: number; d: number };
  /** Collision height in metres (0 = you can walk over it). */
  height: number;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  crafting_table: { id: 'crafting_table', name: 'Crafting Table', size: { w: 1.7, d: 0.85 }, height: 0.95 },
  fire_pit: { id: 'fire_pit', name: 'Fire Pit', size: { w: 1.5, d: 1.5 }, height: 0 },
  storage_chest: { id: 'storage_chest', name: 'Storage Chest', size: { w: 1.1, d: 0.65 }, height: 0.7 },
  chicken_coop: { id: 'chicken_coop', name: 'Chicken Coop', size: { w: 1.9, d: 1.5 }, height: 1.7 },
  door: { id: 'door', name: 'Door', size: { w: 1.25, d: 0.25 }, height: 2.3 },
  bed: { id: 'bed', name: 'Bed', size: { w: 1.1, d: 2.1 }, height: 0.55 },
  rain_collector: { id: 'rain_collector', name: 'Rain Collector', size: { w: 1.3, d: 1.3 }, height: 1.9 },
  cooking_station: { id: 'cooking_station', name: 'Cooking Station', size: { w: 1.8, d: 0.9 }, height: 1.0 },
  animal_feeder: { id: 'animal_feeder', name: 'Animal Feeder', size: { w: 1.5, d: 0.6 }, height: 0.55 },
};

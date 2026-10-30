// Persists the game to localStorage. Bump `version` and add a migration when the format changes.

import { CONFIG } from '../config';
import type { ItemId } from '../data/items';

/** A placed block from the voxel version of the game (save v1), kept for conversion. */
export type LegacyBlock = [number, number, number, string];

export interface SaveData {
  version: 2;
  savedAt: number;
  playSeconds: number;
  timeOfDay: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: { slots: ([ItemId, number] | null)[]; selected: number };
  magic: { breaks: number; starterIndex: number };
  /** Blocks placed before the visual rework; converted to building pieces when building lands. */
  legacyBlocks: LegacyBlock[];
  /** Set when this save was just migrated from an older version (cleared after the notice). */
  migratedFrom?: number;
}

interface SaveDataV1 {
  version: 1;
  savedAt: number;
  playSeconds: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: { slots: ([ItemId, number] | null)[]; selected: number };
  world: LegacyBlock[];
  magic: { breaks: number; starterIndex: number };
}

function migrate(raw: SaveDataV1 | SaveData): SaveData | null {
  if (raw.version === 2) return raw;
  if (raw.version === 1 && Array.isArray(raw.world)) {
    return {
      version: 2,
      savedAt: raw.savedAt,
      playSeconds: raw.playSeconds ?? 0,
      timeOfDay: CONFIG.world.startTime,
      // The old grid coordinates don't map onto the new island, so respawn by the Monolith.
      player: { x: 0, y: -999, z: 0, yaw: raw.player.yaw, pitch: 0 },
      inventory: raw.inventory,
      magic: raw.magic,
      legacyBlocks: raw.world.filter((b) => b[3] !== 'magic'),
      migratedFrom: 1,
    };
  }
  return null;
}

export class SaveManager {
  constructor(private readonly key: string = CONFIG.save.key) {}

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.warn('Could not read save:', err);
      return null;
    }
  }

  write(data: SaveData): boolean {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('Could not write save:', err);
      return false;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* storage unavailable */
    }
  }
}

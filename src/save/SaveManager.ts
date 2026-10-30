// Persists the game to localStorage. Bump `version` and add a migration when the format changes.

import { CONFIG } from '../config';
import type { BlockId } from '../data/blocks';
import type { ItemId } from '../data/items';

export interface SaveData {
  version: 1;
  savedAt: number;
  playSeconds: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: { slots: ([ItemId, number] | null)[]; selected: number };
  world: [number, number, number, BlockId][];
  magic: { breaks: number; starterIndex: number };
}

export class SaveManager {
  constructor(private readonly key: string = CONFIG.save.key) {}

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1 || !Array.isArray(data.world)) return null;
      return data;
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

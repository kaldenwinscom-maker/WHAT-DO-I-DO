// Persists the current run to localStorage. Bump `version` and add a migration when the format changes.
// Records of past runs live separately (see Records.ts) so death doesn't erase them.

import { CONFIG } from '../config';
import type { ItemId } from '../data/items';
import type { SurvivalState } from '../player/Survival';

/** A placed block from the voxel version of the game (save v1), kept for conversion. */
export type LegacyBlock = [number, number, number, string];

export interface RunStats {
  animalsRaised: number;
  structuresBuilt: number;
}

export interface SaveData {
  version: 3;
  savedAt: number;
  playSeconds: number;
  clock: { day: number; seconds: number };
  survival: SurvivalState;
  stats: RunStats;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: { slots: ([ItemId, number] | null)[]; selected: number };
  magic: { breaks: number; starterIndex: number };
  /** Blocks placed before the visual rework; converted to building pieces when building lands. */
  legacyBlocks: LegacyBlock[];
  /** Set when this save was just migrated from an older version (cleared after the notice). */
  migratedFrom?: number;
}

type Player = SaveData['player'];
type Inv = SaveData['inventory'];
interface SaveDataV1 {
  version: 1;
  playSeconds: number;
  player: Player;
  inventory: Inv;
  world: LegacyBlock[];
  magic: SaveData['magic'];
}
interface SaveDataV2 {
  version: 2;
  playSeconds: number;
  timeOfDay: number;
  player: Player;
  inventory: Inv;
  magic: SaveData['magic'];
  legacyBlocks: LegacyBlock[];
  migratedFrom?: number;
}

const freshSurvival = (): SurvivalState => ({
  health: CONFIG.survival.maxHealth,
  hunger: CONFIG.survival.maxHunger,
  stamina: CONFIG.survival.maxStamina,
  sickSeconds: 0,
});

function migrate(raw: SaveDataV1 | SaveDataV2 | SaveData): SaveData | null {
  let v2: SaveDataV2;
  if (raw.version === 3) return raw;
  if (raw.version === 1 && Array.isArray(raw.world)) {
    v2 = {
      version: 2,
      playSeconds: raw.playSeconds ?? 0,
      timeOfDay: 0.3,
      // The old grid coordinates don't map onto the new island, so respawn by the Monolith.
      player: { x: 0, y: -999, z: 0, yaw: raw.player.yaw, pitch: 0 },
      inventory: raw.inventory,
      magic: raw.magic,
      legacyBlocks: raw.world.filter((b) => b[3] !== 'magic'),
      migratedFrom: 1,
    };
  } else if (raw.version === 2) {
    v2 = raw;
  } else {
    return null;
  }
  // v2 -> v3: older saves start the survival clock on Day 1 at full health.
  const daySec = CONFIG.time.dayMinutes * 60;
  const t = v2.timeOfDay;
  const seconds =
    t >= 0.25 && t < 0.75 ? ((t - 0.25) / 0.5) * daySec : daySec + (((t - 0.75 + 1) % 1) / 0.5) * CONFIG.time.nightMinutes * 60;
  return {
    version: 3,
    savedAt: Date.now(),
    playSeconds: v2.playSeconds,
    clock: { day: 1, seconds },
    survival: freshSurvival(),
    stats: { animalsRaised: 0, structuresBuilt: 0 },
    player: v2.player,
    inventory: v2.inventory,
    magic: v2.magic,
    legacyBlocks: v2.legacyBlocks ?? [],
    migratedFrom: v2.migratedFrom ?? 2,
  };
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

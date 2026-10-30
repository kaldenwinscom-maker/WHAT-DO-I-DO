// Which blueprints you own and which you are tracking on screen.

import { CONFIG } from '../config';
import { BLUEPRINTS, blueprintById, type BlueprintDef, type BlueprintId } from '../data/blueprints';
import type { ItemId } from '../data/items';
import type { Inventory } from '../inventory/Inventory';
import { rawNeeds } from './Crafting';

export interface ChecklistLine {
  item: ItemId;
  need: number;
  have: number;
  done: boolean;
  /** For missing components: raw materials to craft the shortfall. */
  raw: { item: ItemId; need: number; have: number }[] | null;
}

export class BlueprintBook {
  unlocked = new Set<BlueprintId>();
  tracked: BlueprintId[] = [];
  /** Called when a blueprint is newly unlocked. */
  onUnlock: ((bp: BlueprintDef, source: string) => void) | null = null;

  isUnlocked(id: BlueprintId): boolean {
    return this.unlocked.has(id);
  }

  unlock(id: BlueprintId, source: string): boolean {
    if (this.unlocked.has(id) || !blueprintById(id)) return false;
    this.unlocked.add(id);
    this.onUnlock?.(blueprintById(id)!, source);
    return true;
  }

  /** Unlock everything whose unlock day has arrived. */
  applyDayUnlocks(day: number): BlueprintId[] {
    const got: BlueprintId[] = [];
    for (const [id, d] of Object.entries(CONFIG.blueprints.dayUnlocks)) {
      if (d <= day && this.unlock(id as BlueprintId, `Day ${d}`)) got.push(id as BlueprintId);
    }
    return got;
  }

  /** A random locked blueprint that the Monolith can give, or null if none are left. */
  randomMonolithBlueprint(): BlueprintDef | null {
    const pool = BLUEPRINTS.filter((b) => b.monolith && !this.unlocked.has(b.id));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** How a locked blueprint can be obtained, for the B menu. */
  hint(bp: BlueprintDef): string {
    const parts: string[] = [];
    const day = CONFIG.blueprints.dayUnlocks[bp.id];
    if (day !== undefined) parts.push(`Unlocks on Day ${day}`);
    if (bp.monolith) parts.push('Found in the Monolith');
    if (bp.area) parts.push(`Found in the ${bp.area}`);
    return parts.join(' · ') || 'Unknown';
  }

  isTracked(id: BlueprintId): boolean {
    return this.tracked.includes(id);
  }

  /** Track or untrack. Returns false if tracking was refused (limit reached). */
  toggleTrack(id: BlueprintId): boolean {
    if (this.isTracked(id)) {
      this.tracked = this.tracked.filter((t) => t !== id);
      return true;
    }
    if (!this.isUnlocked(id) || this.tracked.length >= CONFIG.blueprints.maxTracked) return false;
    this.tracked.push(id);
    return true;
  }

  checklist(inv: Inventory, id: BlueprintId): { lines: ChecklistLine[]; ready: boolean } {
    const bp = blueprintById(id)!;
    const lines = bp.components.map((c) => {
      const have = inv.count(c.item);
      const done = have >= c.count;
      return { item: c.item, need: c.count, have, done, raw: done ? null : rawNeeds(inv, c.item, c.count - have) };
    });
    return { lines, ready: lines.every((l) => l.done) };
  }

  serialize(): { unlocked: BlueprintId[]; tracked: BlueprintId[] } {
    return { unlocked: [...this.unlocked], tracked: [...this.tracked] };
  }

  load(data: { unlocked?: string[]; tracked?: string[] } | undefined): void {
    this.unlocked = new Set((data?.unlocked ?? []).filter((id) => blueprintById(id)) as BlueprintId[]);
    this.tracked = (data?.tracked ?? []).filter((id) => this.unlocked.has(id as BlueprintId)).slice(0, CONFIG.blueprints.maxTracked) as BlueprintId[];
  }
}

// Crafting queues. Ingredients are taken when a craft is queued (so they can't be spent twice)
// and refunded if the craft is cancelled. Each queue works through its entries one craft at a time.

import { ITEMS, type ItemId } from '../data/items';
import { RECIPES, recipeById, type Recipe, type Station } from '../data/recipes';
import { BLUEPRINTS } from '../data/blueprints';
import type { Inventory } from '../inventory/Inventory';

export interface QueueEntry {
  recipeId: string;
  /** Crafts still to finish, including the one in progress. */
  remaining: number;
  /** Seconds of work done on the current craft. */
  progress: number;
}

export type CraftQueue = QueueEntry[];

export function recipesFor(station: Station): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

/** How many times a recipe can be crafted from what's in the inventory. */
export function maxCraftable(inv: Inventory, r: Recipe): number {
  return Math.min(...r.inputs.map((i) => Math.floor(inv.count(i.item) / i.count)));
}

/** Queue up to `count` crafts. Returns how many were queued. */
export function enqueue(inv: Inventory, queue: CraftQueue, r: Recipe, count: number): number {
  const n = Math.min(count, maxCraftable(inv, r));
  if (n <= 0) return 0;
  for (const i of r.inputs) inv.remove(i.item, i.count * n);
  const last = queue[queue.length - 1];
  if (last && last.recipeId === r.id) last.remaining += n;
  else queue.push({ recipeId: r.id, remaining: n, progress: 0 });
  return n;
}

/** Cancel a queue entry and give back its ingredients. */
export function cancel(inv: Inventory, queue: CraftQueue, index: number): void {
  const e = queue[index];
  const r = e && recipeById(e.recipeId);
  if (!e || !r) return;
  for (const i of r.inputs) inv.add(i.item, i.count * e.remaining);
  queue.splice(index, 1);
}

/** Advance a queue. `give` receives finished items. */
export function tickQueue(queue: CraftQueue, dt: number, give: (item: ItemId, count: number) => void): void {
  let t = dt;
  while (t > 0 && queue.length > 0) {
    const e = queue[0];
    const r = recipeById(e.recipeId);
    if (!r) {
      queue.shift();
      continue;
    }
    const need = r.time - e.progress;
    if (t < need) {
      e.progress += t;
      return;
    }
    t -= need;
    give(r.output.item, r.output.count);
    e.remaining--;
    e.progress = 0;
    if (e.remaining <= 0) queue.shift();
  }
}

export function queueProgress(queue: CraftQueue): { recipe: Recipe; frac: number; remaining: number } | null {
  const e = queue[0];
  const r = e && recipeById(e.recipeId);
  return r ? { recipe: r, frac: e.progress / r.time, remaining: e.remaining } : null;
}

export function sanitizeQueue(q: unknown): CraftQueue {
  if (!Array.isArray(q)) return [];
  return q
    .filter((e) => e && recipeById(e.recipeId) && e.remaining > 0)
    .map((e) => ({ recipeId: e.recipeId, remaining: Math.floor(e.remaining), progress: Math.max(0, +e.progress || 0) }));
}

// ---------------------------------------------------------------- "what is this for?"

let usageIndex: Map<ItemId, string[]> | null = null;

/** Names of the things an item is used in (recipes and blueprints), e.g. ["Rope", "Torch"]. */
export function usedIn(item: ItemId): string[] {
  if (!usageIndex) {
    usageIndex = new Map();
    const add = (id: ItemId, name: string) => {
      const list = usageIndex!.get(id) ?? [];
      if (!list.includes(name)) list.push(name);
      usageIndex!.set(id, list);
    };
    for (const r of RECIPES) for (const i of r.inputs) add(i.item, ITEMS[r.output.item].name);
    for (const b of BLUEPRINTS) for (const c of b.components) add(c.item, `${b.name} (blueprint)`);
  }
  return usageIndex.get(item) ?? [];
}

/** The recipe that makes a component, preferring the crafting table. */
export function recipeMaking(item: ItemId): Recipe | undefined {
  return RECIPES.find((r) => r.output.item === item && r.station === 'table') ?? RECIPES.find((r) => r.output.item === item);
}

/**
 * For a missing component, the raw materials needed to craft the shortfall.
 * e.g. rope short by 2 -> [{ item: 'fiber', need: 6, have: 2 }]
 */
export function rawNeeds(inv: Inventory, item: ItemId, missing: number): { item: ItemId; need: number; have: number }[] | null {
  const r = recipeMaking(item);
  if (!r || missing <= 0) return null;
  const crafts = Math.ceil(missing / r.output.count);
  return r.inputs.map((i) => ({ item: i.item, need: i.count * crafts, have: inv.count(i.item) }));
}

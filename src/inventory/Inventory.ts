// 36 slots: 0-8 are the hotbar, 9-35 the main inventory.

import { ITEMS, type ItemId } from '../data/items';

export interface Stack {
  item: ItemId;
  count: number;
}

export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 27;
export const TOTAL_SLOTS = HOTBAR_SIZE + MAIN_SIZE;

export class Inventory {
  slots: (Stack | null)[] = new Array(TOTAL_SLOTS).fill(null);
  selected = 0;
  /** Called after any change so the UI can redraw. */
  onChange: (() => void) | null = null;

  get selectedStack(): Stack | null {
    return this.slots[this.selected];
  }

  select(i: number): void {
    this.selected = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.changed();
  }

  /** Adds items; returns how many did not fit. */
  add(item: ItemId, count: number): number {
    const max = ITEMS[item].maxStack;
    let left = count;
    // Top up existing stacks first.
    for (let i = 0; i < TOTAL_SLOTS && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.item === item && s.count < max) {
        const n = Math.min(max - s.count, left);
        s.count += n;
        left -= n;
      }
    }
    // Then fill empty slots, hotbar first.
    for (let i = 0; i < TOTAL_SLOTS && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, left);
        this.slots[i] = { item, count: n };
        left -= n;
      }
    }
    this.changed();
    return left;
  }

  count(item: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  /** Removes up to `count` of an item; returns how many were removed. */
  remove(item: ItemId, count: number): number {
    let left = count;
    for (let i = TOTAL_SLOTS - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.item === item) {
        const n = Math.min(s.count, left);
        s.count -= n;
        left -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return count - left;
  }

  /** Removes `n` from a specific slot. */
  takeFromSlot(i: number, n = 1): Stack | null {
    const s = this.slots[i];
    if (!s) return null;
    const taken = Math.min(n, s.count);
    s.count -= taken;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return { item: s.item, count: taken };
  }

  isEmpty(): boolean {
    return this.slots.every((s) => !s);
  }

  changed(): void {
    this.onChange?.();
  }

  serialize(): { slots: ([ItemId, number] | null)[]; selected: number } {
    return { slots: this.slots.map((s) => (s ? [s.item, s.count] : null)), selected: this.selected };
  }

  load(data: { slots: ([ItemId, number] | null)[]; selected: number }): void {
    this.slots = new Array(TOTAL_SLOTS).fill(null);
    data.slots.forEach((s, i) => {
      if (s && i < TOTAL_SLOTS && ITEMS[s[0]] && s[1] > 0) this.slots[i] = { item: s[0], count: s[1] };
    });
    this.selected = Math.max(0, Math.min(HOTBAR_SIZE - 1, data.selected | 0));
    this.changed();
  }
}

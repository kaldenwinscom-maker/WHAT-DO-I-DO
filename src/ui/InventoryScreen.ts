// Full inventory (E). Click to pick up / drop a stack, right-click to split or place one,
// shift-click to move a stack between the hotbar and the main inventory.

import { ITEMS } from '../data/items';
import { usedIn } from '../crafting/Crafting';
import { HOTBAR_SIZE, TOTAL_SLOTS, type Inventory, type Stack } from '../inventory/Inventory';
import { itemIconUrl } from './icons';
import { renderSlot } from './Hud';

export class InventoryScreen {
  readonly root = document.createElement('div');
  private slots: HTMLElement[] = [];
  private cursor: Stack | null = null;
  private cursorEl = document.createElement('div');
  private info = document.createElement('div');
  isOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
  ) {
    this.root.id = 'inventory';
    const panel = document.createElement('div');
    panel.className = 'panel nailed';
    panel.innerHTML = '<h2>Inventory</h2>';
    const main = document.createElement('div');
    main.className = 'grid';
    const hot = document.createElement('div');
    hot.className = 'grid hot';
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      if (i < HOTBAR_SIZE) {
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = String(i + 1);
        s.appendChild(k);
      }
      s.addEventListener('mousedown', (e) => this.onSlotClick(i, e));
      s.addEventListener('mouseenter', () => this.showInfo(i));
      s.addEventListener('contextmenu', (e) => e.preventDefault());
      this.slots[i] = s;
    }
    for (let i = HOTBAR_SIZE; i < TOTAL_SLOTS; i++) main.appendChild(this.slots[i]);
    for (let i = 0; i < HOTBAR_SIZE; i++) hot.appendChild(this.slots[i]);
    this.info.id = 'inv-info';
    this.info.textContent = 'Click to pick up. Right-click to split. Shift-click to move.';
    panel.append(main, hot, this.info);
    this.root.appendChild(panel);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this.cursorEl.id = 'cursor-stack';
    this.cursorEl.style.display = 'none';
    document.body.appendChild(this.cursorEl);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX}px`;
      this.cursorEl.style.top = `${e.clientY}px`;
    });
    parent.appendChild(this.root);
  }

  open(): void {
    this.isOpen = true;
    this.root.classList.add('open');
    this.refresh();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
    if (this.cursor) {
      const left = this.inv.add(this.cursor.item, this.cursor.count);
      // Inventory full: the leftover is lost to the void.
      void left;
      this.cursor = null;
    }
    this.renderCursor();
  }

  refresh(): void {
    if (!this.isOpen) return;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      renderSlot(this.slots[i], this.inv.slots[i]);
      this.slots[i].classList.toggle('selected', i === this.inv.selected);
    }
    this.renderCursor();
  }

  private onSlotClick(i: number, e: MouseEvent): void {
    e.preventDefault();
    const inv = this.inv;
    const slot = inv.slots[i];

    if (e.shiftKey && slot && !this.cursor) {
      // Quick-move between hotbar and main inventory.
      const [from, to] = i < HOTBAR_SIZE ? [HOTBAR_SIZE, TOTAL_SLOTS] : [0, HOTBAR_SIZE];
      inv.slots[i] = null;
      let left = slot.count;
      const max = ITEMS[slot.item].maxStack;
      for (let j = from; j < to && left > 0; j++) {
        const t = inv.slots[j];
        if (t && t.item === slot.item && t.count < max) {
          const n = Math.min(max - t.count, left);
          t.count += n;
          left -= n;
        }
      }
      for (let j = from; j < to && left > 0; j++) {
        if (!inv.slots[j]) {
          inv.slots[j] = { item: slot.item, count: left };
          left = 0;
        }
      }
      if (left > 0) inv.slots[i] = { item: slot.item, count: left };
      inv.changed();
      return;
    }

    const right = e.button === 2;
    if (!this.cursor) {
      if (!slot) return;
      if (right) {
        const half = Math.ceil(slot.count / 2);
        this.cursor = { item: slot.item, count: half };
        slot.count -= half;
        if (slot.count <= 0) inv.slots[i] = null;
      } else {
        this.cursor = slot;
        inv.slots[i] = null;
      }
    } else if (!slot) {
      if (right) {
        inv.slots[i] = { item: this.cursor.item, count: 1 };
        this.cursor.count--;
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        inv.slots[i] = this.cursor;
        this.cursor = null;
      }
    } else if (slot.item === this.cursor.item) {
      const max = ITEMS[slot.item].maxStack;
      const n = Math.min(max - slot.count, right ? 1 : this.cursor.count);
      slot.count += n;
      this.cursor.count -= n;
      if (this.cursor.count <= 0) this.cursor = null;
    } else if (!right) {
      inv.slots[i] = this.cursor;
      this.cursor = slot;
    }
    inv.changed();
    this.showInfo(i);
  }

  private showInfo(i: number): void {
    const s = this.inv.slots[i];
    if (!s) return;
    const d = ITEMS[s.item];
    const tags: string[] = [];
    if (d.food) tags.push(`food +${d.food.hunger}${d.food.sickChance ? ', risky raw' : ''}`);
    if (d.miningSpeed) tags.push(`tool, mines ${Math.round((d.miningSpeed - 1) * 100)}% faster`);
    if (d.places) tags.push('placeable');
    if (d.perishable) tags.push('perishable');
    const uses = usedIn(s.item);
    this.info.innerHTML =
      `<b>${d.name}</b>${tags.length ? ' · ' + tags.join(' · ') : ''}<br>${d.description}` +
      (uses.length ? `<br><span class="uses">Used in: ${uses.join(', ')}</span>` : '');
  }

  private renderCursor(): void {
    if (!this.cursor) {
      this.cursorEl.style.display = 'none';
      return;
    }
    this.cursorEl.style.display = 'block';
    this.cursorEl.innerHTML = `<img src="${itemIconUrl(this.cursor.item)}">${this.cursor.count > 1 ? `<span class="qty">${this.cursor.count}</span>` : ''}`;
  }
}

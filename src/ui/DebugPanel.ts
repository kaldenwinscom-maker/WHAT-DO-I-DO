// F9 debug panel for testing: give items, unlock blueprints, skip days.

import { ITEMS, type ItemId } from '../data/items';

export interface DebugActions {
  give(item: ItemId, count: number): void;
  giveKit(): void;
  giveComponents(): void;
  unlockAll(): void;
  nextDay(): void;
  heal(): void;
  close(): void;
}

export class DebugPanel {
  readonly root = document.createElement('div');
  isOpen = false;

  constructor(parent: HTMLElement, actions: DebugActions) {
    this.root.id = 'debug';
    this.root.className = 'sv-overlay';
    const options = (Object.keys(ITEMS) as ItemId[]).map((id) => `<option value="${id}">${ITEMS[id].name}</option>`).join('');
    this.root.innerHTML = `
      <div class="sv-window dbg-window">
        <div class="sv-head"><div><div class="sv-title">Debug (F9)</div><div class="sv-sub">Testing tools</div></div><button class="sv-x" data-act="close">✕</button></div>
        <div class="dbg-row"><select class="dbg-item">${options}</select><input class="dbg-count" type="number" value="10" min="1" max="999"><button class="sv-btn" data-act="give">Give</button></div>
        <button class="sv-btn" data-act="kit">Give raw materials (wood, stone, fiber, iron…)</button>
        <button class="sv-btn" data-act="components">Give components (planks, rope, nails…)</button>
        <button class="sv-btn" data-act="unlock">Unlock all blueprints</button>
        <button class="sv-btn" data-act="day">Skip to next day (sunrise)</button>
        <button class="sv-btn" data-act="heal">Heal, feed and rest</button>
      </div>`;
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (t === this.root || act === 'close') actions.close();
      else if (act === 'give') {
        const item = (this.root.querySelector('.dbg-item') as HTMLSelectElement).value as ItemId;
        const n = Math.max(1, Number((this.root.querySelector('.dbg-count') as HTMLInputElement).value) || 1);
        actions.give(item, n);
      } else if (act === 'kit') actions.giveKit();
      else if (act === 'components') actions.giveComponents();
      else if (act === 'unlock') actions.unlockAll();
      else if (act === 'day') actions.nextDay();
      else if (act === 'heal') actions.heal();
    });
    parent.appendChild(this.root);
  }

  open(): void {
    this.isOpen = true;
    this.root.classList.add('open');
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }
}

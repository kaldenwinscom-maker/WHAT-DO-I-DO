// Blueprint menu (B): every blueprint in a grid. Locked ones are dark silhouettes with a hint
// on how to get them; click an unlocked one for its details and the TRACK button.

import { BLUEPRINTS, blueprintById, type BlueprintId } from '../data/blueprints';
import { CONFIG } from '../config';
import { ITEMS } from '../data/items';
import type { BlueprintBook } from '../crafting/Blueprints';
import type { Inventory } from '../inventory/Inventory';
import { itemIconUrl, structureIconUrl } from './icons';

export class BlueprintMenu {
  readonly root = document.createElement('div');
  isOpen = false;
  private selected: BlueprintId | null = null;
  private readonly grid: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly count: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly book: BlueprintBook,
    private readonly inv: Inventory,
    private readonly actions: { toggleTrack(id: BlueprintId): void; close(): void },
  ) {
    this.root.id = 'blueprints';
    this.root.className = 'sv-overlay';
    this.root.innerHTML = `
      <div class="sv-window bp-window">
        <div class="sv-head"><div><div class="sv-title">Blueprints</div><div class="sv-sub bp-count"></div></div><button class="sv-x" data-act="close">✕</button></div>
        <div class="bp-body"><div class="bp-grid"></div><div class="bp-detail"></div></div>
      </div>`;
    this.grid = this.root.querySelector('.bp-grid')!;
    this.detail = this.root.querySelector('.bp-detail')!;
    this.count = this.root.querySelector('.bp-count')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
    parent.appendChild(this.root);
  }

  open(): void {
    this.isOpen = true;
    if (!this.selected) this.selected = BLUEPRINTS.find((b) => this.book.isUnlocked(b.id))?.id ?? null;
    this.root.classList.add('open');
    this.refresh();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  refresh(): void {
    if (!this.isOpen) return;
    const owned = BLUEPRINTS.filter((b) => this.book.isUnlocked(b.id)).length;
    this.count.textContent = `${owned} of ${BLUEPRINTS.length} found · tracking ${this.book.tracked.length}/${CONFIG.blueprints.maxTracked}`;
    this.grid.innerHTML = BLUEPRINTS.map((b) => {
      const unlocked = this.book.isUnlocked(b.id);
      if (!unlocked) {
        return `<div class="bp-card locked" data-bp="${b.id}"><img src="${structureIconUrl(b.id)}"><div class="bp-name">???</div><div class="bp-hint">${this.book.hint(b)}</div></div>`;
      }
      const { ready } = this.book.checklist(this.inv, b.id);
      const comps = b.components.map((c) => `${c.count} ${ITEMS[c.item].name}`).join(' · ');
      return `<div class="bp-card ${b.id === this.selected ? 'sel' : ''} ${ready ? 'ready' : ''}" data-bp="${b.id}">
        ${this.book.isTracked(b.id) ? '<div class="bp-pin">TRACKED</div>' : ''}
        <img src="${structureIconUrl(b.id)}"><div class="bp-name">${b.name}</div><div class="bp-hint">${comps}</div></div>`;
    }).join('');

    const b = this.selected ? blueprintById(this.selected) : null;
    if (!b || !this.book.isUnlocked(b.id)) {
      this.detail.innerHTML = `<div class="bp-empty">Select a blueprint you own to see what it needs.</div>`;
      return;
    }
    const { lines, ready } = this.book.checklist(this.inv, b.id);
    const tracked = this.book.isTracked(b.id);
    const full = !tracked && this.book.tracked.length >= CONFIG.blueprints.maxTracked;
    this.detail.innerHTML = `
      <img class="big" src="${structureIconUrl(b.id)}">
      <div class="d-name">${b.name}</div>
      <div class="d-desc">${b.description}</div>
      <div class="d-ings">${lines
        .map((l) => `<div class="${l.done ? 'ok' : 'short'}"><img src="${itemIconUrl(l.item)}"><span>${ITEMS[l.item].name}</span><b>${l.have}/${l.need}</b></div>`)
        .join('')}</div>
      <div class="bp-note">${ready ? 'You have everything. Track it and press G to build.' : 'Components are made at the Crafting Table.'}</div>
      <button class="sv-btn" data-act="track" ${full ? 'disabled' : ''}>${tracked ? 'Untrack' : full ? `Tracking limit (${CONFIG.blueprints.maxTracked})` : 'Track'}</button>`;
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('[data-bp]');
    if (card) {
      this.selected = card.dataset.bp as BlueprintId;
      this.refresh();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close' || t === this.root) this.actions.close();
    else if (act === 'track' && this.selected) {
      this.actions.toggleTrack(this.selected);
      this.refresh();
    }
  }
}

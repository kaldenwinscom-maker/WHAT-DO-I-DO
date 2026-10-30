// Crafting menu, used both for hand crafting (C) and at a crafting table (E).
// Left: recipes with their ingredients (red when you're short). Right: amount + craft button.
// Bottom: the queue with progress bars.

import { ITEMS } from '../data/items';
import type { Recipe, Station } from '../data/recipes';
import { maxCraftable, recipesFor, type CraftQueue } from '../crafting/Crafting';
import { recipeById } from '../data/recipes';
import type { Inventory } from '../inventory/Inventory';
import { itemIconUrl } from './icons';

export interface CraftingActions {
  craft(recipe: Recipe, count: number): void;
  cancel(index: number): void;
  close(): void;
}

export class CraftingMenu {
  readonly root = document.createElement('div');
  isOpen = false;
  station: Station = 'hand';
  private queue: CraftQueue = [];
  private selected: Recipe | null = null;
  private amount: 1 | 5 | 'max' = 1;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly list: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly queueEl: HTMLElement;
  private pausedNote = '';

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
    private readonly actions: CraftingActions,
  ) {
    this.root.id = 'crafting';
    this.root.className = 'sv-overlay';
    this.root.innerHTML = `
      <div class="sv-window craft-window">
        <div class="sv-head"><div><div class="sv-title"></div><div class="sv-sub"></div></div><button class="sv-x" data-act="close">✕</button></div>
        <div class="craft-body">
          <div class="craft-list"></div>
          <div class="craft-detail"></div>
        </div>
        <div class="craft-queue"></div>
      </div>`;
    this.title = this.root.querySelector('.sv-title')!;
    this.sub = this.root.querySelector('.sv-sub')!;
    this.list = this.root.querySelector('.craft-list')!;
    this.detail = this.root.querySelector('.craft-detail')!;
    this.queueEl = this.root.querySelector('.craft-queue')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
    parent.appendChild(this.root);
  }

  open(station: Station, queue: CraftQueue): void {
    this.station = station;
    this.queue = queue;
    this.isOpen = true;
    this.title.textContent = station === 'hand' ? 'Hand Crafting' : 'Crafting Table';
    this.sub.textContent =
      station === 'hand'
        ? 'Only the basics. Build a Crafting Table for components.'
        : 'Components for blueprints. Crafting continues while you stay near the table.';
    const recipes = recipesFor(station);
    if (!this.selected || this.selected.station !== station) this.selected = recipes[0];
    this.root.classList.add('open');
    this.refresh();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  /** Shown on the queue when crafting is paused (e.g. too far from the table). */
  setPausedNote(note: string): void {
    this.pausedNote = note;
  }

  refresh(): void {
    if (!this.isOpen) return;
    const recipes = recipesFor(this.station);
    this.list.innerHTML = recipes
      .map((r) => {
        const can = maxCraftable(this.inv, r) > 0;
        const ins = r.inputs
          .map((i) => {
            const have = this.inv.count(i.item);
            return `<span class="ing ${have >= i.count ? '' : 'short'}"><img src="${itemIconUrl(i.item)}">${i.count} ${ITEMS[i.item].name}</span>`;
          })
          .join('');
        return `<div class="craft-row ${r === this.selected ? 'sel' : ''} ${can ? '' : 'cant'}" data-recipe="${r.id}">
          <img class="ico" src="${itemIconUrl(r.output.item)}">
          <div class="info"><div class="name">${r.label ?? ITEMS[r.output.item].name}${r.output.count > 1 ? ` <em>×${r.output.count}</em>` : ''}</div><div class="ings">${ins}</div></div>
          <div class="time">${r.time}s</div>
        </div>`;
      })
      .join('');

    const r = this.selected;
    if (r) {
      const max = maxCraftable(this.inv, r);
      const n = this.amount === 'max' ? max : Math.min(this.amount, max);
      this.detail.innerHTML = `
        <img class="big" src="${itemIconUrl(r.output.item)}">
        <div class="d-name">${r.label ?? ITEMS[r.output.item].name}${r.output.count > 1 ? ` ×${r.output.count}` : ''}</div>
        <div class="d-desc">${ITEMS[r.output.item].description}</div>
        <div class="d-ings">${r.inputs
          .map((i) => {
            const have = this.inv.count(i.item);
            return `<div class="${have >= i.count ? 'ok' : 'short'}"><img src="${itemIconUrl(i.item)}"><span>${ITEMS[i.item].name}</span><b>${have}/${i.count}</b></div>`;
          })
          .join('')}</div>
        <div class="d-amt">
          ${([1, 5, 'max'] as const).map((a) => `<button class="amt ${this.amount === a ? 'on' : ''}" data-amt="${a}">${a === 'max' ? `MAX (${max})` : a}</button>`).join('')}
        </div>
        <button class="sv-btn craft-go" data-act="craft" ${n > 0 ? '' : 'disabled'}>${n > 0 ? `Craft ${n} · ${(n * r.time).toFixed(0)}s` : 'Not enough materials'}</button>`;
    }
    this.renderQueue();
  }

  /** Cheap per-frame update of the progress bar only. */
  renderQueue(): void {
    if (!this.isOpen) return;
    if (this.queue.length === 0) {
      this.queueEl.innerHTML = '<div class="q-empty">Queue empty</div>';
      return;
    }
    this.queueEl.innerHTML =
      (this.pausedNote ? `<div class="q-paused">${this.pausedNote}</div>` : '') +
      this.queue
        .map((e, i) => {
          const r = recipeById(e.recipeId)!;
          const frac = i === 0 ? e.progress / r.time : 0;
          return `<div class="q-item"><img src="${itemIconUrl(r.output.item)}"><div class="q-mid"><div class="q-name">${ITEMS[r.output.item].name} <em>×${e.remaining}</em></div><div class="q-bar"><div style="width:${(frac * 100).toFixed(1)}%"></div></div></div><button class="sv-x small" data-cancel="${i}" title="Cancel and refund">✕</button></div>`;
        })
        .join('');
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-recipe]');
    if (row) {
      this.selected = recipeById(row.dataset.recipe!) ?? null;
      this.refresh();
      return;
    }
    const amt = t.closest<HTMLElement>('[data-amt]');
    if (amt) {
      const v = amt.dataset.amt!;
      this.amount = v === 'max' ? 'max' : (Number(v) as 1 | 5);
      this.refresh();
      return;
    }
    const cancel = t.closest<HTMLElement>('[data-cancel]');
    if (cancel) {
      this.actions.cancel(Number(cancel.dataset.cancel));
      this.refresh();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close') this.actions.close();
    else if (act === 'craft' && this.selected) {
      const max = maxCraftable(this.inv, this.selected);
      const n = this.amount === 'max' ? max : Math.min(this.amount, max);
      if (n > 0) this.actions.craft(this.selected, n);
      this.refresh();
    } else if (t === this.root) this.actions.close();
  }
}

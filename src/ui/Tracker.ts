// Right-side checklist for tracked blueprints, plus a small crafting-progress readout.
// Updates live; completed lines turn green; missing components show their raw materials.

import { blueprintById, type BlueprintId } from '../data/blueprints';
import { ITEMS } from '../data/items';
import type { BlueprintBook } from '../crafting/Blueprints';
import type { Inventory } from '../inventory/Inventory';

export interface CraftStatus {
  label: string;
  item: string;
  remaining: number;
  frac: number;
  paused?: string;
}

export class Tracker {
  readonly root = document.createElement('div');
  private lastHtml = '';

  constructor(
    parent: HTMLElement,
    private readonly onUntrack: (id: BlueprintId) => void,
  ) {
    this.root.id = 'tracker';
    this.root.addEventListener('click', (e) => {
      const x = (e.target as HTMLElement).closest<HTMLElement>('[data-untrack]');
      if (x) this.onUntrack(x.dataset.untrack as BlueprintId);
    });
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  update(book: BlueprintBook, inv: Inventory, crafts: CraftStatus[]): void {
    let html = crafts
      .map(
        (c) => `<div class="tr-craft"><div class="tr-craft-top"><span>${c.label}: ${c.item} <em>×${c.remaining}</em></span>${c.paused ? `<span class="paused">${c.paused}</span>` : ''}</div>
          <div class="q-bar"><div style="width:${(c.frac * 100).toFixed(1)}%"></div></div></div>`,
      )
      .join('');
    let firstReady = true;
    for (const id of book.tracked) {
      const bp = blueprintById(id)!;
      const { lines, ready } = book.checklist(inv, id);
      html += `<div class="tr-card ${ready ? 'ready' : ''}">
        <div class="tr-head"><span>${bp.name}</span><button class="sv-x small" data-untrack="${id}" title="Untrack">✕</button></div>
        ${lines
          .map((l) => {
            const raw =
              l.raw && l.raw.length
                ? `<div class="tr-raw">${ITEMS[l.item].name}: needs ${l.raw
                    .map((r) => `<span class="${r.have >= r.need ? 'ok' : ''}">${r.need} ${ITEMS[r.item].name.toLowerCase()} (have ${r.have})</span>`)
                    .join(', ')}</div>`
                : '';
            return `<div class="tr-line ${l.done ? 'done' : ''}"><span>${ITEMS[l.item].name}</span><b>${Math.min(l.have, l.need)}/${l.need}${l.done ? ' ✓' : ''}</b></div>${raw}`;
          })
          .join('')}
        ${ready ? `<div class="tr-ready">READY TO BUILD${firstReady ? ' — press G' : ''}</div>` : ''}
      </div>`;
      if (ready) firstReady = false;
    }
    if (html !== this.lastHtml) {
      this.root.innerHTML = html;
      this.lastHtml = html;
    }
  }
}

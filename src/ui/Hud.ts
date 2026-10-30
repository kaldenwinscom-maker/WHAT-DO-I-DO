// In-game HUD: crosshair + mining ring, phase progress, hotbar, pop-ups.

import { ITEMS, type ItemId } from '../data/items';
import { RARITY_COLORS, type Rarity } from '../data/loot';
import { HOTBAR_SIZE, type Inventory } from '../inventory/Inventory';
import type { MagicBlock } from '../block/MagicBlock';
import { itemIconUrl } from './icons';

const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;
const MAX_TOASTS = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function renderSlot(slot: HTMLElement, stack: { item: ItemId; count: number } | null): void {
  const key = slot.querySelector('.key');
  slot.innerHTML = '';
  if (key) slot.appendChild(key);
  if (!stack) return;
  const img = el('img');
  img.src = itemIconUrl(stack.item);
  img.alt = ITEMS[stack.item].name;
  slot.appendChild(img);
  if (stack.count > 1) slot.appendChild(el('span', 'qty', String(stack.count)));
}

export class Hud {
  readonly root = el('div');
  private ring: SVGCircleElement;
  private phaseName = el('div', 'name');
  private phaseLabel = el('div', 'label');
  private phaseFill = el('div', 'fill');
  private phaseCount = el('div', 'count');
  private hotbarSlots: HTMLElement[] = [];
  private heldName = el('div');
  private heldTimer = 0;
  private toasts = el('div');
  private flash = el('div');
  private hint = el('div');
  private saved = el('div');

  constructor(parent: HTMLElement) {
    this.root.id = 'hud';

    const cross = el('div');
    cross.id = 'crosshair';
    cross.innerHTML = `<svg viewBox="0 0 34 34"><circle class="ring-bg" cx="17" cy="17" r="${RING_R}" style="opacity:0"/><circle class="ring" cx="17" cy="17" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg><div class="dot"></div>`;
    this.ring = cross.querySelector('.ring')!;
    this.root.appendChild(cross);

    const phase = el('div', 'panel nailed');
    phase.id = 'phase';
    const bar = el('div', 'bar metal');
    bar.appendChild(this.phaseFill);
    phase.append(this.phaseLabel, this.phaseName, bar, this.phaseCount);
    this.root.appendChild(phase);

    const wrap = el('div');
    wrap.id = 'hotbar-wrap';
    this.heldName.id = 'held-name';
    const hotbar = el('div', 'panel');
    hotbar.id = 'hotbar';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = el('div', 'slot');
      s.appendChild(el('span', 'key', String(i + 1)));
      hotbar.appendChild(s);
      this.hotbarSlots.push(s);
    }
    wrap.append(this.heldName, hotbar);
    this.root.appendChild(wrap);

    this.toasts.id = 'toasts';
    this.flash.id = 'flash';
    this.hint.id = 'hint';
    this.saved.id = 'saved';
    this.saved.textContent = 'Progress saved';
    this.root.append(this.flash, this.toasts, this.hint, this.saved);
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  setMiningProgress(p: number, magic: boolean): void {
    const bg = this.ring.previousElementSibling as SVGCircleElement;
    bg.style.opacity = p > 0 ? '1' : '0';
    this.ring.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, p))));
    this.ring.style.stroke = magic ? '#c8e07a' : 'var(--accent)';
  }

  updatePhase(magic: MagicBlock): void {
    const pr = magic.phaseProgress;
    this.phaseLabel.textContent = `Phase ${magic.phaseNumber + 1}`;
    this.phaseName.textContent = magic.phase.name;
    this.phaseFill.style.width = `${Math.round(pr.frac * 100)}%`;
    this.phaseFill.style.background = `linear-gradient(180deg, ${magic.phase.palette.vein}, ${magic.phase.palette.base})`;
    this.phaseCount.innerHTML = pr.next
      ? `<span>${pr.done} / ${pr.needed} breaks</span><span>Next: ${pr.next.name}</span>`
      : `<span>${magic.totalBreaks} breaks</span><span>Final phase</span>`;
  }

  updateHotbar(inv: Inventory): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      renderSlot(this.hotbarSlots[i], inv.slots[i]);
      this.hotbarSlots[i].classList.toggle('selected', i === inv.selected);
    }
  }

  showHeldName(inv: Inventory): void {
    const s = inv.selectedStack;
    this.heldName.textContent = s ? ITEMS[s.item].name : '';
    this.heldName.classList.add('show');
    this.heldTimer = 1.6;
  }

  toastItems(rarity: Rarity, items: { item: ItemId; count: number }[], label?: string): void {
    const color = RARITY_COLORS[rarity];
    const t = el('div', `toast panel${label ? ' big' : ''}`);
    t.style.setProperty('--rarity', color);
    const img = el('img');
    img.src = itemIconUrl(items[0].item);
    const text = el('div');
    const title = label ?? `+${items[0].count} ${ITEMS[items[0].item].name}`;
    text.innerHTML = `<div class="t">${title}<span class="tier">${rarity}</span></div>`;
    if (label) text.innerHTML += `<div class="d">${items.map((i) => `${i.count} ${ITEMS[i.item].name}`).join(' · ')}</div>`;
    t.append(img, text);
    this.pushToast(t, label ? 4.5 : 2.6);
  }

  toastEvent(rarity: Rarity, title: string, detail: string): void {
    const t = el('div', 'toast panel big');
    t.style.setProperty('--rarity', rarity === 'junk' ? '#d0583c' : RARITY_COLORS[rarity]);
    t.innerHTML = `<div class="icon-event">!</div><div><div class="t">${title}</div><div class="d">${detail}</div></div>`;
    this.pushToast(t, 4);
  }

  toastInfo(title: string, detail: string, color = '#d8b46a', seconds = 4): void {
    const t = el('div', 'toast panel big');
    t.style.setProperty('--rarity', color);
    t.innerHTML = `<div><div class="t">${title}</div><div class="d">${detail}</div></div>`;
    this.pushToast(t, seconds);
  }

  private pushToast(t: HTMLElement, seconds: number): void {
    this.toasts.prepend(t);
    while (this.toasts.children.length > MAX_TOASTS) this.toasts.lastElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, seconds * 1000);
  }

  damageFlash(): void {
    this.flash.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flash.classList.remove('on')));
  }

  setHint(text: string | null): void {
    this.hint.style.opacity = text ? '1' : '0';
    if (text) this.hint.textContent = text;
  }

  flashSaved(): void {
    this.saved.classList.add('show');
    setTimeout(() => this.saved.classList.remove('show'), 1200);
  }

  update(dt: number): void {
    if (this.heldTimer > 0) {
      this.heldTimer -= dt;
      if (this.heldTimer <= 0) this.heldName.classList.remove('show');
    }
  }
}

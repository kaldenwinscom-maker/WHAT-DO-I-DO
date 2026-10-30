// Day counter (top centre) and health / food / stamina bars (bottom right).

import { CONFIG } from '../config';
import { formatClock, type DayClock } from '../world/DayClock';
import type { Survival } from '../player/Survival';

const ARC_R = 15;
const ARC_C = 2 * Math.PI * ARC_R;

const ICONS = {
  health: '<path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.7 0 5.9 3.8 4.4 7.3C19.5 16.4 12 21 12 21z"/>',
  food: '<path d="M7 2v8a3 3 0 0 0 2 2.8V22h2V12.8A3 3 0 0 0 13 10V2h-1.5v7h-1V2h-1v7h-1V2zM17 2c-2 1.5-3 4-3 7v4h2.5v9h2V2z"/>',
  stamina: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
};

function bar(kind: keyof typeof ICONS, label: string): { root: HTMLElement; fill: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div');
  root.className = `sbar ${kind}`;
  root.innerHTML = `<svg viewBox="0 0 24 24" class="ico">${ICONS[kind]}</svg><div class="track"><div class="fill"></div><div class="lbl">${label}</div></div><div class="val"></div>`;
  return { root, fill: root.querySelector('.fill')!, value: root.querySelector('.val')! };
}

export class SurvivalHud {
  readonly root = document.createElement('div');
  private readonly dayNum: HTMLElement;
  private readonly dayLeft: HTMLElement;
  private readonly dial: SVGCircleElement;
  private readonly sun: SVGGElement;
  private readonly moon: SVGGElement;
  private readonly bars: Record<'health' | 'food' | 'stamina', ReturnType<typeof bar>>;
  private readonly status: HTMLElement;
  private lastDay = -1;

  constructor(parent: HTMLElement) {
    this.root.id = 'survival-hud';
    const day = document.createElement('div');
    day.id = 'daybox';
    day.innerHTML = `
      <svg class="dial" viewBox="0 0 40 40">
        <circle class="dial-bg" cx="20" cy="20" r="${ARC_R}"/>
        <circle class="dial-fill" cx="20" cy="20" r="${ARC_R}" stroke-dasharray="${ARC_C}" stroke-dashoffset="${ARC_C}"/>
        <g class="sun"><circle cx="20" cy="20" r="6"/></g>
        <g class="moon"><path d="M23.5 13.5a7 7 0 1 0 3 9.5 5.5 5.5 0 1 1-3-9.5z"/></g>
      </svg>
      <div class="txt"><div class="num">DAY 1</div><div class="left"></div></div>`;
    this.dayNum = day.querySelector('.num')!;
    this.dayLeft = day.querySelector('.left')!;
    this.dial = day.querySelector('.dial-fill')!;
    this.sun = day.querySelector('.sun')!;
    this.moon = day.querySelector('.moon')!;

    const stats = document.createElement('div');
    stats.id = 'statbars';
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.bars = { health: bar('health', 'Health'), food: bar('food', 'Food'), stamina: bar('stamina', 'Stamina') };
    stats.append(this.status, this.bars.health.root, this.bars.food.root, this.bars.stamina.root);

    this.root.append(day, stats);
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  update(clock: DayClock, s: Survival): void {
    if (clock.day !== this.lastDay) {
      this.lastDay = clock.day;
      this.dayNum.textContent = `DAY ${clock.day}`;
    }
    const night = clock.isNight;
    this.dayLeft.textContent = `${night ? 'Dawn' : 'Nightfall'} in ${formatClock(clock.secondsToChange)}`;
    this.dial.style.strokeDashoffset = String(ARC_C * (1 - clock.halfProgress));
    this.root.classList.toggle('night', night);
    this.sun.style.display = night ? 'none' : '';
    this.moon.style.display = night ? '' : 'none';

    const S = CONFIG.survival;
    this.setBar('health', s.health, S.maxHealth);
    this.setBar('food', s.hunger, S.maxHunger);
    this.setBar('stamina', s.stamina, S.maxStamina);
    this.bars.health.root.classList.toggle('low', s.health < 25);
    this.bars.food.root.classList.toggle('low', s.hunger < 20);
    this.bars.health.root.classList.toggle('regen', s.hunger > S.regenHungerThreshold && !s.sick && s.health < S.maxHealth);

    const tags: string[] = [];
    if (s.sick) tags.push(`<span class="tag sick">Sick ${formatClock(s.sickSeconds)}</span>`);
    if (s.starving) tags.push('<span class="tag starving">Starving</span>');
    if (night) tags.push('<span class="tag cold">Cold</span>');
    const html = tags.join('');
    if (this.status.innerHTML !== html) this.status.innerHTML = html;
  }

  private setBar(kind: 'health' | 'food' | 'stamina', v: number, max: number): void {
    const b = this.bars[kind];
    b.fill.style.width = `${(Math.max(0, v) / max) * 100}%`;
    b.value.textContent = String(Math.ceil(v));
  }
}

// Shown when the player dies. Runs are permanent: the save is wiped and only records remain.

import type { Records, RunSummary } from '../save/Records';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export class GameOver {
  readonly root = document.createElement('div');

  constructor(parent: HTMLElement, onNewRun: () => void) {
    this.root.id = 'gameover';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="new"]')) onNewRun();
    });
  }

  show(run: RunSummary, records: Records, newBest: boolean): void {
    const days = run.daysSurvived;
    this.root.innerHTML = `
      <div class="go-card">
        <div class="go-title">You died</div>
        <div class="go-days">You survived <b>${days}</b> day${days === 1 ? '' : 's'}</div>
        <div class="go-cause">${run.cause} · Day ${run.diedOnDay}</div>
        ${newBest ? '<div class="go-best new">New record</div>' : `<div class="go-best">Best: ${records.bestDays} day${records.bestDays === 1 ? '' : 's'}</div>`}
        <div class="go-stats">
          <div><span>Monolith breaks</span><b>${run.breaks}</b></div>
          <div><span>Animals raised</span><b>${run.animalsRaised}</b></div>
          <div><span>Structures built</span><b>${run.structuresBuilt}</b></div>
          <div><span>Time played</span><b>${fmtTime(run.playSeconds)}</b></div>
        </div>
        <button class="btn metal" data-act="new">Start a new run</button>
      </div>`;
    this.root.classList.add('open');
  }

  hide(): void {
    this.root.classList.remove('open');
  }
}

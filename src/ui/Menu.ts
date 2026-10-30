// Title / pause overlay. A fuller start menu and settings arrive in the polish milestone.

export interface MenuActions {
  onPlay(): void;
  onNewWorld(): void;
}

export class Menu {
  readonly root = document.createElement('div');
  private playBtn: HTMLButtonElement;
  private stats: HTMLElement;
  isOpen = false;

  constructor(parent: HTMLElement, actions: MenuActions) {
    this.root.id = 'menu';
    this.root.innerHTML = `
      <div class="card panel nailed">
        <h1>Last Block</h1>
        <div class="sub">One block. One sky. Survive.</div>
        <button class="btn metal" data-act="play">Play</button>
        <button class="btn metal danger" data-act="new">New World</button>
        <div class="controls">
          <kbd>W A S D</kbd><span>Move</span>
          <kbd>Mouse</kbd><span>Look</span>
          <kbd>Space</kbd><span>Jump</span>
          <kbd>Shift</kbd><span>Sprint</span>
          <kbd>Option / Z</kbd><span>Crouch (won't walk off edges)</span>
          <kbd>Left click</kbd><span>Hold to mine / break</span>
          <kbd>Right click</kbd><span>Place block (or Ctrl + click)</span>
          <kbd>1-9 / Scroll</kbd><span>Select hotbar slot</span>
          <kbd>E</kbd><span>Inventory</span>
          <kbd>Esc</kbd><span>Pause</span>
        </div>
        <div class="stats"></div>
      </div>`;
    this.playBtn = this.root.querySelector('[data-act="play"]')!;
    this.stats = this.root.querySelector('.stats')!;
    this.playBtn.addEventListener('click', () => actions.onPlay());
    this.root.querySelector('[data-act="new"]')!.addEventListener('click', () => {
      if (confirm('Start a new world? Your current island will be lost.')) actions.onNewWorld();
    });
    parent.appendChild(this.root);
  }

  open(mode: 'title' | 'pause', stats?: string): void {
    this.isOpen = true;
    this.playBtn.textContent = mode === 'title' ? 'Play' : 'Resume';
    this.stats.textContent = stats ?? '';
    this.root.classList.add('open');
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }
}

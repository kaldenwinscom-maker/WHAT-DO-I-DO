// Keyboard + mouse state, with pointer lock for mouse look.

export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  leftDown = false;
  rightDown = false;
  /** True for one frame after the right button goes down. */
  rightPressed = false;
  leftPressed = false;
  /** Discrete key presses (e.code), e.g. for opening menus. */
  onKeyDown: ((code: string, e: KeyboardEvent) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isLocked && (e.code === 'Space' || e.code.startsWith('Arrow') || e.altKey)) e.preventDefault();
      if (!e.repeat) this.onKeyDown?.(e.code, e);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      // On a Mac trackpad, Ctrl+click is the usual right-click.
      if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        this.rightDown = true;
        this.rightPressed = true;
      } else if (e.button === 0) {
        this.leftDown = true;
        this.leftPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.leftDown = false;
        this.rightDown = false; // releases a Ctrl+click "right" press too
      }
      if (e.button === 2) this.rightDown = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener(
      'wheel',
      (e) => {
        if (!this.isLocked) return;
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      if (!this.isLocked) this.reset();
      this.onLockChange?.(this.isLocked);
    });
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    const req = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
    // Some browsers reject if called too soon after an unlock; ignore, the user can click again.
    req?.catch?.(() => {});
  }

  unlock(): void {
    if (this.isLocked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.leftPressed = false;
    this.rightPressed = false;
  }

  reset(): void {
    this.keys.clear();
    this.leftDown = this.rightDown = false;
    this.leftPressed = this.rightPressed = false;
    this.mouseDX = this.mouseDY = 0;
  }
}

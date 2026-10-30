// Wires every system together and runs the main loop.

import * as THREE from 'three';
import { CONFIG } from '../config';
import { BLOCKS } from '../data/blocks';
import { ITEMS, type ItemId } from '../data/items';
import { RARITY_COLORS, STARTER_DROPS, type Rarity } from '../data/loot';
import { World, type RayHit } from '../world/World';
import { Sky } from '../world/Sky';
import { getMagicTextures, getTextureCanvas, makeCrackTextures, setMaxAnisotropy } from '../world/textures';
import { MagicBlock, MAGIC_POS } from '../block/MagicBlock';
import { rollLoot, type LootResult } from '../loot/LootRoller';
import { runLootEvent } from '../loot/events';
import { HOTBAR_SIZE, Inventory } from '../inventory/Inventory';
import { Player } from '../player/Player';
import { Input } from '../player/Input';
import { Hand } from '../player/Hand';
import { Particles } from '../fx/Particles';
import { Sfx } from '../audio/Sfx';
import { Hud } from '../ui/Hud';
import { InventoryScreen } from '../ui/InventoryScreen';
import { Menu } from '../ui/Menu';
import { makePanelNoiseDataUrl } from '../world/textures';
import { SaveManager, type SaveData } from '../save/SaveManager';

type State = 'menu' | 'playing' | 'inventory';

const PLACE_REPEAT = 0.22;
const HIT_SOUND_INTERVAL = 0.24;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly timer = new THREE.Timer();

  private readonly world = new World();
  private readonly sky: Sky;
  private readonly magic = new MagicBlock();
  private readonly player: Player;
  private readonly input: Input;
  private readonly hand: Hand;
  private readonly particles = new Particles();
  private readonly sfx = new Sfx();
  private readonly inventory = new Inventory();
  private readonly hud: Hud;
  private readonly invScreen: InventoryScreen;
  private readonly menu: Menu;
  private readonly saves = new SaveManager();

  private readonly highlight: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private readonly crackTextures = makeCrackTextures(6);

  private state: State = 'menu';
  private target: RayHit | null = null;
  private mineKey: string | null = null;
  private mineProgress = 0;
  private hitSoundTimer = 0;
  private placeTimer = 0;
  private starterIndex = 0;
  private playSeconds = 0;
  private saveTimer = 0;
  private readonly tmpDir = new THREE.Vector3();

  constructor(container: HTMLElement) {
    document.documentElement.style.setProperty('--panel-noise', `url(${makePanelNoiseDataUrl()})`);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.graphics.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.scene.add(this.camera);
    this.sky = new Sky(this.scene);
    this.scene.add(this.world.group, this.magic.mesh, this.particles.mesh);

    this.player = new Player(this.camera);
    this.hand = new Hand(this.camera);
    this.input = new Input(this.renderer.domElement);

    // Target outline + crack overlay.
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x15100b, transparent: true, opacity: 0.55 }),
    );
    this.highlight.visible = false;
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }),
    );
    this.crack.visible = false;
    this.scene.add(this.highlight, this.crack);

    // UI.
    this.hud = new Hud(document.body);
    this.invScreen = new InventoryScreen(document.body, this.inventory);
    this.menu = new Menu(document.body, {
      onPlay: () => this.resume(),
      onNewWorld: () => {
        this.newWorld();
        this.resume();
      },
    });

    this.inventory.onChange = () => {
      this.hud.updateHotbar(this.inventory);
      this.invScreen.refresh();
      this.hand.setItem(this.inventory.selectedStack?.item ?? null);
    };

    this.bindInput();
    this.bindPersistence();
    window.addEventListener('resize', () => this.onResize());

    if (!this.loadGame()) this.newWorld();
    this.hud.updatePhase(this.magic);
    this.hud.updateHotbar(this.inventory);
    this.hand.setItem(this.inventory.selectedStack?.item ?? null);
    this.menu.open('title', this.statsLine());
    this.hud.visible = false;

    this.timer.connect(document);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- state

  private resume(): void {
    this.sfx.unlock();
    this.input.lock();
  }

  private setState(s: State): void {
    this.state = s;
    this.hud.visible = s !== 'menu';
    if (s === 'menu') this.menu.open(this.playSeconds > 0 ? 'pause' : 'title', this.statsLine());
    else this.menu.close();
    if (s === 'inventory') this.invScreen.open();
    else if (this.invScreen.isOpen) this.invScreen.close();
  }

  private statsLine(): string {
    const mins = Math.floor(this.playSeconds / 60);
    return `${this.magic.totalBreaks} breaks · ${this.world.size} blocks · ${mins} min played`;
  }

  private bindInput(): void {
    this.input.onLockChange = (locked) => {
      if (locked) this.setState('playing');
      else if (this.state === 'playing') {
        this.setState('menu');
        this.saveGame();
      }
    };
    document.addEventListener('pointerlockerror', () => {
      if (this.state !== 'inventory') this.setState('menu');
    });

    this.input.onKeyDown = (code) => {
      if (code === 'KeyE') {
        if (this.state === 'playing') {
          this.state = 'inventory'; // set first so the unlock doesn't open the pause menu
          this.input.unlock();
          this.setState('inventory');
        } else if (this.state === 'inventory') {
          this.input.lock();
        }
        return;
      }
      if (code === 'Escape' && this.state === 'inventory') {
        this.setState('menu');
        return;
      }
      if (this.state !== 'playing') return;
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= HOTBAR_SIZE) this.selectSlot(n - 1);
      }
    };

    // While the inventory is open, clicking outside the panel resumes play.
    this.invScreen.root.addEventListener('mousedown', (e) => {
      if (e.target === this.invScreen.root) this.input.lock();
    });
  }

  private selectSlot(i: number): void {
    this.inventory.select(i);
    this.hud.showHeldName(this.inventory);
    this.sfx.click();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------- loop

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    if (this.state !== 'menu') this.update(dt);
    this.sky.update(dt, this.camera.position);
    this.magic.update(dt, this.mineKey === this.magicKey ? this.mineProgress : 0);
    this.particles.update(dt);
    this.world.update();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private get magicKey(): string {
    return `${MAGIC_POS.x},${MAGIC_POS.y},${MAGIC_POS.z}`;
  }

  private update(dt: number): void {
    const playing = this.state === 'playing';
    this.playSeconds += dt;

    if (playing) {
      const [dx, dy] = this.input.consumeMouse();
      this.player.look(dx, dy);
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) this.selectSlot(this.inventory.selected + wheel);
    }

    this.player.update(dt, playing ? this.input : null, this.world);
    if (this.player.position.y < CONFIG.player.voidY) this.respawn();

    if (playing) this.updateInteraction(dt);
    else this.clearMining();

    const moving = this.player.onGround ? Math.min(1, Math.hypot(this.player.velocity.x, this.player.velocity.z) / 4) : 0;
    this.hand.update(dt, moving);
    this.hud.update(dt);
    this.updateHint();

    this.saveTimer += dt;
    if (this.saveTimer >= CONFIG.save.autoSaveSeconds) {
      this.saveTimer = 0;
      if (this.saveGame()) this.hud.flashSaved();
    }
  }

  // ---------------------------------------------------------------- mining & building

  private updateInteraction(dt: number): void {
    const dir = this.player.lookDirection(this.tmpDir);
    this.target = this.world.raycast(this.camera.position, dir, CONFIG.player.reach);
    const t = this.target;

    this.highlight.visible = !!t;
    if (t) this.highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);

    // ---- mining (hold left) ----
    if (t && this.input.leftDown) {
      const k = `${t.x},${t.y},${t.z}`;
      if (k !== this.mineKey) {
        this.mineKey = k;
        this.mineProgress = 0;
        this.hitSoundTimer = 0;
      }
      const time = t.id === 'magic' ? CONFIG.mining.magicBlockTime : BLOCKS[t.id].hardness;
      this.mineProgress += dt / time;
      this.hitSoundTimer -= dt;
      if (this.hitSoundTimer <= 0) {
        this.hitSoundTimer = HIT_SOUND_INTERVAL;
        this.sfx.hit(BLOCKS[t.id].sound);
        this.particles.burst(t.x, t.y, t.z, this.blockCanvas(t), 2, 1.5);
      }
      this.hand.setMining(true);
      if (this.mineProgress >= 1) {
        if (t.id === 'magic') this.breakMagic();
        else this.breakBlock(t);
        this.mineKey = null;
        this.mineProgress = 0;
      }
    } else {
      this.clearMining();
    }

    // Crack overlay.
    if (t && this.mineKey && this.mineProgress > 0) {
      const stage = Math.min(this.crackTextures.length - 1, Math.floor(this.mineProgress * this.crackTextures.length));
      const mat = this.crack.material as THREE.MeshBasicMaterial;
      if (mat.map !== this.crackTextures[stage]) {
        mat.map = this.crackTextures[stage];
        mat.needsUpdate = true;
      }
      this.crack.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      this.crack.scale.copy(t.id === 'magic' ? this.magic.mesh.scale : new THREE.Vector3(1, 1, 1));
      this.crack.visible = true;
    } else {
      this.crack.visible = false;
    }
    this.hud.setMiningProgress(this.mineKey ? this.mineProgress : 0, t?.id === 'magic');

    // ---- placing (right click, repeats while held) ----
    this.placeTimer -= dt;
    if (t && (this.input.rightPressed || (this.input.rightDown && this.placeTimer <= 0))) {
      this.placeTimer = PLACE_REPEAT;
      this.tryPlace(t);
    }
  }

  private clearMining(): void {
    this.mineKey = null;
    this.mineProgress = 0;
    this.crack.visible = false;
    this.hand.setMining(false);
    this.hud.setMiningProgress(0, false);
    if (this.state !== 'playing') this.highlight.visible = false;
  }

  private blockCanvas(t: { id: keyof typeof BLOCKS }): HTMLCanvasElement {
    return t.id === 'magic' ? getMagicTextures(this.magic.phase).canvas : getTextureCanvas(BLOCKS[t.id].textures.side);
  }

  private breakBlock(t: RayHit): void {
    const def = BLOCKS[t.id];
    this.world.remove(t.x, t.y, t.z);
    this.particles.burst(t.x, t.y, t.z, this.blockCanvas(t), 16, 3);
    this.sfx.breakBlock(def.sound);
    if (def.drop) this.give(def.drop, 1);
  }

  private tryPlace(t: RayHit): void {
    const stack = this.inventory.selectedStack;
    if (!stack) return;
    const blockId = ITEMS[stack.item].places;
    if (!blockId) return;
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    if (this.world.isSolid(x, y, z) || this.player.overlapsBlock(x, y, z)) return;
    this.world.set(x, y, z, blockId);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.sfx.place();
    this.hand.triggerSwing();
  }

  /** Adds items to the inventory, warning if some didn't fit. */
  private give(item: ItemId, count: number): void {
    const left = this.inventory.add(item, count);
    if (left > 0) this.hud.toastInfo('Inventory full', `${left} ${ITEMS[item].name} fell into the void.`, '#d0583c', 3);
  }

  // ---------------------------------------------------------------- the magic block

  private breakMagic(): void {
    const phaseUp = this.magic.registerBreak();
    this.particles.burst(MAGIC_POS.x, MAGIC_POS.y, MAGIC_POS.z, getMagicTextures(this.magic.phase).canvas, 22, 4);
    this.sfx.magicBreak();

    let result: LootResult;
    if (this.starterIndex < STARTER_DROPS.length) {
      const d = STARTER_DROPS[this.starterIndex++];
      result = { kind: 'items', rarity: 'common', items: [{ item: d.item, count: d.count }] };
    } else {
      result = rollLoot(this.magic.phaseNumber);
    }

    if (result.kind === 'items') {
      for (const i of result.items) this.give(i.item, i.count);
      this.hud.toastItems(result.rarity, result.items, result.label);
      this.sfx.drop(result.rarity);
    } else {
      this.applyEvent(result.event, result.rarity);
    }

    if (phaseUp) {
      const p = this.magic.phase;
      this.hud.toastInfo(`Phase ${this.magic.phaseNumber + 1}: ${p.name}`, 'The block shifts. New things stir inside it.', p.palette.vein, 6);
      this.sfx.phaseUp();
    }
    this.hud.updatePhase(this.magic);
  }

  private applyEvent(event: Parameters<typeof runLootEvent>[0], rarity: Rarity): void {
    const outcome = runLootEvent(event, {
      inventory: this.inventory,
      world: this.world,
      playerPosition: this.player.position,
      knockPlayer: (v) => this.player.knock(v),
      onBlockRemoved: (x, y, z) => this.particles.burst(x, y, z, getTextureCanvas('dirt'), 18, 3),
    });
    this.hud.toastEvent(rarity, outcome.title, outcome.detail);
    if (outcome.sound !== 'dud') this.hud.damageFlash();
    this.sfx[outcome.sound]();
  }

  // ---------------------------------------------------------------- falling & respawn

  private respawn(): void {
    const lossFrac = CONFIG.player.respawnItemLoss;
    const lost = new Map<ItemId, number>();
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const s = this.inventory.slots[i];
      if (!s) continue;
      // Lose a fraction of each stack; the fractional part is a dice roll, so a single item can survive.
      const exact = s.count * lossFrac;
      const n = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
      if (n <= 0) continue;
      this.inventory.slots[i] = s.count - n > 0 ? { item: s.item, count: s.count - n } : null;
      lost.set(s.item, (lost.get(s.item) ?? 0) + n);
    }
    this.inventory.changed();
    const [x, y, z] = this.spawnPoint();
    this.player.teleport(x, y, z);
    this.sfx.fall();
    const list = [...lost].slice(0, 4).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ');
    this.hud.toastInfo('Lost to the void', list ? `You lost ${list}${lost.size > 4 ? '…' : '.'}` : 'You had nothing to lose.', RARITY_COLORS.junk, 5);
    this.hud.damageFlash();
  }

  /** Top of the column above the magic block, where there's room to stand. */
  private spawnPoint(): [number, number, number] {
    let y = MAGIC_POS.y + 1;
    while (this.world.isSolid(MAGIC_POS.x, y, MAGIC_POS.z) || this.world.isSolid(MAGIC_POS.x, y + 1, MAGIC_POS.z)) y++;
    return [MAGIC_POS.x + 0.5, y, MAGIC_POS.z + 0.5];
  }

  // ---------------------------------------------------------------- hints

  private updateHint(): void {
    let hint: string | null = null;
    if (this.state === 'playing') {
      const hasBlock = this.inventory.slots.some((s) => s && ITEMS[s.item].places);
      if (this.magic.totalBreaks === 0) hint = 'Look down and hold LEFT CLICK on the glowing block';
      else if (this.world.size === 1 && hasBlock) hint = 'Pick a block (1-9) and RIGHT CLICK a face of the block to place it';
      else if (this.magic.totalBreaks < 8 && this.world.size < 4) hint = 'Keep breaking the block. Hold OPTION or Z to crouch safely at edges';
    }
    this.hud.setHint(hint);
  }

  // ---------------------------------------------------------------- save / load

  private bindPersistence(): void {
    window.addEventListener('beforeunload', () => this.saveGame());
    window.addEventListener('pagehide', () => this.saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveGame();
    });
  }

  private snapshot(): SaveData {
    const p = this.player;
    return {
      version: 1,
      savedAt: Date.now(),
      playSeconds: this.playSeconds,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch },
      inventory: this.inventory.serialize(),
      world: this.world.serialize(),
      magic: { breaks: this.magic.totalBreaks, starterIndex: this.starterIndex },
    };
  }

  private saveGame(): boolean {
    return this.saves.write(this.snapshot());
  }

  private loadGame(): boolean {
    const data = this.saves.load();
    if (!data) return false;
    this.world.load(data.world);
    // The magic block must always exist.
    this.world.set(MAGIC_POS.x, MAGIC_POS.y, MAGIC_POS.z, 'magic');
    this.inventory.load(data.inventory);
    this.magic.totalBreaks = data.magic.breaks;
    this.starterIndex = data.magic.starterIndex ?? STARTER_DROPS.length;
    this.playSeconds = data.playSeconds ?? 0;
    const p = data.player;
    if (p.y < CONFIG.player.voidY + 5) {
      const [x, y, z] = this.spawnPoint();
      this.player.teleport(x, y, z);
    } else {
      this.player.teleport(p.x, p.y, p.z);
    }
    this.player.yaw = p.yaw;
    this.player.pitch = p.pitch;
    this.player.update(0, null, this.world); // place the camera
    return true;
  }

  private newWorld(): void {
    this.saves.clear();
    this.world.clear();
    this.world.set(MAGIC_POS.x, MAGIC_POS.y, MAGIC_POS.z, 'magic');
    this.inventory.load({ slots: [], selected: 0 });
    this.magic.totalBreaks = 0;
    this.starterIndex = 0;
    this.playSeconds = 0;
    this.saveTimer = 0;
    const [x, y, z] = this.spawnPoint();
    this.player.teleport(x, y, z);
    this.player.yaw = Math.PI * 0.25;
    this.player.pitch = -0.55;
    this.player.update(0, null, this.world);
    this.hud.updatePhase(this.magic);
    this.saveGame();
  }
}

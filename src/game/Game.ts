// Wires every system together and runs the main loop.

import * as THREE from 'three';
import { CONFIG } from '../config';
import { ITEMS, type ItemId } from '../data/items';
import { RARITY_COLORS, STARTER_DROPS, type Rarity } from '../data/loot';
import { Assets } from '../render/Assets';
import { PostFX } from '../render/PostFX';
import { resolveQuality, type QualitySettings } from '../render/quality';
import { makeTriplanarMaterial } from '../render/triplanar';
import { Island, makeGrass, makeStones, windUniforms } from '../world/Island';
import { Physics } from '../world/Physics';
import { Sky } from '../world/Sky';
import { rng } from '../world/noise';
import { Monolith } from '../block/Monolith';
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
import { makePanelNoiseDataUrl } from '../ui/panelNoise';
import { SaveManager, type LegacyBlock, type RunStats, type SaveData } from '../save/SaveManager';
import { loadRecords, recordRun } from '../save/Records';
import { DayClock } from '../world/DayClock';
import { NightEvents } from '../world/nightEvents';
import { Survival } from '../player/Survival';
import { SurvivalHud } from '../ui/SurvivalHud';
import { GameOver } from '../ui/GameOver';
import { Structures, type PlacedStructure } from '../build/Structures';
import { Placer } from '../build/Placer';
import { BlueprintBook } from '../crafting/Blueprints';
import { cancel as cancelCraft, enqueue, queueProgress, sanitizeQueue, tickQueue, type CraftQueue } from '../crafting/Crafting';
import { BLUEPRINTS, blueprintById, type BlueprintId } from '../data/blueprints';
import { STRUCTURES, type StructureId } from '../data/structures';
import type { Recipe } from '../data/recipes';
import { CraftingMenu } from '../ui/CraftingMenu';
import { BlueprintMenu } from '../ui/BlueprintMenu';
import { Tracker, type CraftStatus } from '../ui/Tracker';
import { DebugPanel } from '../ui/DebugPanel';
import { structureIconUrl } from '../ui/icons';

type Overlay = 'inventory' | 'crafting' | 'blueprints' | 'debug';
type State = 'menu' | 'playing' | Overlay | 'dead';
const OVERLAYS: readonly State[] = ['inventory', 'crafting', 'blueprints', 'debug'];
const isOverlay = (s: State): s is Overlay => OVERLAYS.includes(s);

interface MonolithTarget {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export class Game {
  private readonly quality: QualitySettings;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly timer = new THREE.Timer();
  private readonly post: PostFX;

  private readonly physics = new Physics();
  private readonly sky: Sky;
  private readonly island: Island;
  private readonly monolith: Monolith;
  private readonly particles: Particles;
  private readonly player: Player;
  private readonly input: Input;
  private readonly hand: Hand;
  private readonly sfx = new Sfx();
  private readonly inventory = new Inventory();
  private readonly hud: Hud;
  private readonly invScreen: InventoryScreen;
  private readonly menu: Menu;
  private readonly saves = new SaveManager();
  private readonly clock = new DayClock();
  private readonly survival = new Survival();
  private readonly nightEvents = new NightEvents();
  private readonly survivalHud: SurvivalHud;
  private readonly gameOver: GameOver;
  private stats: RunStats = { animalsRaised: 0, structuresBuilt: 0 };
  private eatCooldown = 0;
  private readonly structures: Structures;
  private readonly placer: Placer;
  private readonly book = new BlueprintBook();
  private handQueue: CraftQueue = [];
  /** The crafting table whose menu is open (null = hand crafting). */
  private openTable: PlacedStructure | null = null;
  private readonly craftMenu: CraftingMenu;
  private readonly bpMenu: BlueprintMenu;
  private readonly tracker: Tracker;
  private readonly debug: DebugPanel;
  /** Suppress big unlock banners while loading / starting a run. */
  private quietUnlocks = false;
  private readonly torchLight = new THREE.PointLight(0xff9a48, 0, 14, 1.6);
  private torchBurn = 0;
  private menuRefreshTimer = 0;

  private state: State = 'menu';
  private target: MonolithTarget | null = null;
  private mineProgress = 0;
  private hitTimer = 0;
  private starterIndex = 0;
  private playSeconds = 0;
  private saveTimer = 0;
  private buildNoticeTimer = 0;
  private legacyBlocks: LegacyBlock[] = [];
  /** Shown the first time the player enters the game this session. */
  private pendingNotice: { title: string; detail: string } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpDir = new THREE.Vector3();
  private lookDX = 0;
  private lookDY = 0;

  constructor(container: HTMLElement) {
    document.documentElement.style.setProperty('--panel-noise', `url(${makePanelNoiseDataUrl()})`);
    this.quality = resolveQuality();

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 1500);
    this.scene.add(this.camera);

    // Image-based ambient light from the HDRI.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(Assets.skyHdr!).texture;
    pmrem.dispose();
    this.sky = new Sky(this.scene, Assets.skyHdr!, this.quality);

    // ---- the island and its dressing ----
    const islandMat = makeTriplanarMaterial({
      base: { set: 'rock_face', scale: 0.26, tint: '#8f8a80', normalStrength: 1.2 },
      top: { set: 'forrest_ground_01', scale: 0.32, tint: '#a39684', amount: 1, threshold: 0.5 },
    });
    this.island = new Island({ seed: 12, radius: 5.4, depth: 7, bumpiness: 0.2 }, islandMat);
    this.physics.terrains.push(this.island);
    this.scene.add(this.island.mesh);

    const groundY = this.island.heightAt(0, 0) ?? 0;
    this.monolith = new Monolith(groundY);
    this.physics.colliders.push(this.monolith.collider);
    this.scene.add(this.monolith.mesh);

    const avoid = [{ x: 0, z: 0, r: 1.45 }];
    this.scene.add(makeGrass(this.island, this.quality.grassBlades, avoid));
    const pebbleMat = makeTriplanarMaterial({ base: { set: 'rock_face', scale: 1.2, tint: '#8f8d88' } });
    this.scene.add(makeStones(this.island, 40, pebbleMat, avoid));
    this.addDistantIslets(islandMat);

    this.structures = new Structures(this.physics);
    this.scene.add(this.structures.group);
    const groundAt = (x: number, z: number) => this.island.heightAt(x, z);
    this.placer = new Placer(this.structures, [this.island.mesh], groundAt);
    this.scene.add(this.placer.group);

    this.particles = new Particles(this.physics, this.monolith.phase.look);
    this.monolith.onPhaseLook = (look) => this.particles.setLook(look);
    this.scene.add(this.particles.group);

    this.player = new Player(this.camera);
    this.hand = new Hand(this.camera);
    this.torchLight.position.set(0.35, -0.1, -0.5);
    this.torchLight.castShadow = false;
    this.camera.add(this.torchLight);
    this.input = new Input(this.renderer.domElement);
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);

    // ---- UI ----
    this.hud = new Hud(document.body);
    this.invScreen = new InventoryScreen(document.body, this.inventory);
    this.survivalHud = new SurvivalHud(document.body);
    this.gameOver = new GameOver(document.body, () => {
      this.gameOver.hide();
      this.newWorld();
      // Back to the menu state; capturing the mouse then drops straight into play.
      this.setState('menu');
      this.resume();
    });
    this.menu = new Menu(document.body, {
      onPlay: () => this.resume(),
      onNewWorld: () => {
        this.newWorld();
        this.resume();
      },
    });
    this.craftMenu = new CraftingMenu(document.body, this.inventory, {
      craft: (recipe, n) => this.queueCraft(recipe, n),
      cancel: (i) => {
        cancelCraft(this.inventory, this.activeQueue(), i);
        this.sfx.click();
      },
      close: () => this.closeOverlay(),
    });
    this.bpMenu = new BlueprintMenu(document.body, this.book, this.inventory, {
      toggleTrack: (id) => this.toggleTrack(id),
      close: () => this.closeOverlay(),
    });
    this.tracker = new Tracker(document.body, (id) => this.toggleTrack(id));
    this.debug = new DebugPanel(document.body, {
      give: (item, n) => this.give(item, n),
      giveKit: () => {
        for (const [id, n] of [['log', 40], ['stone', 40], ['fiber', 40], ['iron_ore', 12], ['flint', 2], ['berries', 10]] as const) this.give(id, n);
      },
      giveComponents: () => {
        for (const [id, n] of [['planks', 30], ['stick', 20], ['rope', 10], ['cloth', 10], ['stone_brick', 20], ['nails', 20], ['hinge', 5], ['wood_frame', 3], ['beam', 2]] as const)
          this.give(id, n);
      },
      unlockAll: () => {
        for (const b of BLUEPRINTS) this.book.unlock(b.id, 'Debug');
        this.bpMenu.refresh();
      },
      nextDay: () => {
        this.clock.advance(this.clock.cycleLength - this.clock.seconds + 0.01);
        this.sky.setTimeOfDay(this.clock.skyTime);
      },
      heal: () => {
        this.survival.health = CONFIG.survival.maxHealth;
        this.survival.hunger = CONFIG.survival.maxHunger;
        this.survival.stamina = CONFIG.survival.maxStamina;
        this.survival.sickSeconds = 0;
      },
      close: () => this.closeOverlay(),
    });
    this.book.onUnlock = (bp, source) => {
      this.bpMenu.refresh();
      if (this.quietUnlocks) return;
      this.hud.banner('NEW BLUEPRINT', bp.name, `${source} · press B to view`, structureIconUrl(bp.id));
      this.sfx.phaseUp();
    };
    this.inventory.onChange = () => {
      this.hud.updateHotbar(this.inventory);
      this.invScreen.refresh();
      this.craftMenu.refresh();
      this.bpMenu.refresh();
      this.hand.setItem(this.inventory.selectedStack?.item ?? null);
    };

    this.bindSurvival();
    this.bindInput();
    this.bindPersistence();
    window.addEventListener('resize', () => this.onResize());

    if (!this.loadGame()) this.newWorld();
    const timeParam = Number(new URLSearchParams(location.search).get('time'));
    if (timeParam > 0 && timeParam < 1) {
      this.clock.setSkyTime(timeParam);
      this.nightEvents.sync(this.clock.isNight);
    }
    this.sky.setTimeOfDay(this.clock.skyTime);
    this.hud.updatePhase(this.monolith);
    this.hud.updateHotbar(this.inventory);
    this.hand.setItem(this.inventory.selectedStack?.item ?? null);
    this.menu.open('title', this.statsLine(), loadRecords().bestDays);
    this.hud.visible = false;
    this.survivalHud.visible = false;
    this.tracker.visible = false;

    this.timer.connect(document);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private addDistantIslets(material: THREE.Material): void {
    const r = rng(2024);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + r() * 0.5;
      const dist = 70 + r() * 150;
      const islet = new Island(
        {
          seed: 100 + i,
          radius: 6 + r() * 10,
          depth: 4 + r() * 7,
          bumpiness: 0.4 + r() * 0.6,
          segments: 48,
          position: { x: Math.cos(ang) * dist, y: -25 + r() * 30, z: Math.sin(ang) * dist },
        },
        material,
      );
      islet.mesh.castShadow = false;
      islet.mesh.rotation.y = r() * Math.PI;
      this.scene.add(islet.mesh);
    }
  }

  // ---------------------------------------------------------------- state

  private resume(): void {
    this.sfx.unlock();
    this.input.lock();
  }

  private setState(s: State): void {
    this.state = s;
    const inGame = s === 'playing' || isOverlay(s);
    this.hud.visible = inGame;
    this.survivalHud.visible = inGame;
    this.tracker.visible = inGame;
    if (s !== 'playing') {
      this.hud.setPrompt(null);
      this.placer.cancel();
    }
    if (s !== 'crafting' && this.craftMenu.isOpen) this.craftMenu.close();
    if (s !== 'blueprints' && this.bpMenu.isOpen) this.bpMenu.close();
    if (s !== 'debug' && this.debug.isOpen) this.debug.close();
    if (s === 'blueprints') this.bpMenu.open();
    if (s === 'debug') this.debug.open();
    if (s === 'menu') this.menu.open(this.playSeconds > 0 ? 'pause' : 'title', this.statsLine(), loadRecords().bestDays);
    else this.menu.close();
    if (s === 'playing' && this.pendingNotice) {
      this.hud.toastInfo(this.pendingNotice.title, this.pendingNotice.detail, '#c8b890', 10);
      this.pendingNotice = null;
    }
    if (s === 'inventory') this.invScreen.open();
    else if (this.invScreen.isOpen) this.invScreen.close();
  }

  private statsLine(): string {
    const mins = Math.floor(this.playSeconds / 60);
    return `Day ${this.clock.day} · ${this.monolith.totalBreaks} breaks · ${mins} min played · graphics: ${this.quality.level}`;
  }

  private bindSurvival(): void {
    this.survival.onDamage = (amount) => {
      if (amount >= 2) {
        this.hud.damageFlash();
        this.player.shake(Math.min(0.6, amount / 40));
      }
    };
    this.survival.onDeath = (cause) => this.die(cause);
    this.clock.onSunset = () => {
      this.hud.toastInfo('Night falls', 'It is getting dark and cold. Food burns faster and you tire sooner.', '#8aa0c8', 6);
    };
    this.clock.onSunrise = (day) => {
      this.hud.toastInfo(`Day ${day}`, `You made it through the night.`, '#f0c070', 6);
      this.sfx.phaseUp();
      this.book.applyDayUnlocks(day);
    };
  }

  /** Permadeath: record the run, wipe the save, show the game over screen. */
  private die(cause: string): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.clearMining();
    this.input.unlock();
    this.hud.visible = false;
    this.survivalHud.visible = false;
    this.tracker.visible = false;
    this.placer.cancel();
    this.menu.close();
    if (this.invScreen.isOpen) this.invScreen.close();
    this.craftMenu.close();
    this.bpMenu.close();
    this.debug.close();
    this.sfx.boom();
    const run = {
      daysSurvived: this.clock.day - 1,
      diedOnDay: this.clock.day,
      breaks: this.monolith.totalBreaks,
      animalsRaised: this.stats.animalsRaised,
      structuresBuilt: this.stats.structuresBuilt,
      cause,
      playSeconds: this.playSeconds,
      endedAt: Date.now(),
    };
    const { records, newBest } = recordRun(run);
    this.saves.clear();
    this.gameOver.show(run, records, newBest);
  }

  private bindInput(): void {
    this.input.onLockChange = (locked) => {
      if (this.state === 'dead') return;
      if (locked) this.setState('playing');
      else if (this.state === 'playing') {
        this.setState('menu');
        this.saveGame();
      }
    };
    document.addEventListener('pointerlockerror', () => {
      if (!isOverlay(this.state) && this.state !== 'dead') this.setState('menu');
    });

    this.input.onKeyDown = (code) => {
      if (this.state === 'dead' || this.state === 'menu') return;
      if (isOverlay(this.state)) {
        const closes: Record<Overlay, string[]> = {
          inventory: ['KeyE'],
          crafting: ['KeyE', 'KeyC'],
          blueprints: ['KeyB'],
          debug: ['F9'],
        };
        if (closes[this.state].includes(code)) this.closeOverlay();
        else if (code === 'Escape') this.setState('menu');
        return;
      }
      // Playing.
      if (this.placer.active) {
        if (code === 'KeyR') this.placer.rotate(1);
        if (code === 'Escape' || code === 'KeyG') this.placer.cancel();
        return;
      }
      if (code === 'KeyE') {
        const table = this.nearbyTable();
        if (table) this.openCrafting(table);
        else this.openOverlay('inventory');
      } else if (code === 'KeyC') this.openCrafting(null);
      else if (code === 'KeyB') this.openOverlay('blueprints');
      else if (code === 'F9') this.openOverlay('debug');
      else if (code === 'KeyG') this.startBlueprintPlacement();
      else if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= HOTBAR_SIZE) this.selectSlot(n - 1);
      }
    };
    this.invScreen.root.addEventListener('mousedown', (e) => {
      if (e.target === this.invScreen.root) this.input.lock();
    });
  }

  private openOverlay(s: Overlay): void {
    this.state = s; // set first so the pointer unlock doesn't open the pause menu
    this.clearMining();
    this.input.unlock();
    this.setState(s);
  }

  /** Close any overlay and capture the mouse again (which returns to 'playing'). */
  private closeOverlay(): void {
    this.input.lock();
  }

  // ---------------------------------------------------------------- crafting

  private nearbyTable() {
    return this.structures.nearest('crafting_table', this.player.position, CONFIG.crafting.useRange);
  }

  private openCrafting(table: PlacedStructure | null): void {
    this.openTable = table;
    this.openOverlay('crafting');
    this.craftMenu.open(table ? 'table' : 'hand', table ? table.queue : this.handQueue);
  }

  private activeQueue(): CraftQueue {
    return this.openTable ? this.openTable.queue : this.handQueue;
  }

  private queueCraft(recipe: Recipe, n: number): void {
    if (recipe.station === 'table' && !this.openTable) return;
    const queued = enqueue(this.inventory, this.activeQueue(), recipe, n);
    if (queued > 0) this.sfx.click();
  }

  /** Run crafting queues: hand crafting always, tables only while you're close by. */
  private tickCrafting(dt: number): void {
    const done = (item: ItemId, count: number) => {
      this.give(item, count);
      this.sfx.place();
    };
    tickQueue(this.handQueue, dt, done);
    for (const s of this.structures.list) {
      if (!s.queue.length) continue;
      if (Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z) <= CONFIG.crafting.workRange) tickQueue(s.queue, dt, done);
    }
  }

  private craftStatuses(): CraftStatus[] {
    const out: CraftStatus[] = [];
    const hp = queueProgress(this.handQueue);
    if (hp) out.push({ label: 'Crafting', item: ITEMS[hp.recipe.output.item].name, remaining: hp.remaining, frac: hp.frac });
    for (const s of this.structures.list) {
      const p = queueProgress(s.queue);
      if (!p) continue;
      const far = Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z) > CONFIG.crafting.workRange;
      out.push({ label: 'Table', item: ITEMS[p.recipe.output.item].name, remaining: p.remaining, frac: p.frac, paused: far ? 'Paused: too far' : undefined });
    }
    return out;
  }

  // ---------------------------------------------------------------- blueprints & placing

  private toggleTrack(id: BlueprintId): void {
    if (!this.book.toggleTrack(id)) {
      this.hud.toastInfo('Tracking full', `You can track up to ${CONFIG.blueprints.maxTracked} blueprints. Untrack one first.`, '#d0583c', 3);
    }
    this.sfx.click();
    this.bpMenu.refresh();
  }

  /** G: place the first tracked blueprint that has all its components. */
  private startBlueprintPlacement(): void {
    const id = this.book.tracked.find((t) => this.book.checklist(this.inventory, t).ready);
    if (!id) {
      this.hud.toastInfo(
        'Nothing ready to build',
        this.book.tracked.length ? 'Your tracked blueprints still need components.' : 'Press B and TRACK a blueprint first.',
        '#b8b0a0',
        3,
      );
      return;
    }
    const bp = blueprintById(id)!;
    this.beginPlacement(id, bp.name, () => {
      if (!this.book.checklist(this.inventory, id).ready) {
        this.hud.toastInfo('Missing components', `You no longer have everything for the ${bp.name}.`, '#d0583c', 3);
        return false;
      }
      for (const c of bp.components) this.inventory.remove(c.item, c.count);
      if (this.book.isTracked(id)) this.book.toggleTrack(id);
      return true;
    });
  }

  private beginPlacement(type: StructureId, label: string, consume: () => boolean): void {
    this.clearMining();
    this.placer.start(
      {
        type,
        label,
        onPlace: (x, y, z, rot) => {
          if (!consume()) return;
          this.structures.add(type, x, y, z, rot);
          this.stats.structuresBuilt++;
          this.sfx.place();
          this.player.shake(0.12);
          this.particles.dust(new THREE.Vector3(x, y + 0.1, z), 10, Math.max(STRUCTURES[type].size.w, STRUCTURES[type].size.d) * 0.6, 0.7);
          this.hud.toastInfo(`Built: ${label}`, type === 'crafting_table' ? 'Walk up to it and press E to craft components.' : 'Placed.', '#9cc070', 3);
          this.saveGame();
        },
      },
      this.player.yaw + Math.PI,
    );
  }

  private updatePlacement(): void {
    const req = this.placer.request!;
    this.placer.update(this.camera, { x: this.player.position.x, z: this.player.position.z, r: CONFIG.player.radius });
    this.hud.setPrompt(
      `Placing <b>${req.label}</b> · <kbd>LMB</kbd> place · <kbd>R</kbd> rotate · <kbd>RMB</kbd> cancel` +
        (this.placer.valid ? '' : `<br><span class="bad">${this.placer.reason || "Can't place here"}</span>`),
    );
    if (this.input.leftPressed) {
      if (!this.placer.confirm()) this.sfx.dud();
    } else if (this.input.rightPressed) {
      this.placer.cancel();
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.placer.rotate(wheel);
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
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------- loop

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const active = this.state === 'playing' || isOverlay(this.state);
    if (active) this.update(dt);
    windUniforms.uTime.value += dt;
    this.sky.setTimeOfDay(this.clock.skyTime);
    this.sky.update(dt, this.camera);
    this.monolith.update(dt, this.target && this.input.leftDown && this.state === 'playing' ? this.mineProgress : 0, this.sky.daylight);
    this.particles.update(dt);
    this.post.render(dt);
    this.input.endFrame();
  }

  private update(dt: number): void {
    const playing = this.state === 'playing';
    this.playSeconds += dt;
    this.lookDX = this.lookDY = 0;

    if (playing) {
      const [dx, dy] = this.input.consumeMouse();
      this.lookDX = dx;
      this.lookDY = dy;
      this.player.look(dx, dy);
      if (!this.placer.active) {
        const wheel = this.input.consumeWheel();
        if (wheel !== 0) this.selectSlot(this.inventory.selected + wheel);
      }
    }

    this.clock.advance(dt);
    this.tickCrafting(dt);
    this.player.allowSprint = this.survival.canSprint;
    this.player.allowJump = this.survival.canJump;
    this.player.update(dt, playing ? this.input : null, this.physics);
    if (this.player.jumped) this.survival.useStamina(CONFIG.survival.jumpStamina);
    this.applyFallDamage();
    if (this.player.position.y < CONFIG.player.voidY) this.respawn();

    if (playing && this.placer.active) {
      this.clearMining();
      this.target = null;
      this.updatePlacement();
    } else if (playing) {
      this.updateInteraction(dt);
      this.hud.setPrompt(this.nearbyTable() ? '<kbd>E</kbd> Use crafting table' : null);
    } else this.clearMining();

    const moved = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 0.5;
    this.survival.update(dt, {
      sprinting: this.player.sprinting && moved,
      mining: playing && !!this.target && this.input.leftDown,
      isNight: this.clock.isNight,
    });
    this.nightEvents.update(
      this.clock.isNight,
      {
        day: this.clock.day,
        progress: this.clock.isNight ? this.clock.halfProgress : 0,
        playerPosition: this.player.position,
        toast: (t, d) => this.hud.toastInfo(t, d, '#8aa0c8', 5),
        damagePlayer: (n, cause) => this.survival.damage(n, cause),
      },
      dt,
    );
    if (this.state === 'dead') return;
    this.survivalHud.update(this.clock, this.survival);
    this.tracker.update(this.book, this.inventory, this.craftStatuses());
    this.updateTorch(dt);
    this.eatCooldown -= dt;
    this.menuRefreshTimer -= dt;
    if (this.craftMenu.isOpen && this.menuRefreshTimer <= 0) {
      this.menuRefreshTimer = 0.1;
      const far = this.openTable && Math.hypot(this.openTable.x - this.player.position.x, this.openTable.z - this.player.position.z) > CONFIG.crafting.workRange;
      this.craftMenu.setPausedNote(far ? 'Paused: too far from the table' : '');
      this.craftMenu.renderQueue();
    }

    const moving = this.player.onGround ? Math.min(1, Math.hypot(this.player.velocity.x, this.player.velocity.z) / 4) : 0;
    this.hand.update(dt, moving, this.lookDX, this.lookDY);
    this.hud.update(dt);
    this.updateHint();
    this.buildNoticeTimer -= dt;

    this.saveTimer += dt;
    if (this.saveTimer >= CONFIG.save.autoSaveSeconds) {
      this.saveTimer = 0;
      if (this.saveGame()) this.hud.flashSaved();
    }
  }

  // ---------------------------------------------------------------- mining the Monolith

  private updateInteraction(dt: number): void {
    this.raycaster.set(this.camera.position, this.player.lookDirection(this.tmpDir));
    this.raycaster.far = CONFIG.player.reach;
    const hit = this.raycaster.intersectObject(this.monolith.mesh, false)[0];
    this.target = hit
      ? { point: hit.point.clone(), normal: hit.face!.normal.clone().transformDirection(this.monolith.mesh.matrixWorld), distance: hit.distance }
      : null;
    const t = this.target;

    if (t && this.input.leftDown) {
      const held = this.inventory.selectedStack;
      const speed = (held && ITEMS[held.item].miningSpeed) || 1;
      this.mineProgress += (dt * speed) / CONFIG.mining.magicBlockTime;
      this.hitTimer -= dt;
      this.hand.setMining(true);
      if (this.hitTimer <= 0) {
        this.hitTimer = CONFIG.mining.hitInterval;
        this.landHit(t);
      }
      if (this.mineProgress >= 1) {
        this.breakMonolith(t);
        this.mineProgress = 0;
        this.hitTimer = CONFIG.mining.hitInterval;
      }
    } else {
      this.clearMining();
    }
    this.hud.setMiningProgress(t && this.input.leftDown ? this.mineProgress : 0, true);

    if (this.input.rightPressed || (this.input.rightDown && this.eatCooldown <= 0)) this.useHeldItem();
  }

  /** Right-click: place a held placeable, or eat held food. */
  private useHeldItem(): void {
    const stack = this.inventory.selectedStack;
    const places = stack ? ITEMS[stack.item].places : undefined;
    if (stack && places && this.input.rightPressed) {
      const item = stack.item;
      this.beginPlacement(places, STRUCTURES[places].name, () => this.inventory.remove(item, 1) === 1);
      return;
    }
    const food = stack ? ITEMS[stack.item].food : undefined;
    if (stack && food) {
      if (this.eatCooldown > 0) return;
      if (this.survival.hunger >= CONFIG.survival.maxHunger - 0.5 && !food.health) {
        if (this.input.rightPressed) this.hud.toastInfo('Not hungry', 'You are already full.', '#b8b0a0', 2);
        return;
      }
      this.eatCooldown = 0.7;
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      const sick = this.survival.eat(food);
      this.sfx.eat();
      this.hand.triggerSwing();
      if (sick) this.hud.toastEvent('junk', 'Food poisoning', `That ${ITEMS[stack.item].name.toLowerCase()} was bad. You feel sick.`);
      return;
    }
    if (this.input.rightPressed && this.buildNoticeTimer <= 0) {
      this.buildNoticeTimer = 4;
      this.hud.toastInfo('Nothing to use', 'Hold food to eat it. Press C to craft, B for blueprints.', '#b8b0a0', 3);
    }
  }

  private applyFallDamage(): void {
    const speed = this.player.landingSpeed;
    this.player.landingSpeed = 0;
    const f = CONFIG.survival.fallDamage;
    if (speed > f.minSpeed) {
      this.survival.damage((speed - f.minSpeed) * f.perSpeed, 'Fell to their death');
      this.sfx.breakBlock('soft');
    }
  }

  private clearMining(): void {
    this.mineProgress = 0;
    this.hitTimer = 0;
    this.hand.setMining(false);
    this.hud.setMiningProgress(0, true);
  }

  /** A single strike while mining: sound, a puff of dust, a few chips, a little shake. */
  private landHit(t: MonolithTarget): void {
    this.sfx.hit('stone');
    this.monolith.hit();
    this.particles.dust(t.point, 3, 0.15, 0.35);
    this.particles.chipBurst(t.point, t.normal, 3, 2.2);
    this.player.shake(0.12);
  }

  private breakMonolith(t: MonolithTarget): void {
    const phaseUp = this.monolith.registerBreak(t.point);
    this.particles.chunk(t.point, t.normal);
    this.particles.chipBurst(t.point, t.normal, 18, 3.2);
    this.particles.dust(t.point, 14, 0.45, 0.75);
    this.player.shake(0.42);
    this.sfx.magicBreak();

    let result: LootResult;
    if (this.starterIndex < STARTER_DROPS.length) {
      const d = STARTER_DROPS[this.starterIndex++];
      result = { kind: 'items', rarity: 'common', items: [{ item: d.item, count: d.count }] };
    } else {
      result = rollLoot(this.monolith.phaseNumber);
    }

    if (result.kind === 'items') {
      for (const i of result.items) this.give(i.item, i.count);
      this.hud.toastItems(result.rarity, result.items, result.label);
      this.sfx.drop(result.rarity);
    } else if (result.event === 'blueprint') {
      const bp = this.book.randomMonolithBlueprint();
      if (bp) {
        this.book.unlock(bp.id, 'Found in the Monolith');
        this.sfx.drop('rare');
      } else {
        // Every Monolith blueprint is known: salvage the plan's materials instead.
        const items = [
          { item: 'log' as ItemId, count: 4 },
          { item: 'iron_ore' as ItemId, count: 2 },
        ];
        for (const i of items) this.give(i.item, i.count);
        this.hud.toastItems('rare', items, 'Torn Blueprint');
        this.sfx.drop('rare');
      }
    } else {
      this.applyEvent(result.event, result.rarity);
    }

    if (phaseUp) {
      const p = this.monolith.phase;
      this.hud.toastInfo(`Phase ${this.monolith.phaseNumber + 1}: ${p.name}`, 'The Monolith shifts. New things stir inside it.', p.palette.vein, 6);
      this.sfx.phaseUp();
      this.player.shake(0.6);
    }
    this.hud.updatePhase(this.monolith);
  }

  private give(item: ItemId, count: number): void {
    const left = this.inventory.add(item, count);
    if (left > 0) this.hud.toastInfo('Inventory full', `${left} ${ITEMS[item].name} fell into the void.`, '#d0583c', 3);
  }

  /** A held torch lights the area and slowly burns away. */
  private updateTorch(dt: number): void {
    const held = this.inventory.selectedStack;
    const burn = held && ITEMS[held.item].burnSeconds;
    if (!held || !burn) {
      this.torchLight.intensity = 0;
      return;
    }
    const t = performance.now() * 0.001;
    const flicker = 0.85 + Math.sin(t * 13) * 0.06 + Math.sin(t * 29 + 1.3) * 0.05 + Math.random() * 0.06;
    this.torchLight.intensity = 9 * flicker;
    this.torchBurn += dt;
    if (this.torchBurn >= burn) {
      this.torchBurn = 0;
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      this.hud.toastInfo('Torch burned out', this.inventory.count('torch') ? 'You light another one.' : 'Craft another (C).', '#e0a050', 3);
    }
  }

  private applyEvent(event: Parameters<typeof runLootEvent>[0], rarity: Rarity): void {
    const outcome = runLootEvent(event, {
      inventory: this.inventory,
      playerPosition: this.player.position,
      monolithPosition: this.monolith.mesh.position,
      knockPlayer: (v) => this.player.knock(v),
      crumbleEdge: () => {
        // Nothing is built yet, so the island itself sheds loose rock (cosmetic for now).
        const r = Math.random;
        for (let i = 0; i < 3; i++) {
          const a = r() * Math.PI * 2;
          const rad = this.island.rimRadius(a) - 0.1;
          const p = new THREE.Vector3(Math.cos(a) * rad, (this.island.heightAt(Math.cos(a) * (rad - 0.2), Math.sin(a) * (rad - 0.2)) ?? 0) - 0.2, Math.sin(a) * rad);
          const out = new THREE.Vector3(Math.cos(a), -0.2, Math.sin(a));
          this.particles.chipBurst(p, out, 10, 2.5);
          this.particles.dust(p, 6, 0.4, 0.8);
        }
        return 0;
      },
    });
    this.hud.toastEvent(rarity, outcome.title, outcome.detail);
    if (outcome.sound !== 'dud') {
      this.hud.damageFlash();
      this.player.shake(outcome.sound === 'boom' ? 0.7 : 0.45);
    }
    if (outcome.sound === 'boom') this.particles.dust(this.monolith.mesh.position.clone().setY(this.monolith.topY - 0.8), 20, 1.4, 1.1);
    this.sfx[outcome.sound]();
  }

  // ---------------------------------------------------------------- falling & respawn

  private respawn(): void {
    const lossFrac = CONFIG.player.respawnItemLoss;
    const lost = new Map<ItemId, number>();
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const s = this.inventory.slots[i];
      if (!s) continue;
      const exact = s.count * lossFrac;
      const n = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
      if (n <= 0) continue;
      this.inventory.slots[i] = s.count - n > 0 ? { item: s.item, count: s.count - n } : null;
      lost.set(s.item, (lost.get(s.item) ?? 0) + n);
    }
    this.inventory.changed();
    this.survival.damage(CONFIG.survival.voidDamage, 'Fell into the void');
    if (this.survival.dead) return;
    this.placeAtSpawn();
    this.sfx.fall();
    const list = [...lost].slice(0, 4).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ');
    this.hud.toastInfo(
      'The void spat you back out',
      `You took ${CONFIG.survival.voidDamage} damage${list ? ` and lost ${list}${lost.size > 4 ? '…' : '.'}` : '.'}`,
      RARITY_COLORS.junk,
      5,
    );
  }

  /** Stand a few steps in front of the Monolith, facing it. */
  private placeAtSpawn(): void {
    const z = 2.7;
    this.player.teleport(0, (this.island.heightAt(0, z) ?? 0) + 0.05, z);
    this.player.yaw = 0;
    this.player.pitch = 0.05;
    this.player.update(0, null, this.physics);
  }

  // ---------------------------------------------------------------- hints

  private updateHint(): void {
    let hint: string | null = null;
    if (this.state === 'playing') {
      if (this.monolith.totalBreaks === 0) hint = 'Walk up to the Monolith and hold LEFT CLICK to break it';
      else if (this.survival.hunger < 40 && this.inventory.slots.some((st) => st && ITEMS[st.item].food))
        hint = "You're hungry: select food (1-9) and RIGHT CLICK to eat";
      else if (this.monolith.totalBreaks < 6) hint = 'Keep breaking it. Careful near the edge: hold OPTION or Z to crouch';
      else if (this.inventory.selectedStack?.item === 'crafting_table') hint = 'RIGHT CLICK to place the Crafting Table';
      else if (this.inventory.count('crafting_table') > 0) hint = 'Select the Crafting Table in your hotbar and RIGHT CLICK to place it';
      else if (!this.structures.list.some((st) => st.type === 'crafting_table') && this.monolith.totalBreaks < 60)
        hint = 'Press C to craft. A Crafting Table needs 10 wood + 5 stone';
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
      version: 4,
      savedAt: Date.now(),
      playSeconds: this.playSeconds,
      clock: { day: this.clock.day, seconds: this.clock.seconds },
      survival: this.survival.serialize(),
      stats: this.stats,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch },
      inventory: this.inventory.serialize(),
      magic: { breaks: this.monolith.totalBreaks, starterIndex: this.starterIndex },
      legacyBlocks: this.legacyBlocks,
      blueprints: this.book.serialize(),
      structures: this.structures.serialize(),
      handQueue: this.handQueue,
    };
  }

  private saveGame(): boolean {
    if (this.state === 'dead') return false;
    return this.saves.write(this.snapshot());
  }

  private loadGame(): boolean {
    const data = this.saves.load();
    if (!data) return false;
    this.inventory.load(data.inventory);
    this.monolith.totalBreaks = data.magic.breaks;
    this.particles.setLook(this.monolith.phase.look);
    this.starterIndex = data.magic.starterIndex ?? STARTER_DROPS.length;
    this.playSeconds = data.playSeconds ?? 0;
    this.legacyBlocks = data.legacyBlocks ?? [];
    this.clock.day = Math.max(1, data.clock.day);
    this.clock.seconds = Math.max(0, data.clock.seconds);
    this.nightEvents.sync(this.clock.isNight);
    this.sky.setTimeOfDay(this.clock.skyTime);
    this.survival.load(data.survival);
    this.stats = { ...data.stats };
    this.handQueue = sanitizeQueue(data.handQueue);
    this.structures.clear();
    for (const st of data.structures ?? []) {
      if (STRUCTURES[st.type]) this.structures.add(st.type, st.x, st.y, st.z, st.rot, sanitizeQueue(st.queue));
    }
    this.quietUnlocks = true;
    this.book.load(data.blueprints);
    this.book.applyDayUnlocks(this.clock.day);
    this.quietUnlocks = false;

    const p = data.player;
    const ground = this.physics.groundHeight(p.x, p.z, CONFIG.player.radius, p.y + 1);
    if (ground === -Infinity || p.y < ground - 0.5) {
      this.placeAtSpawn();
    } else {
      this.player.teleport(p.x, Math.max(p.y, ground), p.z);
      this.player.yaw = p.yaw;
      this.player.pitch = p.pitch;
      this.player.update(0, null, this.physics);
    }

    if (data.migratedFrom === 3) {
      this.pendingNotice = {
        title: 'Crafting has arrived',
        detail: 'Pebbles are now Stone. Press C to craft a Crafting Table (10 wood + 5 stone), and B to see your blueprints.',
      };
      this.saveGame();
    } else if (data.migratedFrom === 2) {
      this.pendingNotice = {
        title: 'Survival has begun',
        detail: 'Your run continues from Day 1 with full health. Watch your food and survive as many days as you can.',
      };
      this.saveGame();
    } else if (data.migratedFrom === 1) {
      const n = this.legacyBlocks.length;
      this.pendingNotice = {
        title: 'The world has been reshaped',
        detail:
          n > 0
            ? `Your ${n} placed block${n === 1 ? ' is' : 's are'} stored safely and will return as building pieces when building arrives. Breaks and inventory are kept.`
            : 'Your breaks and inventory are kept.',
      };
      this.saveGame();
    }
    return true;
  }

  private newWorld(): void {
    this.saves.clear();
    this.inventory.load({ slots: [], selected: 0 });
    this.monolith.totalBreaks = 0;
    this.particles.setLook(this.monolith.phase.look);
    this.starterIndex = 0;
    this.playSeconds = 0;
    this.saveTimer = 0;
    this.legacyBlocks = [];
    this.stats = { animalsRaised: 0, structuresBuilt: 0 };
    this.clock.reset();
    this.nightEvents.sync(false);
    this.sky.setTimeOfDay(this.clock.skyTime);
    this.survival.reset();
    this.handQueue = [];
    this.structures.clear();
    this.placer.cancel();
    this.quietUnlocks = true;
    this.book.load(undefined);
    this.book.applyDayUnlocks(1);
    this.quietUnlocks = false;
    this.pendingNotice = {
      title: 'Blueprints: Fire Pit, Chicken Coop',
      detail: 'You start with two blueprints. Press B to see them, C to craft, and get a Crafting Table going for components.',
    };
    this.placeAtSpawn();
    this.hud.updatePhase(this.monolith);
    this.saveGame();
  }
}

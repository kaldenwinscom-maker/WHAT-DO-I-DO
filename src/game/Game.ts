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

type State = 'menu' | 'playing' | 'inventory' | 'dead';

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

    this.particles = new Particles(this.physics, this.monolith.phase.look);
    this.monolith.onPhaseLook = (look) => this.particles.setLook(look);
    this.scene.add(this.particles.group);

    this.player = new Player(this.camera);
    this.hand = new Hand(this.camera);
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
    this.inventory.onChange = () => {
      this.hud.updateHotbar(this.inventory);
      this.invScreen.refresh();
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
    const inGame = s === 'playing' || s === 'inventory';
    this.hud.visible = inGame;
    this.survivalHud.visible = inGame;
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
    this.menu.close();
    if (this.invScreen.isOpen) this.invScreen.close();
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
      if (this.state !== 'inventory' && this.state !== 'dead') this.setState('menu');
    });

    this.input.onKeyDown = (code) => {
      if (code === 'KeyE') {
        if (this.state === 'playing') {
          this.state = 'inventory';
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
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------- loop

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const active = this.state === 'playing' || this.state === 'inventory';
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
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) this.selectSlot(this.inventory.selected + wheel);
    }

    this.clock.advance(dt);
    this.player.allowSprint = this.survival.canSprint;
    this.player.allowJump = this.survival.canJump;
    this.player.update(dt, playing ? this.input : null, this.physics);
    if (this.player.jumped) this.survival.useStamina(CONFIG.survival.jumpStamina);
    this.applyFallDamage();
    if (this.player.position.y < CONFIG.player.voidY) this.respawn();

    if (playing) this.updateInteraction(dt);
    else this.clearMining();

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
    this.eatCooldown -= dt;

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
      this.mineProgress += dt / CONFIG.mining.magicBlockTime;
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

  /** Right-click: eat held food. */
  private useHeldItem(): void {
    const stack = this.inventory.selectedStack;
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
      this.hud.toastInfo('Building is being rebuilt', 'Foundations, walls and roofs arrive in a later update.', '#b8b0a0', 3);
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
      version: 3,
      savedAt: Date.now(),
      playSeconds: this.playSeconds,
      clock: { day: this.clock.day, seconds: this.clock.seconds },
      survival: this.survival.serialize(),
      stats: this.stats,
      player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch },
      inventory: this.inventory.serialize(),
      magic: { breaks: this.monolith.totalBreaks, starterIndex: this.starterIndex },
      legacyBlocks: this.legacyBlocks,
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

    if (data.migratedFrom === 2) {
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
    this.placeAtSpawn();
    this.hud.updatePhase(this.monolith);
    this.saveGame();
  }
}

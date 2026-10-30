// Tiny procedural sound effects using the Web Audio API. No audio files.

import type { Rarity } from '../data/loot';

type Material = 'soft' | 'wood' | 'stone';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.6;

  /** Must be called from a user gesture (click/keypress) before sounds can play. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hit(mat: Material): void {
    if (mat === 'wood') this.noise(0.08, 900, 3, 0.35);
    else if (mat === 'stone') this.noise(0.07, 2200, 4, 0.3);
    else this.noise(0.09, 500, 1.5, 0.4);
  }

  breakBlock(mat: Material): void {
    if (mat === 'wood') {
      this.noise(0.25, 700, 2, 0.5);
      this.tone(140, 0.15, 0.25, 'triangle', 0, 80);
    } else if (mat === 'stone') {
      this.noise(0.3, 1600, 2, 0.45);
      this.tone(110, 0.2, 0.25, 'triangle', 0, 60);
    } else {
      this.noise(0.25, 380, 1, 0.55, 'lowpass');
    }
  }

  place(): void {
    this.noise(0.1, 300, 1, 0.5, 'lowpass');
    this.tone(90, 0.1, 0.25, 'sine', 0, 60);
  }

  magicBreak(): void {
    this.noise(0.35, 1200, 1.5, 0.35);
    this.tone(220, 0.25, 0.15, 'triangle', 0, 440);
  }

  drop(rarity: Rarity): void {
    const base: Record<Rarity, number[]> = {
      junk: [196],
      common: [330, 392],
      uncommon: [392, 494, 587],
      rare: [440, 554, 659, 880],
      epic: [523, 659, 784, 1047, 1319],
    };
    base[rarity].forEach((f, i) => this.tone(f, 0.25 + i * 0.03, 0.12, rarity === 'junk' ? 'square' : 'triangle', 0.08 + i * 0.07));
  }

  boom(): void {
    this.noise(0.6, 180, 0.7, 0.9, 'lowpass');
    this.tone(70, 0.5, 0.5, 'sine', 0, 30);
  }

  rot(): void {
    this.tone(300, 0.5, 0.12, 'sawtooth', 0.05, 90);
    this.noise(0.4, 600, 0.5, 0.15, 'lowpass', 0.05);
  }

  crumble(): void {
    for (let i = 0; i < 4; i++) this.noise(0.25, 400 + i * 150, 1, 0.35, 'bandpass', i * 0.09);
    this.tone(60, 0.6, 0.35, 'sine', 0, 35);
  }

  dud(): void {
    this.noise(0.3, 250, 0.8, 0.2, 'lowpass');
  }

  phaseUp(): void {
    [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.6, 0.12, 'triangle', i * 0.12));
  }

  fall(): void {
    this.tone(600, 1.2, 0.15, 'sine', 0, 60);
  }

  click(): void {
    this.tone(700, 0.04, 0.06, 'square');
  }
}

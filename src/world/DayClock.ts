// Tracks which day it is and how far through it we are. A day starts at sunrise:
// [ daylight: dayMinutes ][ night: nightMinutes ] then the next day begins.
// The sky uses a 0..1 "time of day" (0.25 sunrise, 0.75 sunset); this maps onto it,
// so day and night can have different real lengths.

import { CONFIG } from '../config';

export class DayClock {
  /** 1-based day number. Increments at sunrise. */
  day = 1;
  /** Seconds since this day's sunrise. */
  seconds = 0;
  /** Called on transitions. */
  onSunset: ((day: number) => void) | null = null;
  onSunrise: ((day: number) => void) | null = null;

  get dayLength(): number {
    return CONFIG.time.dayMinutes * 60;
  }

  get nightLength(): number {
    return CONFIG.time.nightMinutes * 60;
  }

  get cycleLength(): number {
    return this.dayLength + this.nightLength;
  }

  get isNight(): boolean {
    return this.seconds >= this.dayLength;
  }

  /** Seconds until the next sunset (during the day) or sunrise (at night). */
  get secondsToChange(): number {
    return this.isNight ? this.cycleLength - this.seconds : this.dayLength - this.seconds;
  }

  /** 0..1 progress through the current day or night. */
  get halfProgress(): number {
    return this.isNight ? (this.seconds - this.dayLength) / this.nightLength : this.seconds / this.dayLength;
  }

  /** Days elapsed since the run started, e.g. 1.5 = halfway through Day 2. */
  get daysElapsed(): number {
    return this.day - 1 + this.seconds / this.cycleLength;
  }

  /** The sky's time of day (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset). */
  get skyTime(): number {
    return this.isNight ? 0.75 + 0.5 * this.halfProgress : 0.25 + 0.5 * this.halfProgress;
  }

  reset(): void {
    this.day = 1;
    this.seconds = CONFIG.time.startMinutesIntoDay * 60;
  }

  /** Jump to a sky time on the current day (used by the ?time= test parameter). */
  setSkyTime(t: number): void {
    const tt = ((t % 1) + 1) % 1;
    if (tt >= 0.25 && tt < 0.75) this.seconds = ((tt - 0.25) / 0.5) * this.dayLength;
    else this.seconds = this.dayLength + (((tt - 0.75 + 1) % 1) / 0.5) * this.nightLength;
  }

  advance(dt: number): void {
    const wasNight = this.isNight;
    this.seconds += dt;
    if (!wasNight && this.isNight) this.onSunset?.(this.day);
    if (this.seconds >= this.cycleLength) {
      this.seconds -= this.cycleLength;
      this.day++;
      this.onSunrise?.(this.day);
    }
  }
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

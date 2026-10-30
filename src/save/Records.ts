// Best results across runs, kept separately from the current run's save so death doesn't erase them.

import { CONFIG } from '../config';

export interface RunSummary {
  daysSurvived: number;
  diedOnDay: number;
  breaks: number;
  animalsRaised: number;
  structuresBuilt: number;
  cause: string;
  playSeconds: number;
  endedAt: number;
}

export interface Records {
  bestDays: number;
  bestBreaks: number;
  runs: number;
  best: RunSummary | null;
  last: RunSummary | null;
}

const EMPTY: Records = { bestDays: 0, bestBreaks: 0, runs: 0, best: null, last: null };

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(CONFIG.save.recordsKey);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

/** Record a finished run. Returns the updated records and whether this run set a new best. */
export function recordRun(run: RunSummary): { records: Records; newBest: boolean } {
  const r = loadRecords();
  const newBest = run.daysSurvived > r.bestDays || (run.daysSurvived === r.bestDays && run.breaks > (r.best?.breaks ?? -1));
  r.runs++;
  r.last = run;
  if (newBest) {
    r.bestDays = run.daysSurvived;
    r.best = run;
  }
  r.bestBreaks = Math.max(r.bestBreaks, run.breaks);
  try {
    localStorage.setItem(CONFIG.save.recordsKey, JSON.stringify(r));
  } catch {
    /* storage unavailable */
  }
  return { records: r, newBest };
}

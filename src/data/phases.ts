// The magic block advances through phases as it is broken.
// `startsAt` is the total number of breaks needed to enter the phase.
// `palette` drives the procedural texture of the magic block in that phase.

export type PhaseId = 'meadow' | 'woodland' | 'caves' | 'frost' | 'ashlands';

export interface PhaseDef {
  id: PhaseId;
  name: string;
  startsAt: number;
  palette: { base: string; dark: string; vein: string; glow: string };
}

export const PHASES: PhaseDef[] = [
  { id: 'meadow', name: 'Meadow', startsAt: 0, palette: { base: '#5d6b3c', dark: '#3a4226', vein: '#c9d77a', glow: '#b8d060' } },
  { id: 'woodland', name: 'Woodland', startsAt: 50, palette: { base: '#4e3b28', dark: '#2e2218', vein: '#9fd06a', glow: '#7fc050' } },
  { id: 'caves', name: 'Caves', startsAt: 150, palette: { base: '#5a5853', dark: '#33322f', vein: '#e0a050', glow: '#ff9a40' } },
  { id: 'frost', name: 'Frost', startsAt: 300, palette: { base: '#8fa4b0', dark: '#55687a', vein: '#d8f2ff', glow: '#a8e4ff' } },
  { id: 'ashlands', name: 'Ashlands', startsAt: 500, palette: { base: '#2a2326', dark: '#141012', vein: '#ff5a2a', glow: '#ff4010' } },
];

export function phaseIndexForBreaks(breaks: number): number {
  let idx = 0;
  for (let i = 0; i < PHASES.length; i++) if (breaks >= PHASES[i].startsAt) idx = i;
  return idx;
}

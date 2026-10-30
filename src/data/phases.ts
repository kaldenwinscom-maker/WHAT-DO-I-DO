// The Monolith advances through phases as it is broken.
// `startsAt` is the total number of breaks needed to enter the phase.
// `palette` colours the HUD; `look` drives the Monolith's material (textures from public/textures).

import type { TextureSetId } from '../render/Assets';

export type PhaseId = 'meadow' | 'woodland' | 'caves' | 'frost' | 'ashlands';

export interface PhaseLook {
  /** Main surface texture and colour tint. */
  base: { set: TextureSetId; scale: number; tint: string };
  /** Layer that settles on top surfaces (moss, snow...). */
  top?: { set: TextureSetId; scale: number; tint: string; amount: number; threshold: number };
  /** Glowing crack colour and strength (strength > 1 blooms). */
  veinColor: string;
  veinIntensity: number;
}

export interface PhaseDef {
  id: PhaseId;
  name: string;
  startsAt: number;
  palette: { base: string; vein: string };
  look: PhaseLook;
}

export const PHASES: PhaseDef[] = [
  {
    id: 'meadow',
    name: 'Meadow',
    startsAt: 0,
    palette: { base: '#5d6b3c', vein: '#c9d77a' },
    look: {
      base: { set: 'rock_face', scale: 0.55, tint: '#a8a294' },
      top: { set: 'mossy_rock', scale: 0.6, tint: '#9aa07a', amount: 1, threshold: 0.15 },
      veinColor: '#b6d66a',
      veinIntensity: 2.2,
    },
  },
  {
    id: 'woodland',
    name: 'Woodland',
    startsAt: 50,
    palette: { base: '#4e3b28', vein: '#9fd06a' },
    look: {
      base: { set: 'bark_brown_02', scale: 0.7, tint: '#9a8a78' },
      top: { set: 'mossy_rock', scale: 0.6, tint: '#80905e', amount: 0.6, threshold: 0.55 },
      veinColor: '#8fd05a',
      veinIntensity: 2.4,
    },
  },
  {
    id: 'caves',
    name: 'Caves',
    startsAt: 150,
    palette: { base: '#5a5853', vein: '#e0a050' },
    look: {
      base: { set: 'dark_rock_02', scale: 0.5, tint: '#8a8680' },
      veinColor: '#ff9a3c',
      veinIntensity: 3,
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    startsAt: 300,
    palette: { base: '#8fa4b0', vein: '#d8f2ff' },
    look: {
      base: { set: 'rock_face', scale: 0.55, tint: '#8e9aa6' },
      top: { set: 'snow_02', scale: 0.5, tint: '#b8c2cc', amount: 0.9, threshold: 0.4 },
      veinColor: '#9fe0ff',
      veinIntensity: 2.6,
    },
  },
  {
    id: 'ashlands',
    name: 'Ashlands',
    startsAt: 500,
    palette: { base: '#2a2326', vein: '#ff5a2a' },
    look: {
      base: { set: 'dark_rock_02', scale: 0.45, tint: '#4a3e3a' },
      veinColor: '#ff4a14',
      veinIntensity: 4.5,
    },
  },
];

export function phaseIndexForBreaks(breaks: number): number {
  let idx = 0;
  for (let i = 0; i < PHASES.length; i++) if (breaks >= PHASES[i].startsAt) idx = i;
  return idx;
}

// Graphics quality presets. Pick with ?quality=low|medium|high in the URL (remembered),
// a settings menu arrives with the HUD update.

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadowMapSize: number;
  /** Half-size of the shadow camera box around the player, in metres. */
  shadowExtent: number;
  ao: 'off' | 'half' | 'full';
  bloom: boolean;
  msaa: number;
  grassBlades: number;
  dustMotes: number;
}

const PRESETS: Record<QualityLevel, Omit<QualitySettings, 'level' | 'pixelRatio'> & { maxPixelRatio: number }> = {
  low: { maxPixelRatio: 1, shadowMapSize: 1024, shadowExtent: 14, ao: 'off', bloom: false, msaa: 0, grassBlades: 5000, dustMotes: 150 },
  medium: { maxPixelRatio: 1.25, shadowMapSize: 2048, shadowExtent: 16, ao: 'half', bloom: true, msaa: 0, grassBlades: 11000, dustMotes: 350 },
  high: { maxPixelRatio: 1.75, shadowMapSize: 2048, shadowExtent: 16, ao: 'full', bloom: true, msaa: 4, grassBlades: 20000, dustMotes: 600 },
};

const STORAGE_KEY = 'lastblock.quality';

export function resolveQuality(): QualitySettings {
  let level: QualityLevel = 'medium';
  try {
    const fromUrl = new URLSearchParams(location.search).get('quality');
    const stored = localStorage.getItem(STORAGE_KEY);
    const pick = (fromUrl ?? stored ?? '').toLowerCase();
    if (pick === 'low' || pick === 'medium' || pick === 'high') level = pick;
    if (fromUrl) localStorage.setItem(STORAGE_KEY, level);
  } catch {
    /* storage unavailable: keep default */
  }
  const p = PRESETS[level];
  return { level, ...p, pixelRatio: Math.min(window.devicePixelRatio || 1, p.maxPixelRatio) };
}

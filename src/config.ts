// Global tunables. Gameplay content (items, loot, phases) lives in src/data/.

export const CONFIG = {
  player: {
    radius: 0.32,
    height: 1.8,
    eyeHeight: 1.62,
    walkSpeed: 4.3,
    sprintSpeed: 6.6,
    jumpVelocity: 8.6,
    gravity: 26,
    maxFallSpeed: 50,
    reach: 4.5,
    /** Highest ledge the player walks up without jumping. */
    stepHeight: 0.45,
    mouseSensitivity: 0.0022,
    /** Below this Y the player is considered fallen into the void. */
    voidY: -40,
    /** On respawn, each inventory stack loses roughly this fraction of its items. */
    respawnItemLoss: 0.3,
  },
  mining: {
    /** Seconds to break the Monolith with the starting rock. */
    magicBlockTime: 1.0,
    /** How often a "hit" lands while holding the mouse (sound, dust, shake). */
    hitInterval: 0.33,
  },
  world: {
    /** Real seconds for a full day/night cycle. */
    dayLengthSeconds: 600,
    /** Time of day a new world starts at (0 = midnight, 0.25 = sunrise, 0.5 = noon). */
    startTime: 0.3,
  },
  save: {
    key: 'lastblock.save.v1',
    autoSaveSeconds: 30,
  },
  graphics: {
    /** Exponential fog density at midday; nights and the void get denser fog. */
    fogDensity: 0.011,
  },
} as const;

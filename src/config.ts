// Global tunables. Gameplay content (items, loot, phases) lives in src/data/.

export const CONFIG = {
  player: {
    width: 0.6,
    height: 1.8,
    eyeHeight: 1.62,
    walkSpeed: 4.3,
    sprintSpeed: 6.6,
    jumpVelocity: 8.6,
    gravity: 26,
    maxFallSpeed: 50,
    reach: 5,
    mouseSensitivity: 0.0022,
    /** Below this Y the player is considered fallen into the void. */
    voidY: -40,
    /** On respawn, each inventory stack loses roughly this fraction of its items. */
    respawnItemLoss: 0.3,
  },
  mining: {
    /** Seconds to break the magic block with bare hands. */
    magicBlockTime: 1.0,
  },
  save: {
    key: 'lastblock.save.v1',
    autoSaveSeconds: 30,
  },
  graphics: {
    maxPixelRatio: 1.75,
    shadowMapSize: 2048,
    fogNear: 30,
    fogFar: 160,
  },
} as const;

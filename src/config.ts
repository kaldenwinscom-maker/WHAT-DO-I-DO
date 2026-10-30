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
    /** Below this Y the player has fallen into the void. */
    voidY: -40,
    /** After falling into the void, each inventory stack loses roughly this fraction of its items. */
    respawnItemLoss: 0.3,
  },
  mining: {
    /** Seconds to break the Monolith with the starting rock. */
    magicBlockTime: 1.0,
    /** How often a "hit" lands while holding the mouse (sound, dust, shake). */
    hitInterval: 0.33,
  },
  time: {
    /** Real minutes from sunrise to sunset. */
    dayMinutes: 7,
    /** Real minutes from sunset to the next sunrise. */
    nightMinutes: 7,
    /** A new run starts this many minutes after sunrise on Day 1. */
    startMinutesIntoDay: 0.4,
  },
  survival: {
    maxHealth: 100,
    maxHunger: 100,
    maxStamina: 100,
    /** Hunger lost per real minute (full to empty in ~22 minutes, about 1.5 days). */
    hungerDrainPerMinute: 4.5,
    /** Nights are cold: hunger drains faster and stamina recovers slower. */
    nightHungerMultiplier: 1.35,
    nightStaminaRegenMultiplier: 0.65,
    /** Health regenerates only while hunger is above this value. */
    regenHungerThreshold: 50,
    regenPerMinute: 5,
    /** Health lost per minute while hunger is at 0. */
    starvingDamagePerMinute: 8,
    sprintStaminaPerSecond: 16,
    jumpStamina: 9,
    miningStaminaPerSecond: 2.5,
    staminaRegenPerSecond: 14,
    /** Seconds after using stamina before it starts to recover. */
    staminaRegenDelay: 1.1,
    /** Below this stamina you can't start sprinting or jumping. */
    staminaMinToAct: 10,
    /** Landing faster than minSpeed (m/s) hurts: damage = (speed - minSpeed) * perSpeed. */
    fallDamage: { minSpeed: 12, perSpeed: 5 },
    /** Falling into the void: this much damage, then you wake up by the Monolith. */
    voidDamage: 35,
    /** Food poisoning from raw food. */
    sickness: { durationSeconds: 75, damagePerMinute: 7, hungerDrainMultiplier: 1.5 },
  },
  crafting: {
    /**
     * Where the Crafting Table stands on the starting island (it can't be moved or destroyed).
     * It turns to face the spawn point. If a spot is blocked, the next one is tried.
     */
    tableSpots: [
      { x: 2.35, z: 0.7 },
      { x: -2.35, z: 0.7 },
      { x: 2.2, z: 1.6 },
    ],
    /** Materials refunded for each Crafting Table a player built in an older version. */
    oldTableRefund: [
      { item: 'log', count: 10 },
      { item: 'stone', count: 5 },
    ] as { item: 'log' | 'stone'; count: number }[],
    /** How close (metres) you must be to a crafting table to open it with E. */
    useRange: 2.6,
    /** Table crafting keeps running while you stay within this distance (metres). */
    workRange: 7,
  },
  blueprints: {
    /** Day each blueprint unlocks automatically at sunrise (1 = from the start). Omit = never by day. */
    dayUnlocks: {
      fire_pit: 1,
      chicken_coop: 1,
      animal_feeder: 3,
      storage_chest: 4,
      door: 5,
      rain_collector: 6,
      bed: 8,
      cooking_station: 10,
    } as Record<string, number>,
    /** How many blueprints can be tracked on screen at once. */
    maxTracked: 3,
  },
  save: {
    key: 'lastblock.save.v1',
    recordsKey: 'lastblock.records',
    autoSaveSeconds: 30,
  },
  graphics: {
    /** Exponential fog density at midday; nights and the void get denser fog. */
    fogDensity: 0.011,
  },
} as const;

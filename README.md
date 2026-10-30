# Last Block

A browser-based 3D survival game. You start on a tiny floating island with a single glowing
rock, the Monolith. Break it for random drops (some good, many bad), build outward, and
**survive as many days as you can**. Death is permanent: your best run is kept on the main menu.

Built with Vite + TypeScript + Three.js, with PBR materials, an HDRI sky and post-processing
(`postprocessing` + N8AO). Runs entirely in the browser; progress saves to localStorage.

## Run it on your Mac

You need [Node.js](https://nodejs.org) 20 or newer (the LTS installer is fine). In Terminal, from this folder:

```bash
npm install
```

```bash
npm run dev
```

Then open the URL it prints (usually http://localhost:5173) in Chrome, Safari or Firefox.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (click Play to capture the mouse) |
| Space | Jump |
| Shift | Sprint |
| Option / Z | Crouch (you won't walk off edges) |
| Left click (hold) | Mine the Monolith |
| Right click (or Ctrl + click) | Eat held food / place a held Crafting Table |
| 1–9 / scroll | Select hotbar slot |
| E | Inventory, or use a Crafting Table when standing next to it |
| C | Hand crafting (Crafting Table, sticks, rock tools, torch) |
| B | Blueprints: view, and TRACK up to 3 on screen |
| G | Build a tracked blueprint once its checklist is complete |
| R / scroll | Rotate while placing (left click places, right click cancels) |
| F9 | Debug panel (give items, unlock blueprints, skip a day) |
| Esc | Pause |

## Graphics quality

Add `?quality=low`, `?quality=medium` (default) or `?quality=high` to the URL. The choice is remembered.

| | Low | Medium | High |
| --- | --- | --- | --- |
| Shadows | 1024 | 2048 | 2048 |
| Ambient occlusion | off | half-res | full-res |
| Bloom | off | on | on |
| Anti-aliasing | off | off | 4× MSAA |
| Grass blades | 5k | 11k | 20k |

For testing, `?time=0.75` jumps to a time of day (0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset).

## Rebalancing

All game content lives in `src/data/`:

- `recipes.ts`: every recipe, its station (`hand` or `table`), ingredients and craft time
- `blueprints.ts`: blueprints, their components, and whether the Monolith or an area can give them
- `structures.ts`: placeable structures' footprint and height

- `loot.ts`: rarity weights, loot tables per phase, starter drops, bad-event strength
- `items.ts`: every item (name, stack size, perishable); their 3D models are in `src/items/itemModels.ts`
- `phases.ts`: phase names, break thresholds, and each phase's Monolith look (textures, tint, vein colour)
- `src/config.ts`:
  - `time`: day and night length in real minutes (default 7 + 7)
  - `blueprints.dayUnlocks`: the day each blueprint unlocks; `maxTracked`
  - `crafting`: how close you must be to use a table, and to keep it crafting
  - `survival`: hunger drain, night cold, health regen, starving, stamina costs, fall/void damage, food poisoning
  - player physics, reach, void item loss, autosave interval, fog

Food values (hunger restored, chance of food poisoning) are on each item in `items.ts`.
Night events (enemies, storms…) plug into `src/world/nightEvents.ts`; none are active yet.

## Project layout

```
src/
  data/       editable game content (loot, items, phases)
  render/     asset loading, triplanar PBR materials, post-processing, quality presets
  world/      floating island, grass, rocks, sky/day-night, collision physics
  block/      the Monolith
  build/      structures, their 3D models, and the ghost placement mode
  crafting/   crafting queues and the blueprint book
  items/      3D item models (icons, held item, drops)
  loot/       loot rolling + bad events
  inventory/  inventory model
  player/     controller, input, held item
  ui/         HUD, inventory screen, menu, icons, CSS
  save/       localStorage save/load
  audio/      Web Audio sound effects
  fx/         particles
  game/       Game: wires everything together and runs the loop
```

## Assets

Textures and the sky HDRI are CC0 from Poly Haven, see `public/CREDITS.md`. Everything else
(models, sounds, shaders) is generated in code.

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

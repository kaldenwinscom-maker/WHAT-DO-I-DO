# Last Block

A browser-based 3D survival game. You start on a single floating block in an empty sky.
Break it for random drops (some good, many bad), build outward, and survive.

Built with Vite + TypeScript + Three.js. Runs entirely in the browser; progress saves to localStorage.

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
| Left click (hold) | Mine the magic block / break blocks |
| Right click (or Ctrl + click) | Place the selected block |
| 1–9 / scroll | Select hotbar slot |
| E | Inventory |
| Esc | Pause |

## Rebalancing

All game content lives in `src/data/`:

- `loot.ts`: rarity weights, loot tables per phase, starter drops, bad-event strength
- `items.ts`: every item (name, stack size, which block it places, perishable)
- `blocks.ts`: block types and how long they take to break
- `phases.ts`: phase names, break thresholds, magic block colours
- `src/config.ts`: player physics, reach, respawn item loss, autosave interval, graphics

## Project layout

```
src/
  data/       editable game content (loot, items, blocks, phases)
  world/      voxel world (instanced meshes), sky/lighting, procedural textures
  block/      the magic block
  loot/       loot rolling + bad events
  inventory/  inventory model
  player/     controller, input, held item
  ui/         HUD, inventory screen, menu, icons, CSS
  save/       localStorage save/load
  audio/      Web Audio sound effects
  fx/         particles
  game/       Game: wires everything together and runs the loop
```

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

# WHAT-DO-I-DO
Ai agency

## Hoop Packs — NBA Card Collector

A self-contained, single-file browser game in [`index.html`](index.html). Open it directly in any
browser (no build step, no server required).

- All 30 NBA teams with real team colors and a 10-player roster each (300 players total).
- Every player has an Overall Rating, Position, and five attributes (Shooting, Defense, Speed,
  Rebounding, Playmaking) generated from their OVR and position.
- Open packs (Standard / Premium / Legend / a free Daily pack) with an animated card reveal and
  Bronze/Silver/Gold/Diamond rarity tiers.
- Collect cards into a binder, build a 5-player starting lineup, and simulate a game against a
  random CPU team with a live quarter-by-quarter scoreboard and final box score.
- Win games to earn coins and open more packs. Progress is saved to `localStorage`.

Rosters live in the `ROSTERS` object near the top of the `<script>` in `index.html` as simple
`[name, position, overall]` tuples — edit that object any time to keep rosters current.


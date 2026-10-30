import './ui/style.css';
import * as THREE from 'three';
import { Game } from './game/Game';
import { Assets } from './render/Assets';
import { prepareIcons } from './ui/icons';

const container = document.getElementById('app')!;
const loading = document.getElementById('loading')!;
const bar = loading.querySelector<HTMLElement>('.fill')!;

async function start(): Promise<void> {
  // A throwaway renderer just to read GPU capabilities for texture setup.
  const probe = new THREE.WebGLRenderer();
  await Assets.loadAll(probe, (f) => (bar.style.width = `${Math.round(f * 100)}%`));
  probe.dispose();
  probe.forceContextLoss();
  prepareIcons();
  const game = new Game(container);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
  // Handy for poking at the game from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
}

start().catch((err) => {
  console.error(err);
  loading.innerHTML =
    '<div class="msg">Last Block could not start. Your browser may not support WebGL 2, or the game files failed to load.<br><small>' +
    String(err?.message ?? err) +
    '</small></div>';
});

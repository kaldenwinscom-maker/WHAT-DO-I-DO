import './ui/style.css';
import { Game } from './game/Game';

const container = document.getElementById('app')!;

try {
  const game = new Game(container);
  // Handy for poking at the game from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
} catch (err) {
  console.error(err);
  container.innerHTML =
    '<div style="padding:40px;font-family:sans-serif;color:#eadfc8">Last Block could not start. Your browser may not support WebGL.</div>';
}

// Inventory icons, drawn in code. Block items get a small isometric cube made from their textures.

import { BLOCKS } from '../data/blocks';
import { ITEMS, type IconShape, type ItemId } from '../data/items';
import { getTextureCanvas } from '../world/textures';

const SIZE = 64;
const urlCache = new Map<ItemId, string>();
const canvasCache = new Map<ItemId, HTMLCanvasElement>();

export function itemIconCanvas(id: ItemId): HTMLCanvasElement {
  let c = canvasCache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const def = ITEMS[id];
  if (def.icon.kind === 'block' && def.places) drawCube(ctx, def.places);
  else if (def.icon.kind === 'shape') drawShape(ctx, def.icon.shape, def.icon.color, def.icon.accent ?? def.icon.color);
  canvasCache.set(id, c);
  return c;
}

export function itemIconUrl(id: ItemId): string {
  let u = urlCache.get(id);
  if (!u) {
    u = itemIconCanvas(id).toDataURL();
    urlCache.set(id, u);
  }
  return u;
}

function drawCube(ctx: CanvasRenderingContext2D, blockId: keyof typeof BLOCKS): void {
  const t = BLOCKS[blockId].textures;
  const top = getTextureCanvas(t.top);
  const side = getTextureCanvas(t.side);
  const s = 64; // source texture size
  const w = 26; // half-width of the cube in the icon
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 2;
  ctx.imageSmoothingEnabled = false;
  // Top face: square rotated 45deg and squashed.
  ctx.save();
  ctx.translate(cx, cy - w * 0.5);
  ctx.scale(1, 0.5);
  ctx.rotate(Math.PI / 4);
  ctx.drawImage(top, -s / 2, -s / 2, s, s);
  ctx.restore();
  // Left face.
  ctx.save();
  ctx.setTransform(w / s, (w * 0.5) / s, 0, w / s, cx - w, cy - w * 0.5);
  ctx.drawImage(side, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  // Right face.
  ctx.save();
  ctx.setTransform(w / s, (-w * 0.5) / s, 0, w / s, cx, cy);
  ctx.drawImage(side, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: IconShape, color: string, accent: string): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  const c = SIZE / 2;
  switch (shape) {
    case 'pebble':
      blob(ctx, c, c + 4, 16, 11, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      blob(ctx, c - 5, c, 6, 3, 3);
      ctx.fill();
      break;
    case 'blob':
      blob(ctx, c, c + 3, 19, 14, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      blob(ctx, c - 6, c - 3, 6, 4, 5);
      ctx.fill();
      break;
    case 'leaf':
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(c - 8 + i * 8, c + 2 - i * 3);
        ctx.rotate(-0.6 + i * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(0, 12);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.restore();
      }
      break;
    case 'stick':
      ctx.lineWidth = 7;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(14, 50);
      ctx.lineTo(50, 14);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(15, 49);
      ctx.lineTo(49, 15);
      ctx.moveTo(32, 32);
      ctx.lineTo(40, 36);
      ctx.stroke();
      break;
    case 'seeds':
      for (const [x, y, r] of [
        [22, 28, 0.4],
        [36, 24, -0.3],
        [30, 40, 0.9],
        [42, 38, 0.1],
        [20, 42, -0.8],
      ]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'egg':
      ctx.beginPath();
      ctx.ellipse(c, c + 3, 14, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,100,70,0.45)';
      for (const [x, y] of [
        [27, 26],
        [38, 34],
        [30, 42],
      ])
        ctx.fillRect(x, y, 2, 2);
      break;
    case 'feather':
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-0.7);
      ctx.beginPath();
      ctx.ellipse(0, -4, 8, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 26);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    case 'shard':
      ctx.beginPath();
      ctx.moveTo(20, 46);
      ctx.lineTo(28, 16);
      ctx.lineTo(44, 22);
      ctx.lineTo(46, 44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(28, 18);
      ctx.lineTo(36, 22);
      ctx.lineTo(30, 34);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, seed: number): void {
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 0.85 + (((Math.sin(a * 3 + seed) + 1) / 2) * 0.3);
    const px = x + Math.cos(a) * rx * j;
    const py = y + Math.sin(a) * ry * j;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

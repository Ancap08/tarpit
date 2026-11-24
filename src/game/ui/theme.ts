import type Phaser from 'phaser';
import type { Rect } from '../input';

type Graphics = Phaser.GameObjects.Graphics;
export const THEME = {
  paper: 0xf1dfb5, ink: 0x352216, brass: 0xb68a48,
  wood: 0x422919, red: 0x843629, blue: 0x254a57,
} as const;
export const ink = '#352216';

export function panel(g: Graphics, r: Rect, fill: number = THEME.paper): void {
  g.fillStyle(fill).fillRect(r.x, r.y, r.width, r.height);
  g.lineStyle(2, THEME.brass).strokeRect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
}

export function rule(g: Graphics, cx: number, y: number, width: number): void {
  const half = width / 2;
  g.lineStyle(2, THEME.ink).lineBetween(cx - half, y, cx - 9, y).lineBetween(cx + 9, y, cx + half, y);
  g.fillStyle(THEME.red).fillTriangle(cx - 6, y, cx, y - 4, cx + 6, y)
    .fillTriangle(cx - 6, y, cx, y + 4, cx + 6, y);
}

export function coin(g: Graphics, x: number, y: number, r: number): void {
  g.fillStyle(0xf1c46a).fillCircle(x, y, r);
  g.lineStyle(1.5, THEME.wood).strokeCircle(x, y, r * 0.7);
}

export function lock(g: Graphics, x: number, y: number, size: number): void {
  g.lineStyle(2, THEME.brass).strokeCircle(x, y - size * 0.22, size * 0.30);
  g.fillStyle(THEME.brass).fillRoundedRect(x - size / 2, y - size * 0.18, size, size * 0.63, 2);
  g.fillStyle(THEME.wood).fillCircle(x, y + size * 0.07, size * 0.09);
}

export function ribbon(g: Graphics, cx: number, cy: number, w: number, h: number): void {
  for (const d of [-1, 1]) {
    const edge = cx + d * w / 2;
    g.fillStyle(0x62271e).fillPoints([
      {x: edge - d * 10, y: cy - h / 2 + 6}, {x: edge + d * 22, y: cy - h / 2 + 6},
      {x: edge + d * 14, y: cy + 6}, {x: edge + d * 22, y: cy + h / 2 + 6},
      {x: edge - d * 10, y: cy + h / 2 + 6},
    ], true);
  }
  g.fillStyle(THEME.red).fillRect(cx - w / 2, cy - h / 2, w, h);
  g.lineStyle(1, THEME.brass).strokeRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);
}

/** A handset broadside with a double keyline, pinned to the tavern boards. */
export function boards(g: Graphics, width: number, height: number): void {
  g.fillStyle(THEME.wood).fillRect(0, 0, width, height);
  for (let x = 48; x < width; x += 92) {
    g.lineStyle(3, 0x28190f).lineBetween(x, 0, x, height);
    g.lineStyle(1, 0x805134).lineBetween(x + 3, 0, x + 3, height);
  }
}

export function broadside(g: Graphics, width: number, height: number): void {
  boards(g, width, height);
  panel(g, { x: 8, y: 6, width: width - 16, height: height - 12 });
  g.lineStyle(1, THEME.brass).strokeRect(14, 12, width - 28, height - 24);
}

/** Engraved town vignette at the foot of the proclamation. */
export function town(g: Graphics, cx: number, base: number): void {
  const blocks = [[-72, 22, 15], [-45, 23, 21], [-15, 27, 31], [17, 18, 18], [39, 25, 13]];
  for (const [dx, w, h] of blocks) {
    const x = cx + dx;
    g.fillStyle(THEME.ink).fillRect(x, base - h, w, h)
      .fillTriangle(x - 3, base - h, x + w / 2, base - h - 11, x + w + 3, base - h);
    for (let i = 4; i < w - 3; i += 7) g.fillStyle(THEME.paper).fillRect(x + i, base - h + 5, 3, 5);
  }
  g.fillStyle(THEME.ink).fillTriangle(cx - 7, base - 40, cx - 2, base - 62, cx + 3, base - 40);
  rule(g, cx, base + 4, 190);
}

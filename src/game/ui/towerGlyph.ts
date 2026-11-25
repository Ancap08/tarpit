import type Phaser from 'phaser';
import type { TowerType } from '../../sim';

/** A small cut-out silhouette for each tower. Drawn on a centred 48-unit grid. */
export function towerGlyph(g: Phaser.GameObjects.Graphics, type: TowerType, x: number, y: number, size: number, a = 1): void {
  g.save().translateCanvas(x, y).scaleCanvas(size / 48, size / 48);
  const fill = (color: number) => g.fillStyle(color, a);
  const oval = (color: number, x: number, y: number, w: number, h: number) => fill(color).fillEllipse(x, y, w, h);
  const mark = (color: number, width: number) => g.lineStyle(width, color, a);
  oval(0x091a1c, 0, 16, 34, 8);
  switch (type) {
    case 'musketeer':
      fill(0xb49060).fillEllipse(0, 14, 31, 8);
      fill(0x16344f).fillRoundedRect(-11, -4, 20, 20, 6);
      fill(0x39759b).fillRoundedRect(-10, -4, 17, 12, 5);
      mark(0xf5c16e, 2).lineBetween(-7, -2, 4, 9);
      oval(0xc89563, -2, -8, 12, 11);
      fill(0x172c3a).fillTriangle(-14, -12, -4, -23, 10, -11);
      mark(0xdbad68, 2).lineBetween(-14, -12, 10, -11);
      mark(0xc68b54, 5).lineBetween(-9, 12, 16, -9);
      mark(0xc4cfc7, 2).lineBetween(2, 1, 20, -13);
      break;
    case 'cannon':
    case 'mortar': {
      const mortar = type === 'mortar';
      oval(0x956f50, 0, 12, 34, 13);
      const from = mortar ? -1 : -9;
      mark(0x111b26, 20).lineBetween(-7, 7, from + 9, -11);
      mark(mortar ? 0x8780a5 : 0x477a91, 15).lineBetween(-7, 5, from + 9, -12);
      oval(mortar ? 0xa8a1c0 : 0x93b1ba, from + 9, -12, 19, 16);
      oval(0x0f1d23, from + 9, -12, 12, 10);
      if (!mortar) {
        oval(0xc49863, -9, 10, 14, 14);
        oval(0x273138, -9, 10, 6, 6);
      }
      break;
    }
    case 'tarpit':
      oval(0x745442, 0, 8, 38, 18);
      oval(0xa37954, 0, 1, 36, 22);
      oval(0x241e27, 0, 1, 28, 16);
      oval(0x6d605d, -5, -1, 9, 4);
      oval(0xb6a48d, 6, 2, 3, 3);
      break;
    case 'longbow':
      fill(0xb48b61).fillEllipse(0, 14, 28, 8);
      mark(0x925e36, 5).lineBetween(0, 12, 0, -7);
      mark(0xf1b95f, 4).beginPath().arc(-9, -2, 16, -1.2, 1.2).strokePath();
      mark(0xf5e2ba, 1.3).lineBetween(-3, -17, -3, 13).lineBetween(-12, -2, 12, -2);
      fill(0xf2cb8b).fillTriangle(10, -5, 16, -2, 10, 1);
      break;
    case 'firepot':
      oval(0x986345, 0, 10, 30, 15);
      oval(0x50403b, 0, 4, 31, 18);
      oval(0xb48e69, 0, 2, 29, 13);
      oval(0x372829, 0, 1, 23, 8);
      fill(0xf78245).fillTriangle(-9, 2, -2, -17, 3, 3).fillTriangle(-4, 3, 8, -21, 9, 1);
      fill(0xffd587).fillTriangle(-4, 3, 3, -10, 6, 3);
      break;
  }
  g.restore();
}

import type Phaser from 'phaser';
import type { BoonId } from '../../sim';
import { COLORS } from '../palette';

// Each silhouette fits within a 32 px tile centred on the Graphics origin.
export function drawBoonIcon(g: Phaser.GameObjects.Graphics, id: BoonId): void {
  const gold = COLORS.sparkle;
  const iron = COLORS.shieldMark;
  const orange = COLORS.fireFlame;
  const ink = COLORS.menuBg;
  const line = (x1: number, y1: number, x2: number, y2: number, color: number = gold, width = 2.5) =>
    g.lineStyle(width, color, 1).lineBetween(x1, y1, x2, y2);
  const polygon = (points: number[], color: number) => {
    g.fillStyle(color).beginPath().moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.closePath().fillPath();
  };
  switch (id) {
    case 'longBarrels':
      line(-10, 8, 10, -8, iron, 9);
      line(7, -10, 12, -4, gold, 6);
      g.fillStyle(ink).fillCircle(-8, 8, 6).fillCircle(4, 8, 6);
      g.fillStyle(gold).fillCircle(-8, 8, 2.5).fillCircle(4, 8, 2.5);
      break;
    case 'keenArrows':
      line(-10, 10, 9, -9);
      polygon([12, -12, 0, -10, 10, 0], gold);
      polygon([-12, 12, -12, 4, -5, 0, -4, 7], iron);
      break;
    case 'warChest':
      g.fillStyle(orange).fillRoundedRect(-14, -10, 28, 21, 4);
      g.fillStyle(ink).fillRect(-14, -2, 28, 3);
      g.fillStyle(gold).fillRoundedRect(-4, -4, 8, 9, 2);
      g.fillStyle(ink).fillCircle(0, 0, 1.5);
      break;
    case 'stickyTar':
      // A lifted boot pulls two strings of tar out of the puddle.
      g.fillStyle(COLORS.tarSheen).fillEllipse(0, 10, 30, 10);
      g.fillStyle(COLORS.tarSplat).fillEllipse(0, 10, 25, 6);
      line(-6, 2, -7, 10, COLORS.tarSheen, 2.5);
      line(4, 3, 2, 10, COLORS.tarSheen, 2.5);
      polygon([-10, -13, 0, -13, 0, -6, 9, -5, 13, -2, 12, 2, -9, 3], gold);
      line(-10, -12, 1, -12, COLORS.tarpitHighlight, 3);
      line(-7, 3, 11, 2, COLORS.tarSheen, 2.5);
      break;
    case 'hotCoals':
      polygon([-12, 10, -12, 2, -7, -5, -5, 0, 0, -14, 6, -6, 7, 0, 11, -3, 13, 7, 8, 12, -7, 12], COLORS.burnRing);
      polygon([-6, 10, -6, 5, 0, -4, 5, 3, 7, 9, 4, 12, -3, 12], gold);
      break;
    case 'quickHands':
      line(-13, -7, -6, -7, gold);
      line(-16, 0, -7, 0, gold);
      line(-12, 7, -6, 7, gold);
      g.fillStyle(gold).fillCircle(3, 0, 12);
      g.fillStyle(COLORS.longbowString).fillCircle(3, 0, 9.5);
      line(3, -7, 3, 0, ink, 2.5);
      line(3, 0, 9, 3, ink, 2.5);
      g.fillStyle(ink).fillCircle(3, 0, 1.8);
      break;
    case 'stoneWalls':
      polygon([-14, 12, -14, -11, -8, -11, -8, -5, -3, -5, -3, -11, 3, -11, 3, -5, 8, -5, 8, -11, 14, -11, 14, 12], iron);
      line(-13, 2, 13, 2, ink, 2);
      g.fillStyle(ink).fillRoundedRect(-4, 5, 8, 9, 2);
      break;
    case 'veteranCrews':
      polygon([0, -14, 4, -4, 14, -3, 6, 4, 9, 14, 0, 8, -9, 14, -6, 4, -14, -3, -4, -4], gold);
      g.fillStyle(orange).fillCircle(0, 1, 4);
      break;
    case 'biggerBlasts':
      polygon([0, -15, 4, -7, 12, -12, 9, -4, 15, 0, 7, 3, 11, 12, 3, 8, 0, 15, -4, 7, -12, 11, -8, 3, -15, 0, -8, -4, -12, -11, -3, -8], orange);
      g.fillStyle(gold).fillCircle(0, 0, 5);
      break;
  }
}

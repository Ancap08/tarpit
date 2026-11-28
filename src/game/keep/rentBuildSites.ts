import type Phaser from 'phaser';
import type { Cell, GameState, Point } from '../../sim';
import type { Layout } from '../layout';
import type { GameScene } from '../GameScene';

const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

/** A socket is part of the field. Its square below the + is where the
 * player's build click already lands. Only vacant sockets are painted. */
export class RentBuildSites {
  private readonly sockets: { cell: Cell; marker: Phaser.GameObjects.Graphics }[];

  constructor(scene: GameScene, layout: Layout, layer: Phaser.GameObjects.Container) {
    const { map } = scene.state;
    this.sockets = (map.buildSites ?? []).map(cell => {
      const p = layout.cellCenter(cell);
      const marker = scene.add.graphics().setName(`rent-site:${cell.col}:${cell.row}`);
      const high = map.highSites?.some(site => sameCell(cell, site)) ?? false;
      paintSocket(marker, { x: p.x - layout.map.x, y: p.y - layout.map.y }, high);
      layer.add(marker);
      return { cell, marker };
    });
  }

  update(state: GameState): void {
    for (const { cell, marker } of this.sockets) {
      marker.setVisible(!state.towers.some(tower => sameCell(cell, tower.cell)));
    }
  }
}

function paintSocket(g: Phaser.GameObjects.Graphics, { x, y }: Point, high: boolean): void {
  const ink = high ? 0x392b1c : 0x162e26;
  const rim = high ? 0xefcc7f : 0xbbe3bb;
  if (high) {
    const points = [{ x: x - 16, y }, { x: x - 10, y: y - 9 }, { x: x + 10, y: y - 9 },
      { x: x + 16, y }, { x: x + 10, y: y + 9 }, { x: x - 10, y: y + 9 }];
    g.fillStyle(ink).fillPoints(points, true).lineStyle(2.5, rim).strokePoints(points, true);
  } else {
    g.fillStyle(0x3a5940, .65).fillEllipse(x + 1, y + 3, 36, 27);
    g.fillStyle(ink).fillEllipse(x, y, 34, 25);
    g.lineStyle(2.5, rim).strokeEllipse(x, y, 30, 21);
  }
  g.lineStyle(2.5, rim).lineBetween(x - 5, y, x + 5, y).lineBetween(x, y - 5, x, y + 5);
}

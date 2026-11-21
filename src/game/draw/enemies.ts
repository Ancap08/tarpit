// Enemies: a coloured circle per type, an hp bar when hurt, a tar ring when slowed.

import type Phaser from 'phaser';
import { ENEMY_STATS, enemyPosition, type EnemyType, type GameState } from '../../sim';
import { COLORS } from '../palette';

const LOOK: Record<EnemyType, { radius: number; fill: number; edge: number }> = {
  goblin: { radius: 10, fill: COLORS.goblin, edge: COLORS.goblinEdge },
  wolf: { radius: 8, fill: COLORS.wolf, edge: COLORS.wolfEdge },
  troll: { radius: 16, fill: COLORS.troll, edge: COLORS.trollEdge },
};

const BAR_HEIGHT = 4;

export function drawEnemies(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    const { x, y } = enemyPosition(enemy);
    const look = LOOK[enemy.type];

    if (enemy.slowTicksLeft > 0) {
      g.lineStyle(3, COLORS.tarRing, 1);
      g.strokeCircle(x, y, look.radius + 3);
    }

    g.fillStyle(look.fill, 1);
    g.fillCircle(x, y, look.radius);
    g.lineStyle(1.5, look.edge, 1);
    g.strokeCircle(x, y, look.radius);

    const maxHp = ENEMY_STATS[enemy.type].hp;
    if (enemy.hp < maxHp) {
      const w = Math.max(16, look.radius * 2);
      const top = y - look.radius - 8;
      g.fillStyle(COLORS.hpBack, 1);
      g.fillRect(x - w / 2, top, w, BAR_HEIGHT);
      g.fillStyle(COLORS.hpFill, 1);
      g.fillRect(x - w / 2, top, (w * Math.max(0, enemy.hp)) / maxHp, BAR_HEIGHT);
    }
  }
}

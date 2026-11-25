import type Phaser from 'phaser';
import type { GameState, Gate } from '../../sim';
import type { Layout } from '../layout';

/** Trace the unpainted branch on the separate Old Keep exhibition. */
export function drawSiegeRoads(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const road of state.map.otherRoads ?? []) {
    const points = [...road.approach, state.map.path[road.joinIndex]];
    g.lineStyle(32, 0x251d1c, 0.86).strokePoints(points);
    g.lineStyle(24, 0x746053, 0.9).strokePoints(points);
  }
}

/** Set the painted sill on the same simulation point that stops the walkers. */
export function drawGateMarker(g: Phaser.GameObjects.Graphics, gate: Gate | undefined,
    layout: Layout, painted?: Phaser.GameObjects.Image): void {
  if (gate && painted) {
    const health = gate.hp / gate.maxHp;
    const frame = gate.fallen || health <= 0 ? '3' : health <= 1 / 3 ? '2' : health <= 2 / 3 ? '1' : '0';
    if (painted.frame.name !== frame) painted.setFrame(frame);
    const position = layout.toScreen(gate);
    painted.setPosition(position.x - layout.map.x, position.y - layout.map.y);
    return;
  }
  if (gate && !gate.fallen) {
    const x = Math.sin(gate.angle) * 24;
    const y = Math.cos(gate.angle) * 24;
    g.lineStyle(6, 0xdeb677, 1).lineBetween(gate.x - x, gate.y + y, gate.x + x, gate.y - y);
  }
}

import type Phaser from 'phaser';
import type { GameState } from '../../sim';

/** Trace the unpainted branches and the gate line until the siege plates are ready. */
export function drawSiegeRoads(g: Phaser.GameObjects.Graphics, state: GameState): void {
  if (!state.map.otherRoads?.length) return;
  for (const road of state.map.otherRoads) {
    const points = [...road.approach, state.map.path[road.joinIndex]];
    g.lineStyle(32, 0x251d1c, 0.86).strokePoints(points);
    g.lineStyle(24, 0x746053, 0.9).strokePoints(points);
  }
  const gate = state.gate;
  if (gate && !gate.fallen) {
    const x = Math.sin(gate.angle) * 24;
    const y = Math.cos(gate.angle) * 24;
    g.lineStyle(6, 0xdeb677, 1).lineBetween(gate.x - x, gate.y + y, gate.x + x, gate.y - y);
  }
}

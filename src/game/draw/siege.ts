import type Phaser from 'phaser';
import { resolveMap } from '../../sim/map';
import type { GameState } from '../../sim';

const keepMap = resolveMap('keep');

/** Trace the unpainted branches and the gate line until the siege plates are ready. */
export function drawSiegeRoads(g: Phaser.GameObjects.Graphics, state: GameState): void {
  if (state.map.id !== 'keep') return;
  const westernRoad = state.level?.keepRoads === 'west';
  const branches = westernRoad ? keepMap.otherRoads : state.map.otherRoads;
  for (const road of branches ?? []) {
    const points = [...road.approach, (westernRoad ? keepMap : state.map).path[road.joinIndex]];
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

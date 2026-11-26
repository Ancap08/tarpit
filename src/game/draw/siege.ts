import type Phaser from 'phaser';
import { TICKS_PER_SECOND, type GameState, type Gate, type Point } from '../../sim';
import type { Layout } from '../layout';
import { gateDamageStage } from '../keep/siegeTiming';
import { GATE_TEXT } from '../names';
import { HUD_FONT } from '../palette';
import { skinFor } from '../ui/newTheme';
import { drawGateMoment, gateMomentDuration, gateMomentTile, SIEGE_MACHINE_KEY, updateGatePose, type GateMoment } from './siegeMachines';

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
    const frame = String(gateDamageStage(gate));
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

interface GateTransition {
  type: GateMoment['type'];
  at: number;
}

export interface GateHistory {
  stage?: number;
  transition?: GateTransition;
}

/** Field-time presentation derived from the gate; controls and the sim
 * can continue using the exact HP, sill and remaining tick count. */
export class SiegeGateEffects {
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly tile: Phaser.GameObjects.Image;
  private readonly signal?: Phaser.GameObjects.Graphics;
  private readonly caption?: Phaser.GameObjects.Text;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(scene: Phaser.Scene, private readonly layout: Layout, private readonly frozen: boolean,
      readonly history: GateHistory = {}) {
    this.effects = scene.add.graphics();
    this.tile = scene.add.image(0, 0, SIEGE_MACHINE_KEY, 'debris').setVisible(false);
    // Clean displays the countdown in the fixed gate panel. Keep the
    // on-field bell and the tower effects in both interfaces.
    if (skinFor(scene) !== 'battle') {
      this.signal = scene.add.graphics().setDepth(2);
      this.caption = scene.add.text(0, 0, '', {
        fontFamily: HUD_FONT, fontSize: '20px', fontStyle: 'bold', color: '#fff0bf',
        metrics: { ascent: 19, descent: 5, fontSize: 24 },
      }).setOrigin(.5).setDepth(2).setVisible(false);
    }
  }

  get fixed(): Phaser.GameObjects.GameObject[] { return this.signal && this.caption ? [this.signal, this.caption] : []; }

  update(state: GameState, painted: Phaser.GameObjects.Image, now: number, project: (p: Point) => Point, showing: boolean): void {
    this.effects.clear();
    this.signal?.clear();
    this.tile.setVisible(false);
    this.caption?.setVisible(false);
    const gate = state.gate;
    if (!gate) return;
    const stage = gateDamageStage(gate);
    const before = this.history.stage;
    if (before !== undefined && before !== stage && !this.frozen) {
      this.history.transition = { type: stage === 3 ? 'fall' : stage > before ? 'damage' : 'repair', at: now };
    }
    this.history.stage = stage;
    const transition = this.history.transition;
    const age = transition ? now - transition.at : Infinity;
    const moment = transition && age < gateMomentDuration(transition.type) ? { type: transition.type, elapsedMs: age } : undefined;
    const still = this.frozen || this.reduced.matches;
    const sill = this.layout.toScreen(gate);
    updateGatePose(painted, moment, still);
    if (moment) {
      const tile = gateMomentTile(sill, moment, still);
      if (tile) this.tile.setVisible(true).setFrame(tile.frame).setPosition(tile.x, tile.y)
        .setDisplaySize(tile.width, tile.height).setOrigin(.5, tile.originY).setRotation(tile.angle).setAlpha(tile.alpha);
      drawGateMoment(this.effects, sill, moment, still);
    }
    if (gate.lastStandTicksLeft <= 0 || !showing) return;
    this.lastStand(sill, state, project, still ? 0 : now - (transition?.at ?? now));
  }

  private lastStand(sill: Point, state: GameState, project: (p: Point) => Point, age: number): void {
    if (this.signal && this.caption) {
      const p = project({ x: sill.x + 65, y: sill.y - 75 });
      const x = Math.max(98, Math.min(this.layout.width - 98, p.x));
      const y = Math.max(84, p.y);
      const text = GATE_TEXT.countdown(Math.ceil(state.gate!.lastStandTicksLeft / TICKS_PER_SECOND));
      this.caption.setVisible(true).setPosition(x, y);
      if (text !== this.caption.text) this.caption.setText(text);
      this.signal.fillStyle(0x2a211d, .94).fillRoundedRect(x - 91, y - 16, 182, 32, 4);
      this.signal.lineStyle(2, 0xeabf72, .98).strokeRoundedRect(x - 91, y - 16, 182, 32, 4);
    }

    const bell = { x: sill.x - 58, y: sill.y - 87 };
    const g = this.effects;
    const swing = age < 1850 ? Math.sin(age * .022) * 6 * (1 - age / 2300) : 0;
    g.fillStyle(0x211b24, .93).fillRoundedRect(bell.x - 12, bell.y - 12, 24, 29, 7);
    g.lineStyle(2, 0xd6a66a, .9).strokeRoundedRect(bell.x - 12, bell.y - 12, 24, 29, 7);
    g.fillStyle(0xf4ca73).fillTriangle(bell.x - 7 + swing, bell.y + 9, bell.x + 7 + swing, bell.y + 9, bell.x, bell.y - 8);
    g.fillEllipse(bell.x + swing, bell.y + 8, 16, 5);
    g.fillStyle(0xffe2a0).fillCircle(bell.x + swing, bell.y + 11, 2);
    if (age < 1850) {
      g.lineStyle(2, 0xffdf8a, .65);
      for (const side of [-1, 1]) {
        g.lineBetween(bell.x + side * 16, bell.y + 1, bell.x + side * (22 + Math.abs(swing)), bell.y - 3);
        g.lineBetween(bell.x + side * 16, bell.y + 6, bell.x + side * (22 + Math.abs(swing)), bell.y + 8);
      }
    }
    const flare = .67 + .22 * Math.cos(age * .013);
    for (const tower of state.towers) {
      const at = this.layout.cellCenter(tower.cell);
      g.fillStyle(0xffc45f, .14 * flare).fillEllipse(at.x, at.y + 1, 54, 25);
      g.lineStyle(2, 0xffdc83, flare).strokeEllipse(at.x, at.y + 1, 42, 16);
      g.fillStyle(0xffdf96, flare);
      for (const dx of [-16, 17]) g.fillTriangle(at.x + dx - 3, at.y - 3, at.x + dx + 3, at.y - 3,
        at.x + dx, at.y - 13 - 4 * flare);
    }
  }
}

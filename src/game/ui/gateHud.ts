import type Phaser from 'phaser';
import { repairStatus, type GameState, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { GATE_TEXT } from '../names';
import { COLORS, HUD_FONT, TEXT } from '../palette';
import { Button } from './button';

export class GateHud {
  private readonly bounds: Rect;
  private readonly backing: Phaser.GameObjects.Rectangle;
  private readonly status: Phaser.GameObjects.Text;
  private readonly lastStand: Phaser.GameObjects.Text;
  private readonly repair: Button;
  private readonly warning: Phaser.GameObjects.Text;
  private readonly repairAction: HTMLButtonElement;

  constructor(scene: Phaser.Scene, layout: Layout, onRepair: () => void) {
    // Beside the boss readout in landscape. On phones its bottom edge
    // stays above the wave banner, including when the Repair plaque opens.
    const portrait = layout.turned;
    const y = layout.map.y + (portrait ? 58 : 8);
    const width = portrait ? 214 : 196;
    const height = portrait ? 60 : 62;
    const x = portrait ? 8 : 4;
    const repairHeight = portrait ? 80 : height;
    this.bounds = { x, y, width, height };
    this.backing = scene.add.rectangle(x, y, width, height, COLORS.bossBarBg).setOrigin(0);
    this.backing.setStrokeStyle(1, COLORS.bossBarEdge);
    const size = portrait ? 22 : 20;
    const style = {
      fontFamily: HUD_FONT, fontSize: `${size}px`, fontStyle: 'bold', color: TEXT.hud,
      metrics: { ascent: size, descent: 5, fontSize: size + 5 },
    };
    this.status = scene.add.text(x + width / 2, y + height / 2, '', style).setOrigin(0.5);
    this.lastStand = scene.add.text(x + width / 2, y + height * 0.75, GATE_TEXT.lastStand, style)
      .setOrigin(0.5).setColor(TEXT.livesFlash).setVisible(false);
    this.repair = new Button(scene, {
      x: x + width + 4, y: y + height - repairHeight, width: portrait ? 212 : 176, height: repairHeight,
    }, '', onRepair, {
      fontSize: `${size}px`,
    });
    this.repair.labelObjects[0].setStyle({ metrics: style.metrics });
    this.repair.setShown(false);
    const rect = this.repair.rect;
    const warningSize = portrait ? 20 : 16;
    this.warning = scene.add.text(rect.x + rect.width / 2, rect.y + rect.height * 0.71, '', {
      ...style, fontSize: `${warningSize}px`, metrics: { ascent: warningSize, descent: 5, fontSize: warningSize + 5 },
    }).setOrigin(0.5).setVisible(false);

    this.repairAction = document.createElement('button');
    this.repairAction.className = 'repair-action';
    this.repairAction.hidden = true;
    this.repairAction.onclick = onRepair;
    scene.game.canvas.after(this.repairAction);
    const fit = () => {
      const r = this.repair.rect;
      const { canvasBounds: b, displayScale: s } = scene.scale;
      Object.assign(this.repairAction.style, {
        left: `${b.x + r.x / s.x}px`, top: `${b.y + r.y / s.y}px`,
        width: `${r.width / s.x}px`, height: `${r.height / s.y}px`,
      });
    };
    fit();
    scene.scale.on('resize', fit);
    scene.events.once('shutdown', () => {
      scene.scale.off('resize', fit);
      this.repairAction.remove();
    });
  }

  update(state: GameState, paused: boolean): void {
    const gate = state.gate!;
    const shown = state.phase === 'setup' || state.phase === 'wave';
    const active = shown && gate.lastStandTicksLeft > 0;
    const text = gate.fallen ? GATE_TEXT.fallen : GATE_TEXT.health(gate.hp, gate.maxHp);
    const { x, y, width, height } = this.bounds;
    const setup = state.phase === 'setup' && !gate.fallen && !paused;
    const top = setup ? this.repair.rect.y : y;
    const panelHeight = height + y - top;
    if (this.status.text !== text) this.status.setText(text);
    this.status.setY(top + panelHeight * (active ? 0.25 : 0.5)).setVisible(shown);
    this.backing.setPosition(x, top).setSize(width, panelHeight).setVisible(shown);
    this.lastStand.setVisible(active);
    const quote = repairStatus(state);
    const repair = GATE_TEXT.repair(quote.cost);
    const warning = GATE_TEXT.repairWarning(state.level?.feat ?? state.fixedFeat, state.boughtRepair);
    const enabled = !state.pendingBoon && !paused && quote.ok;
    this.repair.set(repair, enabled);
    const rect = this.repair.rect;
    this.repair.labelObjects[0].setY(rect.y + rect.height * (warning ? 0.32 : 0.5));
    if (this.warning.text !== warning) {
      this.warning.setText(warning);
      this.warning.setScale(warning ? Math.min(1, (rect.width - 12) / this.warning.width) : 1, 1);
    }
    this.warning.setVisible(setup && !!warning);
    this.repairAction.disabled = !enabled;
    const accessibleLabel = warning ? `${repair}. ${warning}` : repair;
    if (this.repairAction.textContent !== accessibleLabel) this.repairAction.textContent = accessibleLabel;
    this.repairAction.hidden = !setup;
    this.repair.setShown(setup);
  }

  get repairRect(): Rect | undefined {
    return this.repairAction.hidden ? undefined : this.repair.rect;
  }

  rects(): Record<string, Rect> {
    const { x, width, height, y } = this.bounds;
    const top = this.backing.y;
    return {
      ...(this.status.visible ? { gate: { x, y: top, width, height: height + y - top } } : {}),
      ...(this.repairRect ? { repair: this.repairRect } : {}),
    };
  }
}

import type Phaser from 'phaser';
import { repairStatus, TICKS_PER_SECOND, type GameState, type Rect } from '../../sim';
import { CLEAN_SIEGE_PHONE_HEADER, type Layout } from '../layout';
import { GATE_TEXT } from '../names';
import { COLORS, HUD_FONT, TEXT } from '../palette';
import { Button } from './button';
import { DeviceTextFit, textSlot } from './deviceText';
import { CLEAN, glyph, rounded, sans, skinFor, textMetrics } from './newTheme';

export class GateHud {
  private readonly bounds: Rect;
  private readonly backing?: Phaser.GameObjects.Rectangle;
  private readonly plate?: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.Text;
  private readonly lastStand: Phaser.GameObjects.Text;
  private readonly repair: Button;
  private readonly warning: Phaser.GameObjects.Text;
  private readonly repairAction: HTMLButtonElement;
  private readonly health?: Phaser.GameObjects.Graphics;
  private lastFraction = -1;
  private lastBarTop = -1;
  private readonly portrait: boolean;
  private readonly statusFit = new DeviceTextFit();
  private readonly lastStandFit = new DeviceTextFit();
  private readonly warningFit = new DeviceTextFit();
  private readonly size: number;

  constructor(scene: Phaser.Scene, layout: Layout, onRepair: () => void, private readonly siege = false) {
    // Beside the boss readout in landscape. On phones its bottom edge
    // stays above the wave banner, including when the Repair plaque opens.
    const portrait = this.portrait = layout.turned;
    const clean = skinFor(scene) === 'battle';
    const y = (clean && portrait ? CLEAN_SIEGE_PHONE_HEADER : layout.map.y) + (clean ? 10 : portrait ? siege ? 68 : 58 : 8);
    const width = clean ? portrait ? 250 : 222 : portrait ? 214 : 196;
    const height = clean ? portrait ? 96 : 63 : portrait ? siege ? 68 : 60 : 62;
    const x = clean ? 12 : portrait ? 8 : 4;
    const repairHeight = clean ? height : portrait ? 80 : height;
    this.bounds = { x, y, width, height };
    if (clean) {
      this.plate = scene.add.graphics();
      rounded(this.plate, this.bounds);
      glyph(this.plate, 'gate', x + (portrait ? 31 : 24), y + height * .3, portrait ? 31 : 23, CLEAN.mint);
    } else {
      this.backing = scene.add.rectangle(x, y, width, height, COLORS.bossBarBg).setOrigin(0);
      this.backing.setStrokeStyle(1, COLORS.bossBarEdge);
    }
    if (siege) this.health = scene.add.graphics().setName('gate-health');
    const size = this.size = clean ? portrait ? 27 : 17 : portrait ? 22 : 20;
    const style = {
      fontFamily: HUD_FONT, fontSize: `${size}px`, fontStyle: 'bold', color: TEXT.hud,
      metrics: { ascent: size, descent: 5, fontSize: size + 5 },
    };
    const make = (cx: number, cy: number, text: string) => (clean ? sans(scene, cx, cy, text, size, CLEAN.ink, true)
      : scene.add.text(cx, cy, text, style)).setOrigin(.5);
    this.status = make(x + width / 2, y + height / 2, '').setName('gate-status');
    this.lastStand = make(x + width / 2, y + height * 0.75, GATE_TEXT.lastStand)
      .setOrigin(0.5).setName('gate-last-stand').setColor(TEXT.livesFlash).setVisible(false);
    this.repair = new Button(scene, {
      x: x + width + (clean ? 8 : 4), y: y + height - repairHeight,
      width: clean ? portrait ? 302 : 222 : portrait ? 212 : 176, height: repairHeight,
    }, '', onRepair, {
      fontSize: `${size}px`, ...(clean ? { icon: 'repair', semibold: true } : {}),
    });
    if (!clean) this.repair.labelObjects[0].setStyle({ metrics: style.metrics });
    this.repair.setShown(false);
    const rect = this.repair.rect;
    const warningSize = clean ? portrait ? 25 : 15 : portrait ? 20 : 16;
    this.warning = scene.add.text(rect.x + rect.width / 2, rect.y + rect.height * (clean ? .73 : .71), '', {
      ...style, fontSize: `${warningSize}px`, metrics: { ascent: warningSize, descent: 5, fontSize: warningSize + 5 },
      ...(clean ? { fontFamily: this.status.style.fontFamily, fontStyle: 'normal', color: CLEAN.gold, metrics: textMetrics(warningSize) } : {}),
    }).setOrigin(0.5).setName('gate-repair-warning').setVisible(false);

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
    const text = gate.fallen ? GATE_TEXT.fallen : this.siege && !this.plate ? GATE_TEXT.label : GATE_TEXT.health(gate.hp, gate.maxHp);
    const { x, y, width, height } = this.bounds;
    const setup = state.phase === 'setup' && !gate.fallen && !paused;
    const top = setup ? this.repair.rect.y : y;
    const panelHeight = height + y - top;
    if (this.status.text !== text) this.status.setText(text);
    const upper = active || (this.siege && !gate.fallen);
    const labelPosition = upper ? (this.siege ? 0.28 : 0.25) : 0.5;
    this.status.setY(top + panelHeight * labelPosition).setVisible(shown);
    this.backing?.setPosition(x, top).setSize(width, panelHeight).setVisible(shown);
    this.plate?.setVisible(shown);
    this.lastStand.setVisible(active);
    if (this.plate) {
      this.status.setPosition(x + width / 2 + 10, y + height * (gate.fallen && !active ? .5 : .3));
      const textArea = { x: x + (this.portrait ? 50 : 39), y, width: width - (this.portrait ? 50 : 39), height };
      this.status.setVisible(shown && this.statusFit.fit(this.size, [textSlot(this.status, textArea)]));
      const bar = this.health!;
      const barWidth = width - 32;
      const fraction = Math.max(0, Math.round(barWidth * gate.hp / gate.maxHp));
      if (fraction !== this.lastFraction) {
        this.lastFraction = fraction;
        const trough = { x: x + 16, y: y + Math.round(height * .6), width: barWidth, height: this.portrait ? 14 : 10 };
        bar.clear();
        rounded(bar, trough, CLEAN.ground, CLEAN.edge, 5);
        if (fraction > 0) rounded(bar, { ...trough, x: trough.x + 1, y: trough.y + 1,
          width: Math.min(barWidth - 2, fraction), height: trough.height - 2 },
        gate.hp / gate.maxHp > .3 ? CLEAN.mint : CLEAN.rose, gate.hp / gate.maxHp > .3 ? CLEAN.mint : CLEAN.rose, 4);
      }
      bar.setVisible(shown && !gate.fallen);
    } else if (this.health) {
      const fraction = Math.max(0, Math.min(1, gate.hp / gate.maxHp));
      const barTop = top + panelHeight * 0.63;
      if (fraction !== this.lastFraction || barTop !== this.lastBarTop) {
        this.lastFraction = fraction;
        this.lastBarTop = barTop;
        const inset = 15, barHeight = this.portrait ? 13 : 11;
        const barWidth = width - 2 * inset;
        this.health.clear().fillStyle(COLORS.bossBarEdge).fillRect(x + inset - 1, barTop - 1, barWidth + 2, barHeight + 2)
          .fillStyle(COLORS.hudBar).fillRect(x + inset, barTop, barWidth, barHeight)
          .fillStyle(fraction > 0.3 ? 0xb99b52 : 0xc76e55).fillRect(x + inset, barTop, barWidth * fraction, barHeight);
      }
      this.health.setVisible(shown && !gate.fallen);
    }
    if (active && this.health) {
      const label = GATE_TEXT.countdown(Math.ceil(gate.lastStandTicksLeft / TICKS_PER_SECOND));
      if (this.lastStand.text !== label) this.lastStand.setText(label);
      if (this.plate) this.lastStand.setVisible(this.lastStandFit.fit(this.portrait ? 25 : 15, [textSlot(this.lastStand, this.bounds)]));
    }
    const quote = repairStatus(state);
    const repair = GATE_TEXT.repair(quote.cost);
    const warning = GATE_TEXT.repairWarning(state.level?.feat ?? state.fixedFeat, state.boughtRepair);
    const enabled = !state.pendingBoon && !paused && quote.ok;
    const rect = this.repair.rect;
    if (this.plate) this.repair.setLabelCenter(warning ? rect.height * .28 : undefined);
    this.repair.set(repair, enabled);
    if (!this.plate) this.repair.labelObjects[0].setY(rect.y + rect.height * (warning ? 0.32 : 0.5));
    if (this.warning.text !== warning) {
      this.warning.setText(warning);
      if (!this.plate) this.warning.setScale(warning ? Math.min(1, (rect.width - 12) / this.warning.width) : 1, 1);
    }
    this.warning.setVisible(setup && !!warning &&
      (!this.plate || this.warningFit.fit(this.portrait ? 25 : 15, [textSlot(this.warning, rect)])));
    if (this.plate) {
      const color = quote.cost !== undefined && state.gold < quote.cost ? '#ffb0a7' : enabled ? CLEAN.ink : CLEAN.subdued;
      const label = this.repair.labelObjects[0];
      if (label.style.color !== color) label.setColor(color);
    }
    if (this.repairAction.disabled === enabled) this.repairAction.disabled = !enabled;
    const accessibleLabel = warning ? `${repair}. ${warning}` : repair;
    if (this.repairAction.textContent !== accessibleLabel) this.repairAction.textContent = accessibleLabel;
    if (this.repairAction.hidden === setup) this.repairAction.hidden = !setup;
    this.repair.setShown(setup);
  }

  get repairRect(): Rect | undefined {
    return this.repairAction.hidden ? undefined : this.repair.rect;
  }

  rects(): Record<string, Rect> {
    const { x, width, height, y } = this.bounds;
    const top = this.backing?.y ?? y;
    return {
      ...(this.plate?.visible || this.status.visible ? { gate: { x, y: top, width, height: height + y - top } } : {}),
      ...(this.repairRect ? { repair: this.repairRect } : {}),
    };
  }
}

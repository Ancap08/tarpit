// The playing field: renders the simulation and runs it on a fixed step.
//
// Time: update() accumulates real time and runs one simulation tick per
// 1/60 s, times the speed (1x or 2x), at most MAX_TICKS_PER_FRAME per frame.
// In test mode (?test=1) update() runs no ticks; tests drive time with
// advance() through window.__tarpit.step().
//
// Build UI (milestone 9): the HUD's build bar picks a tower type. With a
// pick active, the hovered map cell is tinted green (buildable) or red (not),
// and a buildable cell shows a ghost of the tower with its range circle.
// Clicking a buildable cell builds there and keeps the pick, so the player
// can keep placing; the pick clears when the same bar button is clicked
// again, on Escape, when gold drops below its cost, or when a tower is
// clicked (which selects that tower instead). Without a pick, clicking a
// tower selects it and opens the tower panel; clicking empty map or pressing
// Escape deselects. A pick and a selection never coexist. Everything works in
// setup and mid-wave. The scene changes the simulation only through its
// exported actions.
//
// End of game: every redraw checks the sim's phase; once it is 'won' or
// 'lost' the end screen shows (once), the pick and panel clear, the bar greys
// and map input is ignored.
// [Play again] restarts this scene: Phaser shuts it down (destroying every
// game object and the input and keyboard listeners) and runs create() again,
// which makes a fresh createGame() and resets speed to 1x.

import Phaser from 'phaser';
import {
  buildTower,
  CELL,
  cellCenter,
  createGame,
  isBuildable,
  sellTower,
  startWave,
  tick,
  TICKS_PER_SECOND,
  TOWER_DEFS,
  towerAt,
  towerStats,
  upgradeTower,
} from '../sim';
import type { BuildResult, Cell, GameState, SellResult, StartWaveResult, TowerType, UpgradeResult } from '../sim';
import { drawEnemies } from './draw/enemies';
import { TowerLabels } from './draw/labels';
import { drawMap } from './draw/map';
import { ShotEffects } from './draw/shots';
import { Aim, drawTowerShape, drawTowers } from './draw/towers';
import { Hud } from './hud';
import { cellAt, cellRect, classifyClick, contains, type Rect } from './input';
import { COLORS } from './palette';
import { isTestMode } from './testMode';
import { canPick } from './ui/buildBar';
import { EndScreen } from './ui/endScreen';
import { endKind, type EndKind } from './ui/endText';
import { TowerPanel } from './ui/towerPanel';

const STEP_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 8;

export type Speed = 1 | 2;

/** Build UI state, as the test hook ui() reports it. */
export interface UiState {
  /** The build bar's active pick, or null. */
  pick: TowerType | null;
  /** The map cell under the pointer (not under the panel), or null. */
  hoverCell: Cell | null;
  /** The selected tower's cell (its panel is open), or null. */
  selectedCell: Cell | null;
  panelOpen: boolean;
}

/** Placement ghost opacity. */
const GHOST_ALPHA = 0.6;
/** Placement cell highlight: fill opacity and outline width. */
const CELL_FILL_ALPHA = 0.25;
const CELL_LINE = 2;

export class GameScene extends Phaser.Scene {
  state: GameState = createGame();
  speed: Speed = 1;
  private accMs = 0;
  private dynamic!: Phaser.GameObjects.Graphics;
  private labels!: TowerLabels;
  private overlay!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private panel!: TowerPanel;
  private endScreen!: EndScreen;
  /** The build bar's active pick, or null. */
  private pick: TowerType | null = null;
  /** Last pointer position over the canvas, or null once it leaves. */
  private pointer: { x: number; y: number } | null = null;
  /** The map cell under the pointer (recomputed on every redraw), or null. */
  private hoverCell: Cell | null = null;
  private cursor = 'default';
  private shots = new ShotEffects();
  private aim = new Aim();
  private readonly autoTick = !isTestMode();

  constructor() {
    super('game');
  }

  create(): void {
    this.state = createGame();
    this.speed = 1;
    this.accMs = 0;
    this.shots = new ShotEffects();
    this.aim = new Aim();

    this.pick = null;
    this.pointer = null;
    this.hoverCell = null;
    this.cursor = 'default';

    // Draw order: map, overlay (cell highlight, range circles, ghost), towers
    // and enemies, tower labels, HUD (which covers any range circle reaching
    // below the map), then the panel and the end screen on top.
    drawMap(this.add.graphics());
    this.overlay = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.labels = new TowerLabels(this);
    this.hud = new Hud(this, {
      onStartWave: () => this.startWave(),
      onToggleSpeed: () => this.setSpeed(this.speed === 1 ? 2 : 1),
      onPick: (type) => this.togglePick(type),
    });
    this.panel = new TowerPanel(this, {
      onUpgrade: () => {
        if (this.panel.cell !== null) this.upgrade(this.panel.cell);
      },
      onSell: () => {
        const cell = this.panel.cell;
        if (cell === null) return;
        this.panel.close();
        this.sell(cell);
      },
    });
    this.endScreen = new EndScreen(this, () => this.playAgain());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove({ x: p.x, y: p.y }));
    this.input.on('gameout', () => this.onPointerMove(null));
    this.input.keyboard?.on('keydown-ESC', () => this.closeUi());
    this.redraw();
  }

  private onPointerDown(x: number, y: number): void {
    this.pointer = { x, y };
    if (this.endScreen.kind) return; // the veil swallows map clicks
    const target = classifyClick(x, y, this.panel.rect, this.state);
    switch (target.kind) {
      case 'ui':
        return; // the panel buttons handle it
      case 'tower':
        this.pick = null;
        this.panel.open(target.cell, this.state);
        break;
      case 'buildable':
        if (this.pick) this.build(target.cell, this.pick);
        else this.panel.close();
        break;
      case 'blocked':
        if (!this.pick) this.panel.close();
        break;
      case 'outside':
        // The HUD: its buttons act on their own; the pick stays (the bar
        // toggles it), and a selection closes as on any other click away.
        this.panel.close();
        break;
    }
    this.redraw();
  }

  /** Track the pointer (null once it leaves the canvas); the hover cell follows on redraw. */
  private onPointerMove(p: { x: number; y: number } | null): void {
    this.pointer = p;
    this.redraw();
  }

  /** A build bar click: pick that type, or clear the pick if it is already active. */
  private togglePick(type: TowerType): void {
    if (this.endScreen.kind) return;
    if (this.pick === type) this.pick = null;
    else if (canPick(this.state, type)) {
      this.pick = type;
      this.panel.close();
    }
    this.redraw();
  }

  /** Escape: clear the pick and the selection. */
  closeUi(): void {
    this.pick = null;
    this.panel.close();
    this.redraw();
  }

  uiState(): UiState {
    return {
      pick: this.pick,
      hoverCell: this.hoverCell,
      selectedCell: this.panel.cell,
      panelOpen: this.panel.cell !== null,
    };
  }

  /** Every clickable rectangle by name: HUD and bar buttons, the open panel's buttons, and `playAgain`. */
  uiRects(): Record<string, Rect> {
    return { ...this.hud.rects(), ...this.panel.rects(), ...this.endScreen.rects() };
  }

  /** The end screen showing, or null. */
  endScreenKind(): EndKind | null {
    return this.endScreen?.kind ?? null;
  }

  /** Start a brand-new game in a fresh scene. */
  playAgain(): void {
    this.scene.restart();
  }

  update(_time: number, delta: number): void {
    if (this.autoTick) {
      this.accMs += delta;
      const due = Math.floor(this.accMs / STEP_MS);
      this.accMs -= due * STEP_MS;
      // Dropping ticks beyond the cap (after a stall or a hidden tab) keeps
      // the game from spiralling; it simply runs slower for that frame.
      this.advance(Math.min(due * this.speed, MAX_TICKS_PER_FRAME), false);
    }
    this.redraw();
  }

  /** Run `n` simulation ticks, feeding each tick's shots to the effects. */
  advance(n: number, redraw = true): void {
    for (let i = 0; i < n; i++) {
      tick(this.state);
      for (const shot of this.state.shots) this.aim.pointAt(shot.cell, shot.to);
      this.shots.afterTick(this.state.shots);
    }
    if (redraw) this.redraw();
  }

  startWave(): StartWaveResult {
    const result = startWave(this.state);
    this.redraw();
    return result;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.redraw();
  }

  build(cell: Cell, type: TowerType): BuildResult {
    const result = buildTower(this.state, cell, type);
    this.redraw();
    return result;
  }

  upgrade(cell: Cell): UpgradeResult {
    const result = upgradeTower(this.state, cell);
    this.redraw();
    return result;
  }

  sell(cell: Cell): SellResult {
    const result = sellTower(this.state, cell);
    this.redraw();
    return result;
  }

  hudStrings() {
    return this.hud.strings();
  }

  redraw(): void {
    if (!this.dynamic) return;
    this.aim.prune(this.state);
    const g = this.dynamic;
    g.clear();
    drawTowers(g, this.state, this.aim);
    drawEnemies(g, this.state);
    this.shots.draw(g);
    this.labels.update(this.state);
    this.syncEndScreen();
    this.redrawUi();
    this.hud.update(this.state, this.speed, this.pick);
  }

  /** Show the end screen once the game is won or lost. Idempotent. */
  private syncEndScreen(): void {
    const kind = endKind(this.state);
    if (kind === null || this.endScreen.kind !== null) return;
    this.panel.close();
    this.pick = null;
    this.endScreen.show(kind, this.state);
  }

  private redrawUi(): void {
    // Keep the UI consistent if the state changed under it (a sale, a test
    // hook, or gold spent below the pick's cost).
    if (this.panel.cell !== null && !towerAt(this.state, this.panel.cell)) this.panel.close();
    if (this.pick !== null && !canPick(this.state, this.pick)) this.pick = null;
    this.panel.update(this.state);

    const panelRect = this.panel.rect;
    const p = this.pointer;
    this.hoverCell =
      p === null || this.endScreen.kind !== null || (panelRect !== null && contains(panelRect, p.x, p.y)) ? null : cellAt(p.x, p.y);
    const hover = this.hoverCell;
    const hoverTower = hover !== null && towerAt(this.state, hover) !== undefined;
    const hoverBuildable = hover !== null && isBuildable(this.state, hover);
    this.setCursor(hoverTower || (this.pick !== null && hoverBuildable) ? 'pointer' : 'default');

    const g = this.overlay;
    g.clear();

    const selected = this.panel.cell === null ? undefined : towerAt(this.state, this.panel.cell);
    if (selected) {
      this.rangeCircle(selected.cell, towerStats(selected).range);
      const s = cellCenter(selected.cell);
      g.lineStyle(3, COLORS.selectRing, 1);
      g.strokeCircle(s.x, s.y, 22);
    }

    if (this.pick !== null && hover !== null) {
      // Inset by half the outline so the 2 px edge stays inside the cell.
      const r = cellRect(hover);
      const color = hoverBuildable ? COLORS.cellOk : COLORS.cellBad;
      g.fillStyle(color, CELL_FILL_ALPHA);
      g.fillRect(r.x, r.y, CELL, CELL);
      g.lineStyle(CELL_LINE, color, 1);
      g.strokeRect(r.x + CELL_LINE / 2, r.y + CELL_LINE / 2, CELL - CELL_LINE, CELL - CELL_LINE);
      // A blocked cell shows only the red tint: no ghost, no range.
      if (hoverBuildable) {
        this.rangeCircle(hover, TOWER_DEFS[this.pick].base.range);
        drawTowerShape(g, this.pick, cellCenter(hover), this.aim.angle(hover), false, GHOST_ALPHA);
      }
    }
  }

  private setCursor(cursor: string): void {
    if (cursor === this.cursor) return;
    this.cursor = cursor;
    this.input.setDefaultCursor(cursor);
  }

  /** A tower's reach: faint fill, strong pale-yellow edge that reads on grass and path. */
  private rangeCircle(cell: Cell, range: number): void {
    const s = cellCenter(cell);
    this.overlay.fillStyle(COLORS.range, 0.12);
    this.overlay.fillCircle(s.x, s.y, range);
    this.overlay.lineStyle(2, COLORS.range, 0.9);
    this.overlay.strokeCircle(s.x, s.y, range);
  }
}

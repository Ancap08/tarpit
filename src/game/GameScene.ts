// The playing field: renders the simulation and runs it on a fixed step.
//
// Time: update() accumulates real time and runs one simulation tick per
// 1/60 s, times the speed (1x or 2x), at most MAX_TICKS_PER_FRAME per frame.
// In test mode (?test=1) update() runs no ticks; tests drive time with
// advance() through window.__tarpit.step().
//
// Build UI: clicking an empty spot opens the build menu beside it; clicking a
// tower selects it and opens the tower panel. Milestone 8: the spots are the
// ten legacy cells (legacySpots.ts); the menu, panel and actions work on
// cells, and a spot id is only the index used for hit-testing and names. Clicking anywhere else or
// pressing Escape closes either. Both work in setup and mid-wave. The scene
// changes the simulation only through its exported actions.
//
// End of game: every redraw checks the sim's phase; once it is 'won' or
// 'lost' the end screen shows (once), popups close and map input is ignored.
// [Play again] restarts this scene: Phaser shuts it down (destroying every
// game object and the input and keyboard listeners) and runs create() again,
// which makes a fresh createGame() and resets speed to 1x.

import Phaser from 'phaser';
import {
  buildTower,
  cellCenter,
  cellKey,
  createGame,
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
import { Aim, drawTowers } from './draw/towers';
import { Hud } from './hud';
import { classifyClick, contains, spotAt, spotRect, SPOT_HIT_RADIUS, type Rect } from './input';
import { COLORS } from './palette';
import { LEGACY_SPOT_CELLS, spotCenter, spotIdOf } from './legacySpots';
import { isTestMode } from './testMode';
import { BuildMenu } from './ui/buildMenu';
import { EndScreen } from './ui/endScreen';
import { endKind, type EndKind } from './ui/endText';
import { TowerPanel } from './ui/towerPanel';

const STEP_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 8;

export type Speed = 1 | 2;

/** Build UI state. Spot ids are legacy spot indexes (null if the cell is not one of the ten). */
export interface UiState {
  activeSpot: number | null;
  selectedSpot: number | null;
  menuOpen: boolean;
  panelOpen: boolean;
}

export class GameScene extends Phaser.Scene {
  state: GameState = createGame();
  speed: Speed = 1;
  private accMs = 0;
  private dynamic!: Phaser.GameObjects.Graphics;
  private labels!: TowerLabels;
  private overlay!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private menu!: BuildMenu;
  private panel!: TowerPanel;
  private endScreen!: EndScreen;
  /** Spot under the pointer (for the hover highlight), or null. */
  private hoverSpot: number | null = null;
  /** Tower type whose build-menu button is hovered (for the range preview), or null. */
  private preview: TowerType | null = null;
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

    this.hoverSpot = null;
    this.preview = null;

    // Draw order: map, overlay (spot highlights, range circles), towers and
    // enemies, tower labels, HUD, then the menu and panel on top.
    drawMap(this.add.graphics());
    this.overlay = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.labels = new TowerLabels(this);
    this.hud = new Hud(this, {
      onStartWave: () => this.startWave(),
      onToggleSpeed: () => this.setSpeed(this.speed === 1 ? 2 : 1),
    });
    this.menu = new BuildMenu(this, {
      onBuild: (type) => this.buildFromMenu(type),
      onPreview: (type) => {
        this.preview = type;
        this.redraw();
      },
    });
    this.panel = new TowerPanel(this, {
      onUpgrade: () => {
        if (this.panel.cell !== null) this.upgrade(this.panel.cell);
      },
      onSell: () => {
        const cell = this.panel.cell;
        if (cell === null) return;
        this.closeUi();
        this.sell(cell);
      },
    });
    this.endScreen = new EndScreen(this, () => this.playAgain());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p.x, p.y));
    this.input.keyboard?.on('keydown-ESC', () => this.closeUi());
    this.redraw();
  }

  /** The open menu's or panel's box, if any. */
  private openUiRect(): Rect | null {
    return this.menu.rect ?? this.panel.rect;
  }

  private onPointerDown(x: number, y: number): void {
    if (this.endScreen.kind) return; // the veil swallows map clicks
    const target = classifyClick(x, y, this.openUiRect());
    if (target.kind === 'ui') return; // the menu or panel buttons handle it
    if (target.kind === 'spot') this.openSpot(target.spotId);
    else this.closeUi();
  }

  private onPointerMove(x: number, y: number): void {
    if (this.endScreen.kind) return;
    const ui = this.openUiRect();
    const spot = ui && contains(ui, x, y) ? null : spotAt(x, y);
    if (spot === this.hoverSpot) return;
    this.hoverSpot = spot;
    this.input.setDefaultCursor(spot === null ? 'default' : 'pointer');
    this.redraw();
  }

  /** Open the build menu at an empty spot, or select the tower on it. */
  openSpot(spotId: number): void {
    if (this.endScreen.kind) return;
    this.closeUi();
    const cell = LEGACY_SPOT_CELLS[spotId];
    if (towerAt(this.state, cell)) this.panel.open(cell, this.state);
    else this.menu.open(cell, this.state);
    this.redraw();
  }

  closeUi(): void {
    this.menu.close();
    this.panel.close();
    this.preview = null;
    this.redraw();
  }

  private buildFromMenu(type: TowerType): void {
    const cell = this.menu.cell;
    if (cell === null) return;
    if (this.build(cell, type).ok) this.closeUi();
  }

  uiState(): UiState {
    const menu = this.menu.cell;
    const panel = this.panel.cell;
    return {
      activeSpot: menu === null ? null : spotIdOf(menu),
      selectedSpot: panel === null ? null : spotIdOf(panel),
      menuOpen: menu !== null,
      panelOpen: panel !== null,
    };
  }

  /** Every clickable rectangle by name: HUD buttons, `spot:<id>`, open menu or panel buttons, and `playAgain`. */
  uiRects(): Record<string, Rect> {
    const rects: Record<string, Rect> = { ...this.hud.rects() };
    LEGACY_SPOT_CELLS.forEach((_, id) => (rects[`spot:${id}`] = spotRect(id)));
    return { ...rects, ...this.menu.rects(), ...this.panel.rects(), ...this.endScreen.rects() };
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
    this.hud.update(this.state, this.speed);
    this.syncEndScreen();
    this.redrawUi();
  }

  /** Show the end screen once the game is won or lost. Idempotent. */
  private syncEndScreen(): void {
    const kind = endKind(this.state);
    if (kind === null || this.endScreen.kind !== null) return;
    this.menu.close();
    this.panel.close();
    this.preview = null;
    this.hoverSpot = null;
    this.input.setDefaultCursor('default');
    this.endScreen.show(kind, this.state);
  }

  private redrawUi(): void {
    // Keep the UI consistent if the state changed under it (for example a
    // test hook built on the active cell).
    if (this.menu.cell !== null && towerAt(this.state, this.menu.cell)) this.menu.close();
    if (this.panel.cell !== null && !towerAt(this.state, this.panel.cell)) this.panel.close();
    if (this.menu.cell === null) this.preview = null;
    this.menu.update(this.state);
    this.panel.update(this.state);

    const g = this.overlay;
    g.clear();
    const active = this.menu.cell ?? this.panel.cell;

    if (this.hoverSpot !== null && (active === null || cellKey(active) !== cellKey(LEGACY_SPOT_CELLS[this.hoverSpot]))) {
      const s = spotCenter(this.hoverSpot);
      g.lineStyle(2, COLORS.spotHover, 0.9);
      g.strokeCircle(s.x, s.y, SPOT_HIT_RADIUS);
    }

    const selected = this.panel.cell === null ? undefined : towerAt(this.state, this.panel.cell);
    if (selected) this.rangeCircle(selected.cell, towerStats(selected).range);
    if (this.menu.cell !== null && this.preview) {
      this.rangeCircle(this.menu.cell, TOWER_DEFS[this.preview].base.range);
    }

    if (active !== null) {
      const s = cellCenter(active);
      g.lineStyle(3, COLORS.spotActive, 1);
      g.strokeCircle(s.x, s.y, selected ? SPOT_HIT_RADIUS + 4 : SPOT_HIT_RADIUS);
    }
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

// The playing field: renders the simulation and runs it on a fixed step.
//
// Time: update() accumulates real time and runs one simulation tick per
// 1/60 s, times the speed (1x or 2x), at most MAX_TICKS_PER_FRAME per frame
// (the accumulator and the cap live in loop.ts, ticksDue()).
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
// Touch (milestone 14): a pointerdown from a touch sets touch mode, a mouse
// pointerdown or move clears it. On touch there is no hover, so with a pick
// active the first tap on a buildable cell arms it (ghost and range show
// there), a second tap on the armed cell builds and disarms it (the pick
// stays), a tap on another buildable cell moves the ghost there, and a tap
// on a blocked cell shows the red cell and arms nothing. Changing or clearing
// the pick disarms. Taps on towers, empty map without a pick, and the HUD
// behave as clicks do. The tower panel has a close button for touch.
//
// Drag (milestone 25a): a press on an affordable build bar button, or in
// setup on an unlocked tower, becomes a drag once the pointer moves more than
// 8 px (input.ts DRAG_THRESHOLD). A bar drag picks that type (the pick stays
// after the release, as after a bar click) and a ghost follows the pointer,
// snapped to the cell it aims at, green or red as for placement; release on
// a buildable cell builds there, anywhere else cancels. A tower drag dims the
// tower at its origin and releases into moveTower. On touch the drag aims 48
// px above the finger (DRAG_LIFT) and a thin line joins finger and ghost. A
// press without a drag is a click or tap as before: a bar click toggles the
// pick, a tower press selects it. Drags from the bar work mid-wave too
// (building then makes a locked tower); tower drags only in setup.
//
// Portrait: while the "turn your device" card shows (portrait.ts), update()
// runs no ticks and drops the time it would have accumulated.
//
// Animation (milestone 16): enemies are sprites (anim/enemySprites.ts). The
// scene hands the simulation's events (state.events) to them through an
// EventCursor after every tick (advance) and after every action (startWave,
// build, upgrade, sell), so each event is seen once. Tower recoil and
// tracers still read state.shots. In test mode the sprites are frozen: no
// walk cycle, tweens or particles.
//
// End of game: every redraw checks the sim's phase; once it is 'won' or
// 'lost' the end screen shows (once), the pick and panel clear, the bar greys
// and map input is ignored.
// [Play again] restarts this scene: Phaser shuts it down (destroying every
// game object and the input and keyboard listeners) and runs create() again,
// which makes a fresh createGame() and resets speed to 1x.
// Difficulty (milestone 25): the scene is always started with a
// GameStartData ({ difficulty }) from the title menu, the test hook or
// [Play again] (which passes the level just played). Phaser keeps a scene's
// last start data, so every start passes it explicitly. [Menu] goes back to
// the title menu.

import Phaser from 'phaser';
import {
  buildTower,
  CELL,
  cellCenter,
  createGame,
  DEFAULT_DIFFICULTY,
  isBuildable,
  moveTower,
  sellTower,
  setTargeting,
  startWave,
  tick,
  TOWER_DEFS,
  towerAt,
  towerStats,
  undoUpgrade,
  upgradeTower,
} from '../sim';
import type {
  BuildResult,
  Cell,
  Difficulty,
  GameEvent,
  GameState,
  MoveResult,
  SellResult,
  StartWaveResult,
  TargetingMode,
  TargetingResult,
  TowerLevelStats,
  TowerType,
  UndoUpgradeResult,
  UpgradeResult,
} from '../sim';
import { EventCursor } from './anim/effects';
import { EnemySprites, type AnimState } from './anim/enemySprites';
import { drawHpBars, drawShadows, drawStatusRings } from './draw/enemies';
import { TowerLabels } from './draw/labels';
import { drawMap } from './draw/map';
import { ShotEffects } from './draw/shots';
import { Aim, drawTowerShape, drawTowers } from './draw/towers';
import { Hud } from './hud';
import { cellAt, cellRect, classifyClick, contains, dragTargetCell, pastDragThreshold, type Rect } from './input';
import { COLORS } from './palette';
import { portraitCardVisible } from './portrait';
import { isTestMode } from './testMode';
import type { GameStartData } from './TitleScene';
import { ticksDue } from './loop';
import { BAR_TYPES, canPick } from './ui/buildBar';
import { EndScreen } from './ui/endScreen';
import { endKind, type EndKind } from './ui/endText';
import { TowerPanel } from './ui/towerPanel';

const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;


export type Speed = 1 | 2;

/** Build UI state, as the test hook ui() reports it. */
export interface UiState {
  /** The build bar's active pick, or null. */
  pick: TowerType | null;
  /**
   * The cell the placement highlight is on, or null: under the mouse (not
   * under the panel), or on touch the last tapped map cell while a pick is
   * active.
   */
  hoverCell: Cell | null;
  /** On touch, the buildable cell a second tap builds on, or null. */
  armedCell: Cell | null;
  /** True when the last pointer input was a touch. */
  isTouch: boolean;
  /** The selected tower's cell (its panel is open), or null. */
  selectedCell: Cell | null;
  panelOpen: boolean;
  /** The selected tower's targeting mode (milestone 24), or null with no tower selected. */
  selectedTargeting: TargetingMode | null;
  /** The panel's targeting button label ("Target: First"), or null while closed. */
  targetLabel: string | null;
  /** The panel's Upgrade and Sell slot labels ("Undo upgrade  +35", "Remove  +50"), or null while closed. */
  upgradeLabel: string | null;
  sellLabel: string | null;
  /**
   * A drag in progress (milestone 25a), or null: placing a tower from the
   * bar or moving the tower from `from`; `cell` is the cell it aims at
   * (48 px above a finger), or null over the HUD or off the map.
   */
  dragging: null | { kind: 'place' | 'move'; tower: TowerType; from?: Cell; cell: Cell | null };
}

/** A press that may become a drag (milestone 25a). */
interface Press {
  kind: 'place' | 'move';
  tower: TowerType;
  /** The tower's cell, for a move. */
  from: Cell | null;
  touch: boolean;
  /** Where the press went down, and where the pointer is now (canvas px). */
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** True once the pointer has moved past the drag threshold. */
  active: boolean;
  /** The cell the drag aims at, or null. */
  cell: Cell | null;
}

/** Placement ghost opacity. */
const GHOST_ALPHA = 0.6;
/** Placement cell highlight: fill opacity and outline width. */
const CELL_FILL_ALPHA = 0.25;
const CELL_LINE = 2;
/** The touch drag's finger-to-ghost line width (milestone 25a). */
const DRAG_LINE = 1.5;
/** Dashes in the Mortar's minimum-range circle (each dash half of its slot). */
const MIN_RANGE_DASHES = 24;

export class GameScene extends Phaser.Scene {
  state: GameState = createGame();
  speed: Speed = 1;
  /** The level this game runs on (set in init from the start data). */
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  private accMs = 0;
  private dynamic!: Phaser.GameObjects.Graphics;
  private enemySprites!: EnemySprites;
  /** Shot effects, over the enemy sprites. */
  private shotFx!: Phaser.GameObjects.Graphics;
  /** Hp bars, over the sprites and shot effects. */
  private bars!: Phaser.GameObjects.Graphics;
  private eventCursor = new EventCursor();
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
  /** True when the last pointerdown was a touch (cleared by any mouse input). */
  private touch = false;
  /** On touch with a pick: the last tapped map cell (green or red highlight), or null. */
  private tapCell: Cell | null = null;
  /** On touch with a pick: the buildable cell the next tap on builds, or null. */
  private armed: Cell | null = null;
  private cursor = 'default';
  /** A press on a bar button or an unlocked tower that may become a drag (milestone 25a), or null. */
  private press: Press | null = null;
  private shots = new ShotEffects();
  private aim = new Aim();
  private readonly autoTick = !isTestMode();

  constructor() {
    super('game');
  }

  init(data?: Partial<GameStartData>): void {
    this.difficulty = data?.difficulty ?? DEFAULT_DIFFICULTY;
  }

  create(): void {
    this.state = createGame({ difficulty: this.difficulty });
    this.speed = 1;
    this.accMs = 0;
    this.shots = new ShotEffects();
    this.aim = new Aim();
    this.eventCursor = new EventCursor();

    this.pick = null;
    this.pointer = null;
    this.hoverCell = null;
    this.touch = false;
    this.tapCell = null;
    this.armed = null;
    this.press = null;
    this.cursor = 'default';

    // Draw order: map, overlay (cell highlight, range circles, ghost), towers,
    // status rings and flyer shadows, walking enemy sprites (sorted by y) and
    // their particles, shot effects, hp bars, tower labels, flying enemy
    // sprites (milestone 22), HUD (which covers any range circle
    // reaching below the map), then the panel and the end screen on top.
    drawMap(this.add.graphics());
    this.overlay = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.enemySprites = new EnemySprites(this, isTestMode());
    this.shotFx = this.add.graphics();
    this.bars = this.add.graphics();
    this.labels = new TowerLabels(this);
    // Flyers (Harpies) draw above every walker and label, below the HUD.
    this.enemySprites.setAirLayer(this.add.layer());
    this.hud = new Hud(this, {
      onStartWave: () => this.startWave(),
      onToggleSpeed: () => this.setSpeed(this.speed === 1 ? 2 : 1),
      onPick: (type) => this.togglePick(type),
    });
    this.panel = new TowerPanel(this, {
      onUpgrade: () => {
        if (this.panel.cell !== null) this.upgrade(this.panel.cell);
      },
      onUndoUpgrade: () => {
        if (this.panel.cell !== null) this.undoUpgrade(this.panel.cell);
      },
      onClose: () => {
        this.panel.close();
        this.redraw();
      },
      onSell: () => {
        const cell = this.panel.cell;
        if (cell === null) return;
        this.panel.close();
        this.sell(cell);
      },
      onTarget: (next) => {
        if (this.panel.cell !== null) this.setTargeting(this.panel.cell, next);
      },
    });
    this.endScreen = new EndScreen(
      this,
      () => this.playAgain(),
      () => this.toMenu(),
    );

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.press = null;
      if (p.wasTouch) this.onTap(p.x, p.y);
      else this.onPointerDown(p.x, p.y);
      this.beginPress(p.x, p.y, p.wasTouch);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.press !== null && this.press.touch === p.wasTouch) {
        this.dragMove(p.x, p.y);
        if (p.wasTouch) return;
      }
      // A finger has no hover: touch moves change nothing else.
      if (!p.wasTouch) this.onPointerMove({ x: p.x, y: p.y });
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.endPress(p.x, p.y, true));
    this.input.on('pointerupoutside', () => this.endPress(0, 0, false));
    this.input.on('gameout', () => {
      if (this.press?.active) this.press.cell = null;
      this.onPointerMove(null);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.closeUi());
    this.redraw();
  }

  private onPointerDown(x: number, y: number): void {
    this.setTouch(false);
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

  /**
   * A touch tap: as a click, except that with a pick a buildable cell is
   * armed by the first tap and built on by a second tap on the same cell.
   */
  private onTap(x: number, y: number): void {
    this.setTouch(true);
    if (this.endScreen.kind) return;
    const target = classifyClick(x, y, this.panel.rect, this.state);
    switch (target.kind) {
      case 'ui':
        return;
      case 'tower':
        this.pick = null;
        this.panel.open(target.cell, this.state);
        break;
      case 'buildable':
        if (!this.pick) {
          this.panel.close();
        } else if (this.armed !== null && sameCell(this.armed, target.cell)) {
          this.build(target.cell, this.pick);
          this.armed = null;
          this.tapCell = null;
        } else {
          this.armed = target.cell;
          this.tapCell = target.cell;
        }
        break;
      case 'blocked':
        if (!this.pick) this.panel.close();
        else {
          this.armed = null;
          this.tapCell = target.cell;
        }
        break;
      case 'outside':
        this.panel.close();
        break;
    }
    this.redraw();
  }

  /** Switch between touch and mouse mode; each mode starts with no hover or armed cell. */
  private setTouch(touch: boolean): void {
    if (this.touch === touch) return;
    this.touch = touch;
    this.pointer = null;
    this.tapCell = null;
    this.armed = null;
  }

  /** Track the pointer (null once it leaves the canvas); the hover cell follows on redraw. */
  private onPointerMove(p: { x: number; y: number } | null): void {
    if (p !== null) this.setTouch(false);
    this.pointer = p;
    this.redraw();
  }

  /** A build bar click: pick that type, or clear the pick if it is already active. */
  private togglePick(type: TowerType): void {
    if (this.endScreen.kind) return;
    // The release of a drag that ended back on its bar button is not a click.
    if (this.press?.active) return;
    this.tapCell = null;
    this.armed = null;
    if (this.pick === type) this.pick = null;
    else if (canPick(this.state, type)) {
      this.pick = type;
      this.panel.close();
    }
    this.redraw();
  }

  /**
   * After a pointerdown: remember a press on an affordable bar button, or in
   * setup on an unlocked tower, so that moving past the threshold drags it.
   */
  private beginPress(x: number, y: number, touch: boolean): void {
    if (this.endScreen.kind) return;
    const rects = this.hud.rects();
    const barType = BAR_TYPES.find((type) => contains(rects[`bar:${type}`], x, y));
    const base = { touch, x0: x, y0: y, x, y, active: false, cell: null };
    if (barType !== undefined) {
      if (canPick(this.state, barType)) this.press = { ...base, kind: 'place', tower: barType, from: null };
      return;
    }
    if (this.panel.rect !== null && contains(this.panel.rect, x, y)) return;
    const cell = cellAt(x, y);
    const tower = cell === null ? undefined : towerAt(this.state, cell);
    if (tower && !tower.locked && this.state.phase === 'setup') {
      this.press = { ...base, kind: 'move', tower: tower.type, from: { ...tower.cell } };
    }
  }

  /** Pointer moved during a press: start the drag past the threshold, then follow. */
  private dragMove(x: number, y: number): void {
    const d = this.press;
    if (d === null) return;
    d.x = x;
    d.y = y;
    if (!d.active) {
      if (!pastDragThreshold(d.x0, d.y0, x, y)) return;
      d.active = true;
      this.panel.close();
      this.tapCell = null;
      this.armed = null;
      // A bar drag picks the type, so the pick stays after the release.
      this.pick = d.kind === 'place' ? d.tower : null;
    }
    d.cell = dragTargetCell(x, y, d.touch);
    this.redraw();
  }

  /**
   * Pointer released. An active drag builds or moves on the cell it aims at
   * (the sim refuses a cell that is not buildable) and otherwise cancels;
   * `inside` is false for a release outside the canvas, which cancels.
   */
  private endPress(x: number, y: number, inside: boolean): void {
    const d = this.press;
    this.press = null;
    if (d === null || !d.active) return;
    const cell = inside ? dragTargetCell(x, y, d.touch) : null;
    if (cell !== null && this.endScreen.kind === null) {
      if (d.kind === 'place' && isBuildable(this.state, cell)) this.build(cell, d.tower);
      else if (d.kind === 'move' && d.from !== null) this.move(d.from, cell);
    }
    this.redraw();
  }

  /** Escape: clear the pick and the selection. */
  closeUi(): void {
    this.press = null;
    this.pick = null;
    this.panel.close();
    this.redraw();
  }

  uiState(): UiState {
    return {
      pick: this.pick,
      hoverCell: this.hoverCell,
      armedCell: this.armed,
      isTouch: this.touch,
      selectedCell: this.panel.cell,
      panelOpen: this.panel.cell !== null,
      selectedTargeting: this.panel.cell === null ? null : (towerAt(this.state, this.panel.cell)?.targeting ?? null),
      targetLabel: this.panel.targetText,
      upgradeLabel: this.panel.upgradeText,
      sellLabel: this.panel.sellText,
      dragging:
        this.press === null || !this.press.active
          ? null
          : {
              kind: this.press.kind,
              tower: this.press.tower,
              ...(this.press.from !== null ? { from: { ...this.press.from } } : {}),
              cell: this.press.cell === null ? null : { ...this.press.cell },
            },
    };
  }

  /** Every clickable rectangle by name: HUD and bar buttons, the open panel's buttons, and `playAgain` and `menu`. */
  uiRects(): Record<string, Rect> {
    return { ...this.hud.rects(), ...this.panel.rects(), ...this.endScreen.rects() };
  }

  /** The end screen showing, or null. */
  endScreenKind(): EndKind | null {
    return this.endScreen?.kind ?? null;
  }

  /** Start a brand-new game in a fresh scene, on the same level. */
  playAgain(): void {
    const data: GameStartData = { difficulty: this.state.difficulty };
    this.scene.restart(data);
  }

  /** Back to the title menu (milestone 25), which still shows the level just played. */
  toMenu(): void {
    this.scene.start('title');
  }

  update(_time: number, delta: number): void {
    if (this.autoTick && portraitCardVisible()) {
      this.accMs = 0;
    } else if (this.autoTick) {
      // Ticks beyond the cap are dropped (see loop.ts for why).
      const { ticks, accMs } = ticksDue(this.accMs + delta, this.speed);
      this.accMs = accMs;
      this.advance(ticks, false);
    }
    this.redraw();
  }

  /** Run `n` simulation ticks, feeding each tick's shots and events to the effects. */
  advance(n: number, redraw = true): void {
    for (let i = 0; i < n; i++) {
      tick(this.state);
      for (const shot of this.state.shots) this.aim.pointAt(shot.cell, shot.to);
      this.shots.afterTick(this.state.shots);
      this.takeEvents();
    }
    if (redraw) this.redraw();
  }

  /** Hand the events not yet seen to the sprites (after every tick and action). */
  private takeEvents(): void {
    if (!this.enemySprites) return;
    const { events, newTick } = this.eventCursor.take(this.state);
    if (newTick) this.enemySprites.newTick();
    this.enemySprites.onEvents(events);
  }

  /** Test hook: the current simulation events. */
  simEvents(): GameEvent[] {
    return this.state.events;
  }

  /** Test hook: an enemy sprite's animation state, or null if it has none. */
  animState(enemyId: number): AnimState | null {
    return this.enemySprites?.animState(enemyId) ?? null;
  }

  startWave(): StartWaveResult {
    const result = startWave(this.state);
    this.takeEvents();
    this.redraw();
    return result;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.redraw();
  }

  build(cell: Cell, type: TowerType): BuildResult {
    const result = buildTower(this.state, cell, type);
    this.takeEvents();
    this.redraw();
    return result;
  }

  upgrade(cell: Cell): UpgradeResult {
    const result = upgradeTower(this.state, cell);
    this.takeEvents();
    this.redraw();
    return result;
  }

  sell(cell: Cell): SellResult {
    const result = sellTower(this.state, cell);
    this.takeEvents();
    this.redraw();
    return result;
  }

  /** Move an unlocked tower in setup (milestone 25a). */
  move(from: Cell, to: Cell): MoveResult {
    const result = moveTower(this.state, from, to);
    this.takeEvents();
    this.redraw();
    return result;
  }

  /** Undo an upgrade bought this setup phase (milestone 25a). */
  undoUpgrade(cell: Cell): UndoUpgradeResult {
    const result = undoUpgrade(this.state, cell);
    this.takeEvents();
    this.redraw();
    return result;
  }

  setTargeting(cell: Cell, mode: TargetingMode): TargetingResult {
    const result = setTargeting(this.state, cell, mode);
    this.takeEvents();
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
    const moving = this.press?.active && this.press.kind === 'move' ? this.press.from : null;
    drawTowers(g, this.state, this.aim, moving);
    drawStatusRings(g, this.state);
    drawShadows(g, this.state);
    this.enemySprites.sync(this.state, this.speed);
    this.shotFx.clear();
    this.shots.draw(this.shotFx);
    this.bars.clear();
    drawHpBars(this.bars, this.state);
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
    this.press = null;
    this.endScreen.show(kind, this.state);
  }

  private redrawUi(): void {
    // Keep the UI consistent if the state changed under it (a sale, a test
    // hook, or gold spent below the pick's cost).
    if (this.panel.cell !== null && !towerAt(this.state, this.panel.cell)) this.panel.close();
    if (this.pick !== null && !canPick(this.state, this.pick)) this.pick = null;
    this.panel.update(this.state);
    // A drag whose source went away (gold spent elsewhere, the tower sold or
    // locked by a test hook) ends without acting.
    const d = this.press;
    if (d !== null) {
      const source = d.from === null ? undefined : towerAt(this.state, d.from);
      if (d.kind === 'place' ? !canPick(this.state, d.tower) : !source || source.locked || this.state.phase !== 'setup') this.press = null;
    }
    const drag = this.press?.active ? this.press : null;

    // Touch: nothing is armed or highlighted without a pick, and an armed
    // cell that stopped being buildable (a test hook built there) disarms.
    if (this.pick === null) {
      this.tapCell = null;
      this.armed = null;
    }
    if (this.armed !== null && !isBuildable(this.state, this.armed)) {
      this.armed = null;
      this.tapCell = null;
    }

    const panelRect = this.panel.rect;
    const p = this.pointer;
    if (this.endScreen.kind !== null) this.hoverCell = null;
    else if (drag !== null) this.hoverCell = drag.cell;
    else if (this.touch) this.hoverCell = this.tapCell;
    else this.hoverCell = p === null || (panelRect !== null && contains(panelRect, p.x, p.y)) ? null : cellAt(p.x, p.y);
    const hover = this.hoverCell;
    const hoverTower = hover !== null && towerAt(this.state, hover) !== undefined;
    // A moved tower may be dropped back on its own cell (a no-op).
    const backHome = drag?.kind === 'move' && drag.from !== null && hover !== null && sameCell(drag.from, hover);
    const hoverBuildable = hover !== null && (isBuildable(this.state, hover) || backHome);
    if (drag !== null) this.setCursor('grabbing');
    else this.setCursor(hoverTower || (this.pick !== null && hoverBuildable) ? 'pointer' : 'default');

    const g = this.overlay;
    g.clear();

    const selected = this.panel.cell === null ? undefined : towerAt(this.state, this.panel.cell);
    if (selected) {
      this.rangeCircles(selected.cell, towerStats(selected));
      const s = cellCenter(selected.cell);
      g.lineStyle(3, COLORS.selectRing, 1);
      g.strokeCircle(s.x, s.y, 22);
    }

    // What a ghost would show: the pick, or the tower being moved (its level).
    const moved = drag?.kind === 'move' && drag.from !== null ? towerAt(this.state, drag.from) : undefined;
    const ghostType = moved ? moved.type : this.pick;
    if (ghostType !== null && hover !== null) {
      // Inset by half the outline so the 2 px edge stays inside the cell.
      const r = cellRect(hover);
      const color = hoverBuildable ? COLORS.cellOk : COLORS.cellBad;
      g.fillStyle(color, CELL_FILL_ALPHA);
      g.fillRect(r.x, r.y, CELL, CELL);
      g.lineStyle(CELL_LINE, color, 1);
      g.strokeRect(r.x + CELL_LINE / 2, r.y + CELL_LINE / 2, CELL - CELL_LINE, CELL - CELL_LINE);
      // A blocked cell shows only the red tint: no ghost, no range.
      if (hoverBuildable) {
        const upgraded = moved?.upgraded ?? false;
        this.rangeCircles(hover, moved ? towerStats(moved) : TOWER_DEFS[ghostType].base);
        drawTowerShape(g, ghostType, cellCenter(hover), this.aim.angle(moved ? moved.cell : hover), upgraded, GHOST_ALPHA);
      }
    }
    // On touch, a thin line from the fingertip to the lifted ghost's cell.
    if (drag !== null && drag.touch && hover !== null) {
      const c = cellCenter(hover);
      g.lineStyle(DRAG_LINE, COLORS.dragLine, 0.85);
      g.lineBetween(drag.x, drag.y, c.x, c.y);
      g.fillStyle(COLORS.dragLine, 0.85);
      g.fillCircle(drag.x, drag.y, 3);
    }
  }

  private setCursor(cursor: string): void {
    if (cursor === this.cursor) return;
    this.cursor = cursor;
    this.input.setDefaultCursor(cursor);
  }

  /**
   * A tower's reach: faint fill, strong pale-yellow edge that reads on grass
   * and path. A tower with a minimum range (the Mortar) also gets a dashed
   * muted-red circle at that minimum.
   */
  private rangeCircles(cell: Cell, stats: TowerLevelStats): void {
    const s = cellCenter(cell);
    const g = this.overlay;
    g.fillStyle(COLORS.range, 0.12);
    g.fillCircle(s.x, s.y, stats.range);
    g.lineStyle(2, COLORS.range, 0.9);
    g.strokeCircle(s.x, s.y, stats.range);
    if (stats.minRange > 0) {
      g.lineStyle(2, COLORS.minRange, 1);
      for (let i = 0; i < MIN_RANGE_DASHES; i++) {
        const a = (i * 2 * Math.PI) / MIN_RANGE_DASHES;
        g.beginPath();
        g.arc(s.x, s.y, stats.minRange, a, a + Math.PI / MIN_RANGE_DASHES);
        g.strokePath();
      }
    }
  }
}

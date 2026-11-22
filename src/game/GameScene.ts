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
// Specials (milestone 25b, aim flow reworked in milestone 30): the HUD's
// Special button is live while a wave runs and the charge is ready.
// Pressing it selects the only unlocked special directly, or opens a popup
// listing the unlocked ones; picking one starts aiming. While aiming, a
// banner over the map says what to do (names.ts aimBannerText) and a circle
// of the special's radius follows the mouse over the map. A mouse click on
// the map fires there. On touch, a tap on the map fires at the tap; a press
// held AIM_HOLD_MS or moved past the drag threshold shows the circle 48 px
// above the finger (DRAG_LIFT, with the finger line) and its release fires
// there when that point is on the map (the finger may be over the HUD, so
// the bottom rows are reachable), or cancels when the lifted point is off
// the map or the finger is on the Special button. Escape, pressing
// Special again, or a press anywhere else on the HUD cancels aiming (and
// closes the popup); a cancel spends nothing. Aiming, the popup, the tower
// pick and the tower panel are mutually exclusive: opening one clears the
// others. A special that lands shows its effects (draw/specials.ts), and
// the keg shakes the camera (not in test mode).
//
// Speed (milestone 30): a tap on the speed button toggles 1x and 2x; a press
// held SPEED_HOLD_MS runs 3x while held and reads "3x", and its release
// returns to the speed before it without toggling.
//
// Gold cheat (milestone 30): CHEAT_TAPS presses on the Gold readout within
// CHEAT_WINDOW_MS call grantCheatGold. A cheated game records no best score
// (recordScore) for the rest of that game; Play again starts a clean one.
//
// Layouts (milestone 32b): the scene is built for the layout of the window
// at create() (layoutSwitch.ts currentLayout): landscape, or portrait with
// the map turned a quarter turn. When the window changes shape,
// relayout() restarts the scene on the same GameState (and its waves
// cleared record and tick accumulator), so no tick is lost or run twice;
// the pick, a drag, an aim, the popup, the panel and the speed (back to 1x)
// clear, and the effects in flight start fresh.
//
// Animation (milestone 16): enemies are sprites (anim/enemySprites.ts). The
// scene hands the simulation's events (state.events) to them through an
// EventCursor after every tick (advance) and after every action (startWave,
// build, upgrade, sell), so each event is seen once. Tower recoil and
// tracers still read state.shots. In test mode the sprites are frozen: no
// walk cycle, tweens or particles.
//
// Effects (milestone 31, fx/effects.ts): in play the scene feeds every tick's
// shots and every event batch to Effects instead of straight to the sprites;
// it draws projectiles, turns and kicks the towers, delays each hit's flash
// and each kill's puff to the projectile's arrival, and draws the banners,
// gold labels and the boss and exit moments. Test mode creates no Effects
// and draws exactly as before (tracers, snapping barrels, instant reactions).
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
// Maps (milestone 27): GameStartData also carries the map; the game is
// created on it, [Play again] passes it on, and [Menu] returns to a title
// that still has it selected. Everything map-dependent reads state.map.
// Endless (milestone 26): the win screen's [Keep going] runs continueEndless
// and hides the end screen; the game plays on until it is lost. After every
// run of ticks and every early call, a waves-cleared count above the one
// already recorded this game goes to the high score store (highScore.ts),
// which keeps it if it beats the stored best for this map and level.

import Phaser from 'phaser';
import {
  buildTower,
  callEarlyStatus,
  callNextWave,
  CELL,
  continueEndless,
  cellCenter,
  createGame,
  DEFAULT_DIFFICULTY,
  DEFAULT_MAP,
  enemyMaxHp,
  pathLength,
  isBuildable,
  moveTower,
  sellTower,
  setTargeting,
  grantCheatGold,
  SPECIAL_DEFS,
  startWave,
  tick,
  TOWER_DEFS,
  towerAt,
  towerStats,
  undoUpgrade,
  unlockedSpecials,
  upgradeTower,
  useSpecial,
  wavesCleared,
} from '../sim';
import type {
  BuildResult,
  CallNextWaveResult,
  ContinueEndlessResult,
  Cell,
  Difficulty,
  GameEvent,
  GameState,
  MapId,
  MoveResult,
  SellResult,
  SpecialResult,
  SpecialType,
  StartWaveResult,
  TargetingMode,
  TargetingResult,
  TowerLevelStats,
  TowerType,
  UndoUpgradeResult,
  UpgradeResult,
} from '../sim';
import { EventCursor } from './anim/effects';
import { Effects, type FxState } from './fx/effects';
import { EnemySprites, type AnimState } from './anim/enemySprites';
import { drawHpBars, drawShadows, drawStatusRings } from './draw/enemies';
import { TowerLabels } from './draw/labels';
import { drawMap } from './draw/map';
import { ShotEffects } from './draw/shots';
import { SpecialEffects } from './draw/specials';
import { Aim, drawTowerShape, drawTowers } from './draw/towers';
import { highScores } from './highScore';
import { callEarlyInfo, CHEAT_TAPS, CHEAT_WINDOW_MS, Hud, specialReady, specialRecharge } from './hud';
import { aimBannerText } from './names';
import {
  cellAt,
  cellRect,
  classifyClick,
  contains,
  dragTargetCell,
  liftPx,
  mouseDragLost,
  pastDragThreshold,
  type Rect,
} from './input';
import { LANDSCAPE, type Layout, type LayoutKind } from './layout';
import { COLORS, FONT, TEXT } from './palette';
import { currentLayout } from './layoutSwitch';
import { isPerfMode, isTestMode } from './testMode';
import type { GameStartData } from './TitleScene';
import { ticksDue } from './loop';
import { BAR_TYPES, canPick } from './ui/buildBar';
import { EndScreen } from './ui/endScreen';
import { endKind, type EndKind } from './ui/endText';
import { TowerPanel } from './ui/towerPanel';

const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;


export type Speed = 1 | 2 | 3;

/** A press on the speed button held this long runs 3x while held (milestone 30). */
export const SPEED_HOLD_MS = 300;
/** A touch press while aiming held this long, unmoved, becomes a hold: the lifted circle shows (milestone 30). */
export const AIM_HOLD_MS = 300;

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
  /** The map this game is played on (milestone 27). */
  map: MapId;
  /** Milestone 32b: the layout the scene is drawn in. */
  layout: LayoutKind;
  /** Milestone 32b follow-up: the touch lift in canvas px (48 in landscape; 48 CSS px on screen in portrait). */
  lift: number;
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
  /**
   * Specials (milestone 25b): the charges left this wave, the special being
   * aimed (or null), the specials unlocked on this wave, whether the popup
   * is open, and the aim circle's centre in canvas px (null while aiming
   * with nowhere to show it, or not aiming).
   */
  special: {
    charges: number;
    aiming: SpecialType | null;
    unlocked: SpecialType[];
    menuOpen: boolean;
    aimPoint: { x: number; y: number } | null;
    /** Milestone 30: the charge is ready now (a wave runs and it is not refilling). */
    ready: boolean;
    /** Milestone 30: wave ticks until the charge is ready again; 0 when ready or not refilling. */
    rechargeTicks: number;
    /** Milestone 30: the aim banner's two lines while aiming, else null. */
    banner: { main: string; hint: string } | null;
    /** Milestone 30: on touch, a press is held and the lifted circle shows. */
    holding: boolean;
    /** Milestone 30: the "3 hit" or "Missed" labels showing, with their canvas positions. */
    labels: { text: string; x: number; y: number }[];
    /** Milestone 30: the zones drawn now (the simulation's state.zones). */
    zones: { id: number; type: 'tarBarrel' | 'fireArrows'; x: number; y: number; ticksLeft: number }[];
  };
  /**
   * Call early (milestone 25c): whether Start Wave now calls the next wave
   * (callNextWave would succeed) and the early bonus it would pay (0 when
   * not available).
   */
  callEarly: { available: boolean; bonus: number };
  /** The panel's kill count line ("Kills 43"), or null while closed (milestone 25c). */
  killsLabel: string | null;
}

/** A touch press while aiming a special (milestone 25b): a tap or, past the threshold, a lifted drag. */
interface AimPress {
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** A hold (moved past the threshold, or held AIM_HOLD_MS): the lifted circle shows and the release fires there. */
  active: boolean;
  /** Scene time of the press (milestone 30). */
  t0: number;
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
/** A drag's ghost over a blocked cell (milestone 25a follow-up): faint, under a red wash of this opacity. */
const BLOCKED_GHOST_ALPHA = 0.35;
const BLOCKED_GHOST_TINT = 0.3;
/** Placement cell highlight: fill opacity and outline width. */
const CELL_FILL_ALPHA = 0.25;
const CELL_LINE = 2;
/** The touch drag's finger-to-ghost line width (milestone 25a). */
const DRAG_LINE = 1.5;
/** Aim circle (milestone 25b): outline width and fill opacity; milestone 30: half-length of the centre cross. */
const AIM_LINE = 3;
const AIM_FILL_ALPHA = 0.22;
const AIM_CROSS = 9;
/** The aim banner's box (milestone 30): top edge and height, centred across the map. */
const BANNER_Y = 8;
const BANNER_H = 46;
/** The aim circle's colour per special. */
export const SPECIAL_COLORS: Readonly<Record<SpecialType, number>> = {
  keg: COLORS.specialKeg,
  tarBarrel: COLORS.specialTar,
  fireArrows: COLORS.specialFire,
};

/**
 * A touch hold's aim point (milestone 30), in canvas px: `lift` px (DRAG_LIFT, or in portrait 48 CSS px)
 * above the finger (milestone 32b: always up the screen), or null when that
 * point is off `layout`'s map (edges included). As for tower drags
 * (milestone 25a) the lifted point decides, so a finger on the HUD aims at
 * the map's bottom rows.
 */
function liftedAim(x: number, y: number, layout: Layout, lift: number): { x: number; y: number } | null {
  return layout.onMap(x, y - lift) ? { x, y: y - lift } : null;
}

/** Dashes in the Mortar's minimum-range circle (each dash half of its slot). */
const MIN_RANGE_DASHES = 24;

export class GameScene extends Phaser.Scene {
  state: GameState = createGame();
  speed: Speed = 1;
  /** Milestone 32b: where the map and controls sit; every map conversion goes through it. */
  private layout: Layout = LANDSCAPE;
  /** The level this game runs on (set in init from the start data). */
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  /** The map this game runs on (milestone 27; set in init from the start data). */
  private currentMap: MapId = DEFAULT_MAP;
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
  private specialFx!: SpecialEffects;
  /** The aim circle's centre cross, above the sprites (milestone 30 follow-up). */
  private aimCross!: Phaser.GameObjects.Graphics;
  /** Ground layer over the map (milestone 30): zones and scorch marks. */
  private ground!: Phaser.GameObjects.Graphics;
  /** The aim banner (milestone 30): its backing and two lines. */
  private bannerBg!: Phaser.GameObjects.Graphics;
  private bannerMain!: Phaser.GameObjects.Text;
  private bannerHint!: Phaser.GameObjects.Text;
  /** A press on the speed button (milestone 30): when it started, the speed before it, and whether it became a 3x hold. */
  private speedPress: { t0: number; before: Speed; holding: boolean } | null = null;
  /** Scene times of the recent presses on the Gold readout (milestone 30, the cheat). */
  private goldTaps: number[] = [];
  /** A 3x hold ended without its release (milestone 30 review): the button's late click must not toggle. */
  private speedHoldLost = false;
  /** The special being aimed (milestone 25b), or null. */
  private aiming: SpecialType | null = null;
  /** The special popup is open. */
  private specialMenuOpen = false;
  /** On touch: the lifted aim circle's centre during a hold, or null. */
  private touchAim: { x: number; y: number } | null = null;
  /** On touch while aiming: the press in progress, or null. */
  private aimPress: AimPress | null = null;
  private aim!: Aim;
  /** Milestone 32b: the game a relayout() carries into the restarted scene, until create() takes it. */
  private resume: { state: GameState; recordedCleared: number; accMs: number } | null = null;
  /** A relayout's restart is queued and its create() has not run yet. */
  private restartPending = false;
  /** Waves cleared already sent to the high score store this game (milestone 26). */
  private recordedCleared = 0;
  private readonly autoTick = !isTestMode();
  /** Milestone 31: the play-mode effects; null in test mode. */
  private fx: Effects | null = null;

  constructor() {
    super('game');
  }

  init(data?: Partial<GameStartData>): void {
    this.difficulty = data?.difficulty ?? DEFAULT_DIFFICULTY;
    this.currentMap = data?.map ?? DEFAULT_MAP;
  }

  /**
   * Milestone 32b: rebuild the scene for the window's new layout and keep
   * the game. layoutSwitch.ts calls this after it resized the canvas.
   */
  relayout(): void {
    if (!this.dynamic) return;
    // Follow-up (verifier): requests coalesce. The game to carry is refreshed on every
    // request and kept until the one queued restart's create() takes it; that create()
    // reads the newest layout, so a burst of resizes ends on the window's final shape.
    this.resume = { state: this.state, recordedCleared: this.recordedCleared, accMs: this.accMs };
    if (this.restartPending) return;
    this.restartPending = true;
    const data: GameStartData = { difficulty: this.state.difficulty, map: this.currentMap };
    this.scene.restart(data);
  }

  create(): void {
    this.layout = currentLayout();
    // Only a relayout's restart resumes; Play again, the title and a first start begin a new game.
    const resume = this.restartPending ? this.resume : null;
    this.restartPending = false;
    this.resume = null;
    this.state = resume?.state ?? createGame({ difficulty: this.difficulty, map: this.currentMap });
    this.recordedCleared = resume?.recordedCleared ?? 0;
    this.speed = 1;
    this.accMs = resume?.accMs ?? 0;
    this.shots = new ShotEffects();
    this.specialFx = new SpecialEffects(this, isTestMode(), this.layout);
    this.speedPress = null;
    this.speedHoldLost = false;
    this.goldTaps = [];
    this.aim = new Aim(this.state.map);
    this.eventCursor = new EventCursor();
    // A resumed game's current events were already handed out before the relayout.
    if (resume) this.eventCursor.take(this.state);
    this.aiming = null;
    this.specialMenuOpen = false;
    this.touchAim = null;
    this.aimPress = null;

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
    // Milestone 32b: world-space layers take the layout's transform (placeWorld); the rest is placed through it.
    const world = () => this.layout.placeWorld(this.add.graphics());
    const mapLayer = world();
    drawMap(mapLayer, this.state.map, this.layout, this.layout.turned ? this.add.graphics() : undefined);
    this.ground = world();
    this.overlay = world();
    this.dynamic = world();
    this.enemySprites = new EnemySprites(this, isTestMode(), this.layout);
    this.shotFx = world();
    this.fx = this.autoTick ? new Effects(this, this.enemySprites, this.state.map, (flash, dx) => this.hud.livesFx(flash, dx), this.layout) : null;
    this.bars = this.add.graphics();
    this.labels = new TowerLabels(this, this.layout);
    // Flyers (Harpies) draw above every walker and label, below the HUD.
    this.enemySprites.setAirLayer(this.add.layer());
    // The aim banner (milestone 30): over the map's top edge, under the HUD and panels.
    // The aim circle's centre cross (milestone 30 follow-up), above every sprite.
    // Milestone 31: the boss veil, gold labels and wave banners, under the HUD.
    this.fx?.createOverlays();
    this.aimCross = world();
    this.bannerBg = this.add.graphics().setDepth(4);
    const bannerTop = this.layout.map.y + BANNER_Y;
    const bannerText = (y: number, size: string, color: string) =>
      this.add.text(this.bannerX, y, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color }).setOrigin(0.5, 0.5).setDepth(4);
    // Portrait (32b follow-up) shows the aim instruction in the status strip instead (Hud).
    this.bannerMain = bannerText(bannerTop + 14, '18px', TEXT.aimBanner);
    this.bannerHint = bannerText(bannerTop + 34, '13px', TEXT.aimHint);
    this.hud = new Hud(this, {
      // Milestone 25c: mid-wave, Start Wave reads "Call next  +N" and calls the next wave.
      onStartWave: () => (callEarlyStatus(this.state).ok ? this.callNextWave() : this.startWave()),
      onToggleSpeed: () => this.onSpeedClick(),
      onSpeedPress: () => this.onSpeedPress(),
      onPick: (type) => this.togglePick(type),
      onSpecial: () => this.onSpecialButton(),
      onSpecialPick: (type) => this.selectSpecial(type),
    }, this.layout);
    this.panel = new TowerPanel(this, this.layout, {
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
      this.layout,
      () => this.playAgain(),
      () => this.toMenu(),
      () => this.continueEndless(),
    );

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.press = null;
      this.aimPress = null;
      if (contains(this.hud.rects().gold, p.x, p.y)) this.goldTap();
      if (this.specialPointerDown(p.x, p.y, p.wasTouch)) return;
      if (p.wasTouch) this.onTap(p.x, p.y);
      else this.onPointerDown(p.x, p.y);
      this.beginPress(p.x, p.y, p.wasTouch);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // A mouse press whose button was released unseen (mouseup outside the
      // page) cancels, so the drag does not stick to the pointer.
      if (this.press !== null && !this.press.touch && !p.wasTouch && mouseDragLost(p.isDown, p.buttons)) {
        this.press = null;
      }
      // The same for a 3x speed hold (PR review): its release was lost, so it ends here.
      if (this.speedPress !== null && !p.wasTouch && mouseDragLost(p.isDown, p.buttons)) this.releaseLostHolds();
      if (this.aimPress !== null && p.wasTouch) {
        this.aimMove(p.x, p.y);
        return;
      }
      if (this.press !== null && this.press.touch === p.wasTouch) {
        this.dragMove(p.x, p.y);
        if (p.wasTouch) return;
      }
      // A finger has no hover: touch moves change nothing else.
      if (!p.wasTouch) this.onPointerMove({ x: p.x, y: p.y });
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.endSpeedPress();
      if (this.aimPress !== null) this.endAimPress(p.x, p.y);
      else this.endPress(p.x, p.y, true);
    });
    this.input.on('pointerupoutside', () => {
      this.endSpeedPress();
      // A touch aim released outside the canvas fires nothing.
      this.aimPress = null;
      this.touchAim = null;
      this.endPress(0, 0, false);
    });
    this.input.on('gameout', () => {
      if (this.press?.active) this.press.cell = null;
      // The pointer left the canvas with no button down: a speed hold has lost its release.
      if (this.speedPress !== null && this.input.activePointer.buttons === 0) this.releaseLostHolds();
      this.onPointerMove(null);
    });
    // Holds whose release may never come (PR review): a cancelled touch, a
    // hidden page or a window that lost focus end the speed hold (back to
    // the speed before it) and the touch aim hold (aiming stays on, so a
    // tap still fires), and drop a drag in progress.
    const lost = () => this.releaseLostHolds();
    const hidden = () => {
      if (document.hidden) lost();
    };
    const canvas = this.game.canvas;
    canvas.addEventListener('pointercancel', lost);
    canvas.addEventListener('touchcancel', lost);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', hidden);
    this.events.once('shutdown', () => {
      canvas.removeEventListener('pointercancel', lost);
      canvas.removeEventListener('touchcancel', lost);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', hidden);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.closeUi());
    this.redraw();
  }

  private onPointerDown(x: number, y: number): void {
    this.setTouch(false);
    this.pointer = { x, y };
    if (this.endScreen.kind) return; // the veil swallows map clicks
    const target = classifyClick(x, y, this.panel.rect, this.state, this.layout);
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
    const target = classifyClick(x, y, this.panel.rect, this.state, this.layout);
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

  /**
   * Specials (milestone 25b) at a pointerdown. Returns true when the press
   * belongs to a special (aiming or the popup) and normal handling is
   * skipped. A press on the popup belongs to its buttons. A press on the
   * HUD, other than on the Special button (whose click toggles), cancels
   * aiming and closes the popup, then is handled as usual. While aiming, a
   * mouse press on the map fires at it; a touch press on the map starts an
   * aim press, resolved on release (endAimPress).
   */
  private specialPointerDown(x: number, y: number, touch: boolean): boolean {
    if (this.endScreen.kind) return false;
    const menu = this.hud.specialMenuRect;
    if (menu !== null && contains(menu, x, y)) return true;
    const onSpecialButton = contains(this.hud.rects().special, x, y);
    if (!this.layout.inMap(x, y)) {
      if (!onSpecialButton) this.cancelSpecial();
      return false;
    }
    if (this.specialMenuOpen) this.specialMenuOpen = false;
    if (this.aiming === null) return false;
    this.setTouch(touch);
    if (touch) {
      this.aimPress = { x0: x, y0: y, x, y, active: false, t0: this.time.now };
      this.touchAim = null;
    } else {
      this.pointer = { x, y };
      this.fireSpecial(this.aiming, { x, y });
    }
    this.redraw();
    return true;
  }

  /** A touch moved during an aim press: past the threshold it becomes a hold, aiming DRAG_LIFT px above the finger. */
  private aimMove(x: number, y: number): void {
    const d = this.aimPress;
    if (d === null) return;
    d.x = x;
    d.y = y;
    if (!d.active && pastDragThreshold(d.x0, d.y0, x, y)) d.active = true;
    if (d.active) {
      this.touchAim = liftedAim(x, y, this.layout, this.lift);
      this.redraw();
    }
  }

  /** Every frame: a touch aim press held AIM_HOLD_MS without moving becomes a hold (milestone 30). */
  private checkAimHold(): void {
    const d = this.aimPress;
    if (d === null || d.active || this.time.now - d.t0 < AIM_HOLD_MS) return;
    d.active = true;
    this.touchAim = liftedAim(d.x, d.y, this.layout, this.lift);
  }

  /**
   * A touch released while aiming (milestone 30). A tap fires at the tap
   * point. A hold fires at its lifted aim point when that point is on the
   * map (the finger may be over the HUD); it cancels aiming and spends
   * nothing when the lifted point is off the map or the finger is on the
   * Special button.
   */
  private endAimPress(x: number, y: number): void {
    const d = this.aimPress;
    this.aimPress = null;
    if (d === null || this.aiming === null) return;
    if (!d.active) {
      this.fireSpecial(this.aiming, { x: d.x0, y: d.y0 });
    } else {
      const aimAt = liftedAim(x, y, this.layout, this.lift);
      if (aimAt === null || contains(this.hud.rects().special, x, y)) this.cancelSpecial();
      else this.fireSpecial(this.aiming, aimAt);
    }
    this.redraw();
  }

  /** Fire `type` at canvas `point` (its world point, through the layout) and end aiming (whether or not the sim accepts it). */
  private fireSpecial(type: SpecialType, point: { x: number; y: number }): SpecialResult {
    this.aiming = null;
    this.touchAim = null;
    this.aimPress = null;
    const at = this.layout.toWorld(point);
    return this.useSpecialAt(type, at.x, at.y);
  }

  /** The HUD's Special button: cancel aiming or the popup if either is on, else select the only special or open the popup. */
  private onSpecialButton(): void {
    if (this.endScreen.kind || !specialReady(this.state)) return;
    if (this.aiming !== null || this.specialMenuOpen) {
      this.cancelSpecial();
      this.redraw();
      return;
    }
    const unlocked = unlockedSpecials(this.state.wave);
    if (unlocked.length === 1) {
      this.selectSpecial(unlocked[0]);
      return;
    }
    this.clearPickAndPanel();
    this.specialMenuOpen = true;
    this.redraw();
  }

  /** Start aiming `type` (from the popup, or directly with one special unlocked); clears the tower pick and panel. */
  private selectSpecial(type: SpecialType): void {
    if (this.endScreen.kind || !specialReady(this.state)) return;
    this.clearPickAndPanel();
    this.specialMenuOpen = false;
    this.aiming = type;
    this.touchAim = null;
    this.aimPress = null;
    this.redraw();
  }

  private clearPickAndPanel(): void {
    this.press = null;
    this.pick = null;
    this.tapCell = null;
    this.armed = null;
    this.panel.close();
  }

  /** Stop aiming and close the popup. */
  private cancelSpecial(): void {
    this.aiming = null;
    this.specialMenuOpen = false;
    this.touchAim = null;
    this.aimPress = null;
  }

  /** Where the aim circle shows, or null: the mouse over the map, or on touch the lifted point of a hold. */
  private aimCentre(): { x: number; y: number } | null {
    if (this.aiming === null) return null;
    if (this.touch) return this.touchAim;
    const p = this.pointer;
    return p !== null && this.layout.inMap(p.x, p.y) ? p : null;
  }

  /** A press started on the speed button: it may become a 3x hold (milestone 30). */
  private onSpeedPress(): void {
    if (this.endScreen.kind) return;
    this.speedHoldLost = false;
    this.speedPress = { t0: this.time.now, before: this.speed, holding: false };
  }

  /** Every frame: a speed press held SPEED_HOLD_MS runs 3x while held. */
  private checkSpeedHold(): void {
    const d = this.speedPress;
    if (d === null || d.holding || this.time.now - d.t0 < SPEED_HOLD_MS) return;
    d.holding = true;
    this.speed = 3;
  }

  /** The speed button's click (its release over it): toggles 1x and 2x, unless the press was a 3x hold. */
  private onSpeedClick(): void {
    // A hold that ended without its release (blur, cancel) may still get the button's late click: it toggles nothing.
    if (this.speedPress?.holding || this.speedHoldLost) {
      this.speedHoldLost = false;
      return;
    }
    this.speedPress = null;
    this.setSpeed(this.speed === 1 ? 2 : 1);
  }

  /** Any release: a 3x hold ends and the speed goes back to what it was. */
  private endSpeedPress(): void {
    const d = this.speedPress;
    this.speedPress = null;
    if (d?.holding) this.setSpeed(d.before);
  }

  /** End every hold whose release was lost: the speed hold, the touch aim hold and a drag (see create()). */
  releaseLostHolds(): void {
    if (this.speedPress?.holding) this.speedHoldLost = true;
    this.endSpeedPress();
    this.aimPress = null;
    this.touchAim = null;
    this.press = null;
    this.redraw();
  }

  /** A press on the Gold readout (milestone 30): the CHEAT_TAPS-th within CHEAT_WINDOW_MS grants the cheat gold. */
  private goldTap(): void {
    const now = this.time.now;
    this.goldTaps = [...this.goldTaps.filter((t) => now - t <= CHEAT_WINDOW_MS), now];
    if (this.goldTaps.length < CHEAT_TAPS) return;
    this.goldTaps = [];
    this.cheatGold();
  }

  /** The gold cheat through the sim (milestone 30); also the test hook. */
  cheatGold(): ReturnType<typeof grantCheatGold> {
    const result = grantCheatGold(this.state);
    this.takeEvents();
    this.redraw();
    return result;
  }

  /** A build bar click: pick that type, or clear the pick if it is already active. */
  private togglePick(type: TowerType): void {
    if (this.endScreen.kind) return;
    // The release of a drag that ended back on its bar button is not a click.
    if (this.press?.active) return;
    this.cancelSpecial();
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
    const cell = cellAt(x, y, this.layout);
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
      this.cancelSpecial();
    }
    d.cell = dragTargetCell(x, y, d.touch, this.layout, this.lift);
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
    const cell = inside ? dragTargetCell(x, y, d.touch, this.layout, this.lift) : null;
    if (cell !== null && this.endScreen.kind === null) {
      if (d.kind === 'place' && isBuildable(this.state, cell)) this.build(cell, d.tower);
      else if (d.kind === 'move' && d.from !== null) this.move(d.from, cell);
    }
    this.redraw();
  }

  /** Escape: clear the pick, the selection, and any special aiming or popup. */
  closeUi(): void {
    this.press = null;
    this.cancelSpecial();
    this.pick = null;
    this.panel.close();
    this.redraw();
  }

  uiState(): UiState {
    return {
      layout: this.layout.kind,
      lift: this.lift,
      map: this.currentMap,
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
      killsLabel: this.panel.killsLine,
      callEarly: callEarlyInfo(this.state),
      dragging:
        this.press === null || !this.press.active
          ? null
          : {
              kind: this.press.kind,
              tower: this.press.tower,
              ...(this.press.from !== null ? { from: { ...this.press.from } } : {}),
              cell: this.press.cell === null ? null : { ...this.press.cell },
            },
      special: {
        charges: this.state.specialCharges,
        aiming: this.aiming,
        unlocked: unlockedSpecials(this.state.wave),
        menuOpen: this.specialMenuOpen,
        aimPoint: (() => {
          const c = this.aimCentre();
          return c === null ? null : { x: c.x, y: c.y };
        })(),
        ready: specialReady(this.state),
        rechargeTicks: specialRecharge(this.state) === null ? 0 : this.state.specialRechargeTicks,
        banner: this.aiming === null ? null : aimBannerText(this.aiming, this.touch),
        holding: this.aimPress?.active ?? false,
        labels: this.specialFx.labelInfo(),
        zones: this.state.zones.map((z) => ({ id: z.id, type: z.type, x: z.x, y: z.y, ticksLeft: z.ticksLeft })),
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

  /** The map this game runs on (milestone 27). */
  get mapId(): MapId {
    return this.currentMap;
  }

  /** Start a brand-new game in a fresh scene, on the same level and map. */
  playAgain(): void {
    this.restartPending = false;
    const data: GameStartData = { difficulty: this.state.difficulty, map: this.currentMap };
    this.scene.restart(data);
  }

  /** Back to the title menu (milestone 25), which still shows the level and (milestone 27) map just played. */
  toMenu(): void {
    this.restartPending = false;
    this.scene.start('title');
  }

  update(_time: number, delta: number): void {
    // Self-check (32b follow-up): a scene drawn for another layout than the window's rebuilds.
    if (this.layout !== currentLayout()) {
      this.relayout();
      return;
    }
    this.checkSpeedHold();
    this.checkAimHold();
    if (this.autoTick) {
      // Ticks beyond the cap are dropped (see loop.ts for why).
      const { ticks, accMs } = ticksDue(this.accMs + delta, this.speed);
      this.accMs = accMs;
      this.fx?.advanceClock(delta, this.speed);
      this.advance(ticks, false);
      // Effects age in real time in play (milestone 30), so a label lasts 1.5 s at any speed.
      this.specialFx.advance(delta);
    }
    this.redraw();
  }

  /** Run `n` simulation ticks, feeding each tick's shots and events to the effects. */
  advance(n: number, redraw = true): void {
    for (let i = 0; i < n; i++) {
      // Milestone 30: once won or lost nothing ticks, so nothing replays after the win.
      if (this.state.phase === 'won' || this.state.phase === 'lost') break;
      tick(this.state);
      this.fx?.onTick(this.state.shots);
      for (const shot of this.state.shots) this.aim.pointAt(shot.cell, shot.to);
      this.shots.afterTick(this.state.shots);
      // In test mode effects age by tick (milestone 30), so step(n) frames are always the same.
      if (!this.autoTick) this.specialFx.advance(1000 / 60);
      // Milestone 30: a sprite for every enemy spawned this tick, before its
      // events, so a hit or kill on the next tick of the same frame is not lost.
      this.enemySprites.addNew(this.state);
      this.takeEvents();
    }
    this.recordScore();
    if (redraw) this.redraw();
  }

  /**
   * Milestone 26: send the waves cleared to the high score store when it
   * went up since the last call. A wave clears only in a tick or an early
   * call, and the count never goes down in a game, so checking after each
   * run of ticks and each call saves every clear, in a lost or abandoned
   * run too.
   */
  private recordScore(): void {
    // Milestone 30: a cheated game saves no best score (the stored best stays as it was).
    if (this.state.cheated) return;
    const cleared = wavesCleared(this.state);
    if (cleared <= this.recordedCleared) return;
    this.recordedCleared = cleared;
    highScores.record(this.state.difficulty, cleared, this.currentMap);
  }

  /** Keep going after the win (milestone 26): the game turns endless and the end screen goes away. */
  continueEndless(): ContinueEndlessResult {
    const result = continueEndless(this.state);
    if (result.ok) this.endScreen.hide();
    this.takeEvents();
    this.redraw();
    return result;
  }

  /** Hand the events not yet seen to the sprites (after every tick and action). */
  private takeEvents(): void {
    if (!this.enemySprites) return;
    const { events, newTick } = this.eventCursor.take(this.state);
    if (newTick) this.enemySprites.newTick();
    if (this.fx) this.fx.onEvents(events, this.state);
    else this.enemySprites.onEvents(events);
  }

  /** Test hook: the current simulation events. */
  simEvents(): GameEvent[] {
    return this.state.events;
  }

  /** Test hook (milestone 31, play only): the effects' counts, or null in test mode. */
  fxState(): FxState | null {
    return this.fx?.snapshot() ?? null;
  }

  /** Test hook (milestone 31, play only): the drawn barrel angle of the tower on `cell`, or null. */
  towerAngle(cell: Cell): number | null {
    return this.fx?.towerAngle(cell) ?? null;
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

  /**
   * Test only (milestone 25c, e2e/perf.spec.ts): inject `n` Goblins spread
   * evenly along the path, starting wave 1 first if in setup. Ordinary
   * enemies with fresh ids and the level's hp; nothing else changes.
   * Reachable outside test mode through window.__tarpit.game, so the perf
   * test can run on the live loop. Only in test mode (?test=1) or perf mode
   * (?perf=1); otherwise it does nothing and returns false. With `span`
   * (px of path from the spawn, default the whole path) the horde is packed
   * into the first `span` px: the pile-up case.
   */
  spawnHorde(n: number, span?: number): boolean {
    if (!isTestMode() && !isPerfMode()) return false;
    if (this.state.phase === 'setup') startWave(this.state);
    const length = Math.min(span ?? pathLength(this.state.map), pathLength(this.state.map));
    for (let i = 0; i < n; i++) {
      this.state.enemies.push({
        id: this.state.nextEnemyId++,
        type: 'goblin',
        hp: enemyMaxHp('goblin', this.state.difficulty),
        distance: ((i + 0.5) * length) / n,
        slow: 0,
        slowTicksLeft: 0,
        specialSlow: 0,
        specialSlowTicksLeft: 0,
        burnDps: 0,
        burnTicksLeft: 0,
      });
    }
    this.takeEvents();
    this.redraw();
    return true;
  }

  /** Call the next wave early (milestone 25c). */
  callNextWave(): CallNextWaveResult {
    const result = callNextWave(this.state);
    this.takeEvents();
    this.recordScore();
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

  /** Use a special aimed at (x, y) through the sim (milestone 25b); a success starts its effects (30: and the keg shakes the camera). */
  useSpecialAt(type: SpecialType, x: number, y: number): SpecialResult {
    const from = this.state.events.length;
    const result = useSpecial(this.state, type, { x, y });
    if (result.ok) {
      const landed = this.state.events.slice(from).find((e) => e.kind === 'special');
      if (landed?.kind === 'special') this.specialFx.add(landed);
      // Milestone 31: the map-only shake (fx/effects.ts), off under reduced motion; none in test mode.
      if (type === 'keg') this.fx?.shakeKeg();
    }
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
    this.ground.clear();
    this.specialFx.drawGround(this.ground, this.state);
    const g = this.dynamic;
    g.clear();
    const moving = this.press?.active && this.press.kind === 'move' ? this.press.from : null;
    const fx = this.fx;
    fx?.update(this.state);
    drawTowers(g, this.state, this.aim, moving, fx ? (cell, type) => fx.towerPose(cell, type) : undefined, this.layout);
    drawStatusRings(g, this.state, this.layout);
    drawShadows(g, this.state, this.layout);
    this.enemySprites.sync(this.state, this.speed);
    this.shotFx.clear();
    if (fx) fx.draw(this.shotFx);
    else this.shots.draw(this.shotFx);
    this.specialFx.draw(this.shotFx);
    this.bars.clear();
    drawHpBars(this.bars, this.state, this.layout);
    this.labels.update(this.state);
    this.syncEndScreen();
    this.redrawUi();
    const banner = this.aiming === null ? null : aimBannerText(this.aiming, this.touch);
    this.hud.update(this.state, this.speed, this.pick, { menuOpen: this.specialMenuOpen, aiming: this.aiming, banner }, this.autoTick ? this.time.now : undefined);
    this.drawBanner();
  }

  /**
   * The touch lift in canvas px (32b follow-up): DRAG_LIFT in landscape; in
   * portrait LIFT_CSS CSS px at the canvas's current fit (input.ts liftPx).
   */
  private get lift(): number {
    return liftPx(this.layout, this.scale.displayScale.y);
  }

  /** The aim banner's centre line: the middle of the map on the screen (milestone 32b). */
  private get bannerX(): number {
    return this.layout.map.x + this.layout.map.width / 2;
  }

  /** The aim banner (milestone 30): shown while aiming, with what to do and how to cancel. */
  private drawBanner(): void {
    // Portrait (32b follow-up): the instruction is in the status strip (Hud), nothing over the map.
    const text = this.aiming === null || this.layout.kind === 'portrait' ? null : aimBannerText(this.aiming, this.touch);
    const main = text?.main ?? '';
    if (this.bannerMain.text !== main) {
      this.bannerMain.setText(main);
      this.bannerHint.setText(text?.hint ?? '');
      this.bannerBg.clear();
      if (text !== null) {
        const w = Math.max(this.bannerMain.width, this.bannerHint.width) + 32;
        const top = this.layout.map.y + BANNER_Y;
        const h = BANNER_H;
        this.bannerBg.fillStyle(COLORS.aimBanner, 0.82).fillRoundedRect(this.bannerX - w / 2, top, w, h, 8);
        this.bannerBg.lineStyle(2, SPECIAL_COLORS[this.aiming!], 1).strokeRoundedRect(this.bannerX - w / 2, top, w, h, 8);
      }
    }
  }

  /** Show the end screen once the game is won or lost. Idempotent. */
  private syncEndScreen(): void {
    const kind = endKind(this.state);
    if (kind === null || this.endScreen.kind !== null) return;
    this.panel.close();
    this.pick = null;
    this.press = null;
    this.cancelSpecial();
    this.endScreen.show(kind, this.state);
  }

  private redrawUi(): void {
    // Keep the UI consistent if the state changed under it (a sale, a test
    // hook, or gold spent below the pick's cost).
    if (this.panel.cell !== null && !towerAt(this.state, this.panel.cell)) this.panel.close();
    if (this.pick !== null && !canPick(this.state, this.pick)) this.pick = null;
    // Aiming and the popup end once no special can be used (charge spent, wave over).
    if (!specialReady(this.state) || (this.aiming !== null && !unlockedSpecials(this.state.wave).includes(this.aiming))) this.cancelSpecial();
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
    else this.hoverCell = p === null || (panelRect !== null && contains(panelRect, p.x, p.y)) ? null : cellAt(p.x, p.y, this.layout);
    const hover = this.hoverCell;
    const hoverTower = hover !== null && towerAt(this.state, hover) !== undefined;
    // A moved tower may be dropped back on its own cell (a no-op).
    const backHome = drag?.kind === 'move' && drag.from !== null && hover !== null && sameCell(drag.from, hover);
    const hoverBuildable = hover !== null && (isBuildable(this.state, hover) || backHome);
    const aimAt = this.aimCentre();
    if (drag !== null) this.setCursor('grabbing');
    else if (aimAt !== null) this.setCursor('crosshair');
    else this.setCursor(hoverTower || (this.pick !== null && hoverBuildable) ? 'pointer' : 'default');

    const g = this.overlay;
    g.clear();
    this.aimCross.clear();

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
      const upgraded = moved?.upgraded ?? false;
      const angle = this.aim.angle(moved ? moved.cell : hover);
      if (hoverBuildable) {
        this.rangeCircles(hover, moved ? towerStats(moved) : TOWER_DEFS[ghostType].base);
        drawTowerShape(g, ghostType, cellCenter(hover), angle, upgraded, GHOST_ALPHA, 0, this.layout);
      } else if (drag !== null) {
        // During a drag a blocked cell also shows a faint red-tinted ghost,
        // so the player sees where it would land. Click and two-tap
        // placement keep the red cell only (no ghost, no range).
        const c = cellCenter(hover);
        drawTowerShape(g, ghostType, c, angle, upgraded, BLOCKED_GHOST_ALPHA, 0, this.layout);
        g.fillStyle(COLORS.cellBad, BLOCKED_GHOST_TINT);
        g.fillCircle(c.x, c.y, 15);
      }
    }
    // The special's aim circle (milestone 25b), and on a touch drag the
    // finger line to its lifted centre.
    if (this.aiming !== null && aimAt !== null) {
      const color = SPECIAL_COLORS[this.aiming];
      const r = SPECIAL_DEFS[this.aiming].radius;
      // The overlay and cross layers are world-space (milestone 32b): the canvas aim point and finger go through the layout.
      const w = this.layout.toWorld(aimAt);
      g.fillStyle(color, AIM_FILL_ALPHA);
      g.fillCircle(w.x, w.y, r);
      // A pale outer edge under the coloured one, so the dark tar circle reads on the path too.
      g.lineStyle(AIM_LINE + 2, COLORS.dragLine, 0.7);
      g.strokeCircle(w.x, w.y, r);
      g.lineStyle(AIM_LINE, color, 1);
      g.strokeCircle(w.x, w.y, r);
      // The landing point: a light cross with a dark outline at the centre,
      // drawn on the cross layer above the sprites (milestone 30 follow-up).
      const c = this.aimCross;
      c.lineStyle(6, COLORS.aimCrossDark, 0.9);
      c.lineBetween(w.x - AIM_CROSS - 1, w.y, w.x + AIM_CROSS + 1, w.y);
      c.lineBetween(w.x, w.y - AIM_CROSS - 1, w.x, w.y + AIM_CROSS + 1);
      c.lineStyle(2.5, COLORS.dragLine, 1);
      c.lineBetween(w.x - AIM_CROSS, w.y, w.x + AIM_CROSS, w.y);
      c.lineBetween(w.x, w.y - AIM_CROSS, w.x, w.y + AIM_CROSS);
      const ap = this.aimPress;
      if (ap?.active) {
        const f = this.layout.toWorld(ap);
        g.lineStyle(DRAG_LINE, COLORS.dragLine, 0.85);
        g.lineBetween(f.x, f.y, w.x, w.y);
        g.fillStyle(COLORS.dragLine, 0.85);
        g.fillCircle(f.x, f.y, 3);
      }
    }
    // On touch, a thin line from the fingertip to the lifted ghost's cell.
    if (drag !== null && drag.touch && hover !== null) {
      const c = cellCenter(hover);
      const f = this.layout.toWorld(drag);
      g.lineStyle(DRAG_LINE, COLORS.dragLine, 0.85);
      g.lineBetween(f.x, f.y, c.x, c.y);
      g.fillStyle(COLORS.dragLine, 0.85);
      g.fillCircle(f.x, f.y, 3);
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

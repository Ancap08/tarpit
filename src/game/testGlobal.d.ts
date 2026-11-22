// Shape of window.__tarpit. Outside test mode only `game` and the read-only
// `uiRects()`, `canvasToPage()`, `portraitCardVisible()`, `animState()` and
// (milestone 26 follow-up) `titleReady()` are set (uiRects() lists the title
// buttons once the title is ready, and the game's once GameScene runs); with ?test=1 every hook below is
// present (see testMode.ts).

import type Phaser from 'phaser';
import type {
  BuildResult,
  CallNextWaveResult,
  ContinueEndlessResult,
  Difficulty,
  GameEvent,
  GameState,
  MapId,
  MoveResult,
  Phase,
  SellResult,
  SpecialResult,
  SpecialType,
  StartWaveResult,
  TargetingMode,
  TargetingResult,
  TowerType,
  UndoUpgradeResult,
  UpgradeResult,
} from '../sim';
import type { AnimState } from './anim/enemySprites';
import type { UiState } from './GameScene';
import type { HudStrings, Rect } from './hud';
import type { ScriptName } from './testMode';
import type { TitleUiState } from './TitleScene';

export interface TarpitTestApi {
  game: Phaser.Game;
  /** Key of the active scene: 'title' or 'game'. */
  scene(): string;
  /** The live simulation state (serialized when read through page.evaluate). */
  state(): GameState;
  /** Run n simulation ticks, then redraw. */
  step(n: number): void;
  /**
   * Leave the title menu as [Play] does, on `difficulty` (Normal when left
   * out, whatever the menu shows; milestone 25) and `map` (Meadow when left
   * out, whatever the menu shows; milestone 27); resolves once GameScene
   * has been created. Does nothing if GameScene is already running.
   */
  startGame(difficulty?: Difficulty, map?: MapId): Promise<void>;
  /** The running game's level (milestone 25). */
  difficulty(): Difficulty;
  startWave(): StartWaveResult;
  /** Call the next wave early through the scene's action (milestone 25c). */
  callNextWave(): CallNextWaveResult;
  /** Keep going after the win through the scene's action, as the win screen's button does (milestone 26). */
  continueEndless(): ContinueEndlessResult;
  /**
   * The best waves cleared stored for `difficulty` on `map` (Meadow when
   * left out; milestones 26 and 27, highScore.ts), or null. Works on the
   * title menu too.
   */
  bestScore(difficulty: Difficulty, map?: MapId): number | null;
  /**
   * Test only (milestone 25c, e2e/perf.spec.ts): inject `n` Goblins spread
   * evenly along the path into the running wave (starts wave 1 first if in
   * setup). They are ordinary enemies with fresh ids. With `span`, packed
   * into the first `span` px of path. Returns whether it ran (always in
   * test mode).
   */
  spawnHorde(n: number, span?: number): boolean;
  /** Build on grid cell (col, row) through the scene's action (no clicks). */
  buildAt(col: number, row: number, type: TowerType): BuildResult;
  upgradeAt(col: number, row: number): UpgradeResult;
  sellAt(col: number, row: number): SellResult;
  /** Move the unlocked tower on (fromCol, fromRow) to (toCol, toRow), in setup (milestone 25a). */
  moveAt(fromCol: number, fromRow: number, toCol: number, toRow: number): MoveResult;
  /** Undo the upgrade bought this setup phase on (col, row) (milestone 25a). */
  undoUpgradeAt(col: number, row: number): UndoUpgradeResult;
  /** Set the targeting mode of the tower on (col, row) through the scene's action (milestone 24). */
  setTargetingAt(col: number, row: number, mode: TargetingMode): TargetingResult;
  /**
   * Use a special aimed at canvas point (x, y) through the scene's action
   * (milestone 25b; no clicks, no aiming). In test mode no effect is drawn.
   */
  useSpecialAt(type: SpecialType, x: number, y: number): SpecialResult;
  setSpeed(speed: 1 | 2): void;
  speed(): 1 | 2;
  /**
   * Canvas-space rectangles of everything clickable, by name: `startWave`,
   * `speed`, `bar:musketeer`, `bar:cannon`, `bar:tarpit`, `bar:longbow`,
   * `bar:mortar`, `bar:firepot`, while the tower
   * panel is open `panel:upgrade`, `panel:sell` and `panel:target`, and `playAgain` and
   * `menu` while an end screen shows. On the title menu (milestone 25):
   * `title:easy`, `title:normal`, `title:hard`, `title:play` and (milestone
   * 27) `title:map:meadow`, `title:map:switchback`, `title:map:riverbend` only, and
   * only once titleReady() (none before the menu's first frame). Map cells are not listed: cell (col, row) is clicked at
   * (col * 32 + 16, row * 32 + 16). At the 960x580 test viewport, canvas
   * space equals page space; at other sizes use canvasToPage(). The open
   * panel also lists `panel:close`. `panel:upgrade` and `panel:sell` keep
   * their names when they read "Undo upgrade" and "Remove" (milestone 25a).
   * Milestone 26: `keepGoing` while the win screen shows.
   * Milestone 25b: `special` (the HUD's Special button) and, while its
   * popup is open, `special:keg`, `special:tarBarrel` and
   * `special:fireArrows` for the unlocked specials listed.
   */
  uiRects(): { startWave: Rect; speed: Rect; special: Rect } & Record<string, Rect>;
  /**
   * A canvas-space point in page coordinates (CSS pixels), through the scale
   * manager's fit and letterboxing, for page.mouse and page.touchscreen.
   */
  canvasToPage(x: number, y: number): { x: number; y: number };
  /** True while the "turn your device" card shows (portrait window). */
  portraitCardVisible(): boolean;
  /**
   * The title menu is showing and has been drawn, so its buttons take
   * clicks (milestone 26 follow-up; TitleScene "Ready"). Wait for it
   * (e2e/title.ts waitForTitle) before clicking or tapping a title button.
   * Also outside test mode.
   */
  titleReady(): boolean;
  /**
   * Build UI state: the bar's pick, the highlighted cell, the armed cell and
   * touch mode, the selected tower's cell, whether the panel is open, the
   * selected tower's targeting mode, the targeting, upgrade and sell
   * buttons' labels, and the drag in progress (milestone 25a; `cell` is
   * 48 px above a finger). Towers in state() carry `locked` (no dashed
   * outline), `unlockedSpend` and `upgradedThisPhase`. `special` (milestone
   * 25b): charges, the special being aimed, the unlocked specials, whether
   * the popup is open, and the aim circle's centre (canvas px) or null.
   * On the title menu (milestone 25) it is `{ scene: 'title', difficulty,
   * map, bestLine }` with the selected level, (milestone 27) the selected
   * map and (milestone 26) the high-score line's text and box, or null:
   * call it as `ui<TitleUiState>()` there. In the game, `map` (milestone 27)
   * is the map being played.
   */
  ui<T extends UiState | TitleUiState = UiState>(): T;
  /** HUD strings; `boss` is the boss bar label ("Grumblefoot 4000 / 4000") or null when hidden. */
  hudText(): HudStrings;
  /** The end screen showing ('won' or 'lost'), or null. */
  endScreen(): 'won' | 'lost' | null;
  /**
   * Play a headless script from src/sim (soundBuild, lazyBuild or comboBuild) through the
   * scene's actions, wave by wave, then redraw. Returns the final phase.
   * With `untilWave`, stops in setup before that wave (its build actions
   * applied, the wave not started). Milestone 26: endlessIdle and
   * endlessGreedy press Keep going after the win and play on until lost,
   * so `untilWave` may be past 10.
   */
  runScript(name: ScriptName, untilWave?: number): Phase;
  /**
   * An enemy sprite's animation state, or null if that enemy has no sprite
   * (never spawned, gone, or before GameScene runs). `frame` is the position
   * in the walk cycle and is always 0 in test mode. Also outside test mode.
   * The boss reports texture 'boss'.
   */
  animState(enemyId: number): AnimState | null;
  /** The simulation's current event list (state.events, see src/sim/events.ts). */
  events(): GameEvent[];
}

export type TarpitGlobal = Pick<TarpitTestApi, 'game' | 'uiRects' | 'canvasToPage' | 'portraitCardVisible' | 'animState' | 'titleReady'> &
  Partial<TarpitTestApi>;

declare global {
  interface Window {
    __tarpit?: TarpitGlobal;
  }
}

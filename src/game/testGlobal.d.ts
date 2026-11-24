// Shape of window.__tarpit. Outside test mode only `game` and the read-only (milestone 31: also `fx()` and `towerAngle()`;
// milestone 33: `audio()`, `setMuted()` and `audioLab`)
// `uiRects()`, `canvasToPage()`, (milestone 32b) `layout()`, `cellToPage()`, `worldToPage()`, `animState()` and
// (milestone 26 follow-up) `titleReady()` are set (uiRects() lists the title
// buttons once the title is ready, and the game's once GameScene runs); with ?test=1 every hook below is
// present (see testMode.ts).

import type Phaser from 'phaser';
import type {
  CampaignProgress,
  BoonChoices,
  BoonId,
  BoonOffer,
  EnemyType,
  pickBoon,
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
  Tower,
  TowerLevel,
  UndoUpgradeResult,
  UpgradeResult,
  UpgradePath,
} from '../sim';
import type { AnimState } from './anim/enemySprites';
import type { AudioState } from './audio/engine';
import type { audioLab } from './audio/lab';
import type { FxState } from './fx/effects';
import type { DecorState } from './decor/livingMap';
import type { PageLockState } from './pageLock';
import type { GameScene, PlayAction, UiState } from './GameScene';
import type { HudStrings, Rect } from './hud';
import type { ScriptName } from './testMode';
import type { TitleUiState } from './TitleScene';

export interface TarpitTestApi {
  game: Phaser.Game;
  paused(): boolean;
  pause(): void;
  resume(): void;
  /** Key of the active scene: 'title' or 'game'. */
  scene(): string;
  /** Visible screen, including the title's campaign pages and terminal results. */
  screen(): TitleUiState['screen'] | 'game' | 'result' | null;
  campaignLabels(): (Rect & { text: string })[];
  levelStops(): TitleUiState['stops'];
  setTipsEnabled(enabled: boolean): void;
  /** Replace saved campaign progress in a frozen test session. */
  setCampaignProgress(table: CampaignProgress): void;
  campaignResult(): ReturnType<GameScene['campaignResult']>;
  /** The live simulation state (serialized when read through page.evaluate). */
  state(): Omit<GameState, 'towers'> & { towers: (Tower & { readonly level: TowerLevel })[] };
  painted(): import('./skin/painted').PaintedState;
  /** Run n simulation ticks, then redraw. */
  step(n: number): void;
  /**
   * Leave the title menu as [Play] does, on `difficulty` (Normal when left
   * out, whatever the menu shows; milestone 25) and `map` (Meadow when left
   * out, whatever the menu shows; milestone 27); resolves once GameScene
   * has been created. Does nothing if GameScene is already running.
   */
  startGame(difficulty?: Difficulty, map?: MapId): Promise<void>;
  startLevel(id: number): Promise<void>;
  levelStars(): 0 | 1 | 2 | 3;
  progress(): CampaignProgress;
  levelOpen(id: number): boolean;
  runBot(name: 'botGood' | 'botBeginner', throughWave?: number): Phase;
  /** The running game's level (milestone 25). */
  difficulty(): Difficulty;
  pendingBoon(): BoonOffer | null;
  heldBoons(): BoonId[];
  pickBoon(id: BoonId): PlayAction<ReturnType<typeof pickBoon>>;
  bossOnField(): EnemyType | null;
  startWave(): PlayAction<StartWaveResult>;
  /** Call the next wave early through the scene's action (milestone 25c). */
  callNextWave(): PlayAction<CallNextWaveResult>;
  /** Keep going after the win through the scene's action, as the win screen's button does (milestone 26). */
  continueEndless(): PlayAction<ContinueEndlessResult>;
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
  buildAt(col: number, row: number, type: TowerType): PlayAction<BuildResult>;
  upgradeAt(col: number, row: number, path?: UpgradePath): PlayAction<UpgradeResult>;
  sellAt(col: number, row: number): PlayAction<SellResult>;
  /** Move the unlocked tower on (fromCol, fromRow) to (toCol, toRow), in setup (milestone 25a). */
  moveAt(fromCol: number, fromRow: number, toCol: number, toRow: number): PlayAction<MoveResult>;
  /** Undo the upgrade bought this setup phase on (col, row) (milestone 25a). */
  undoUpgradeAt(col: number, row: number): PlayAction<UndoUpgradeResult>;
  /** Set the targeting mode of the tower on (col, row) through the scene's action (milestone 24). */
  setTargetingAt(col: number, row: number, mode: TargetingMode): PlayAction<TargetingResult>;
  /**
   * Use a special aimed at canvas point (x, y) through the scene's action
   * (milestone 25b; no clicks, no aiming). In test mode no effect is drawn.
   */
  useSpecialAt(type: SpecialType, x: number, y: number): PlayAction<SpecialResult>;
  /** 1x, 2x, or (milestone 30) 3x as while the speed button is held. */
  setSpeed(speed: 1 | 2 | 3): void;
  speed(): 1 | 2 | 3;
  /** The gold cheat through the scene, as five quick taps on Gold do (milestone 30). */
  cheatGold(): ReturnType<GameScene['cheatGold']>;
  /**
   * Canvas-space rectangles of everything clickable, by name: `startWave`,
   * `speed`, `bar:musketeer`, `bar:cannon`, `bar:tarpit`, `bar:longbow`,
   * `bar:mortar`, `bar:firepot`, while the tower
   * panel is open `panel:upgrade`, `panel:sell` and `panel:target`, and `playAgain` and
   * `menu` while an end screen shows. On the title menu (milestone 25):
   * `title:easy`, `title:normal`, `title:hard`, `title:play` and (milestone
   * 27) `title:map:meadow`, `title:map:switchback`, `title:map:riverbend` only, and
   * only once titleReady() (none before the menu's first frame). Map cells are not listed: use cellToPage()
   * (milestone 32b; in landscape cell (col, row) is at canvas (col * 32 + 16, row * 32 + 16)).
   * Rectangles are in canvas coordinates for the active layout. At the 960x580 test viewport, canvas
   * space equals page space; at other sizes use canvasToPage(). The open
   * panel also lists `panel:close`. `panel:undo` appears for an upgrade bought
   * this setup and `panel:path:A` and `panel:path:B` show at level 2.
   * `panel:sell` keeps its name when it reads "Remove".
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
  /** Milestone 32b (it replaces portraitCardVisible): the layout the window gets, 'landscape' or 'portrait'. */
  layout(): 'landscape' | 'portrait';
  /** Milestone 32b: the page point of a map cell's centre in the active layout, for page.mouse and page.touchscreen. */
  cellToPage(col: number, row: number): { x: number; y: number };
  /** Milestone 32b: the page point of a world point (the simulation's 960 x 480 map) in the active layout. */
  worldToPage(x: number, y: number): { x: number; y: number };
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
   * so `untilWave` may be past 20.
   */
  runScript(name: ScriptName, untilWave?: number, boons?: BoonChoices): Phase;
  /**
   * An enemy sprite's animation state, or null if that enemy has no sprite
   * (never spawned, gone, or before GameScene runs). `frame` is the position
   * in the walk cycle and is always 0 in test mode. Also outside test mode.
   * The boss reports texture 'boss'.
   */
  animState(enemyId: number): AnimState | null;
  /** The simulation's current event list (state.events, see src/sim/events.ts). */
  events(): GameEvent[];
  /**
   * Milestone 31 (also outside test mode): the play-mode effects' counts
   * (projectiles, impacts, gold labels, banner, shakes, darkenings, ...), or
   * null in test mode, where effects are off.
   */
  fx(): FxState | null;
  /**
   * Milestone 34 (also outside test mode): the map decoration: every tree
   * and bush with its cell, the ids hidden under towers, the placing fade,
   * whether the moving things hold still, and where they are.
   */
  decor(): DecorState | null;
  /** Milestone 31: the drawn barrel angle of the tower on (col, row) in play, or null. */
  towerAngle(col: number, row: number): number | null;
  /** Milestone 35 (also outside test mode): the page lock's counts (pageLock.ts). */
  pageLock(): PageLockState;
  /** Milestone 33 (also outside test mode): the sound engine's state (audio/engine.ts). */
  audio(): AudioState;
  /** Milestone 33: mute or unmute, as the mute button does (stored). */
  setMuted(muted: boolean): void;
  /** Milestone 33: offline rendering of the recipes (audio/lab.ts), for tests and scripts/render-sounds.ts. */
  audioLab: typeof audioLab;
}

export type TarpitGlobal = Pick<TarpitTestApi, 'paused' | 'pause' | 'resume' | 'game' | 'uiRects' | 'canvasToPage' | 'layout' | 'cellToPage' | 'worldToPage' | 'animState' | 'titleReady' | 'fx' | 'decor' | 'towerAngle' | 'pageLock' | 'audio' | 'setMuted' | 'audioLab'> &
  Partial<TarpitTestApi>;

declare global {
  interface Window {
    __tarpit?: TarpitGlobal;
  }
}

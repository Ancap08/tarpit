// Shape of window.__tarpit. Outside test mode only `game` and the read-only
// `uiRects()` are set (uiRects() is empty until GameScene runs); with ?test=1
// every hook below is present (see testMode.ts).

import type Phaser from 'phaser';
import type { BuildResult, GameState, Phase, SellResult, StartWaveResult, TowerType, UpgradeResult } from '../sim';
import type { UiState } from './GameScene';
import type { HudStrings, Rect } from './hud';

export interface TarpitTestApi {
  game: Phaser.Game;
  /** Key of the active scene: 'title' or 'game'. */
  scene(): string;
  /** The live simulation state (serialized when read through page.evaluate). */
  state(): GameState;
  /** Run n simulation ticks, then redraw. */
  step(n: number): void;
  /** Leave the title screen; resolves once GameScene has been created. */
  startGame(): Promise<void>;
  startWave(): StartWaveResult;
  /** Build on grid cell (col, row) through the scene's action (no clicks). */
  buildAt(col: number, row: number, type: TowerType): BuildResult;
  upgradeAt(col: number, row: number): UpgradeResult;
  sellAt(col: number, row: number): SellResult;
  setSpeed(speed: 1 | 2): void;
  speed(): 1 | 2;
  /**
   * Canvas-space rectangles of everything clickable, by name: `startWave`,
   * `speed`, `bar:musketeer`, `bar:cannon`, `bar:tarpit`, `bar:longbow`,
   * `bar:mortar`, `bar:firepot`, while the tower
   * panel is open `panel:upgrade` and `panel:sell`, and `playAgain` while an
   * end screen shows. Map cells are not listed: cell (col, row) is clicked at
   * (col * 32 + 16, row * 32 + 16). At the 960x580 test viewport, canvas
   * space equals page space.
   */
  uiRects(): { startWave: Rect; speed: Rect } & Record<string, Rect>;
  /** Build UI state: the bar's pick, the hovered cell, the selected tower's cell, and whether the panel is open. */
  ui(): UiState;
  hudText(): HudStrings;
  /** The end screen showing ('won' or 'lost'), or null. */
  endScreen(): 'won' | 'lost' | null;
  /**
   * Play a headless script from src/sim (soundBuild or lazyBuild) through the
   * scene's actions, wave by wave, then redraw. Returns the final phase.
   */
  runScript(name: 'soundBuild' | 'lazyBuild'): Phase;
}

export type TarpitGlobal = Pick<TarpitTestApi, 'game' | 'uiRects'> & Partial<TarpitTestApi>;

declare global {
  interface Window {
    __tarpit?: TarpitGlobal;
  }
}

// Shape of window.__tarpit. Outside test mode only `game` is set; with
// ?test=1 every hook below is present (see testMode.ts).

import type Phaser from 'phaser';
import type { BuildResult, GameState, SellResult, StartWaveResult, TowerType, UpgradeResult } from '../sim';
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
  build(spotId: number, type: TowerType): BuildResult;
  upgrade(spotId: number): UpgradeResult;
  sell(spotId: number): SellResult;
  setSpeed(speed: 1 | 2): void;
  speed(): 1 | 2;
  /**
   * Canvas-space rectangles of everything clickable, by name: `startWave`,
   * `speed`, `spot:<id>` for every build spot, and while open `menu:musketeer`,
   * `menu:cannon`, `menu:tarpit`, `panel:upgrade`, `panel:sell`. At the
   * 960x540 test viewport, canvas space equals page space.
   */
  uiRects(): { startWave: Rect; speed: Rect } & Record<string, Rect>;
  /** Build UI state: the menu's spot, the selected tower's spot, and which popup is open. */
  ui(): UiState;
  hudText(): HudStrings;
}

export type TarpitGlobal = Pick<TarpitTestApi, 'game'> & Partial<TarpitTestApi>;

declare global {
  interface Window {
    __tarpit?: TarpitGlobal;
  }
}

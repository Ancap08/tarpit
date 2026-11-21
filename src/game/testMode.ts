// Test mode (?test=1): time is frozen and window.__tarpit exposes hooks for
// Playwright. Outside test mode window.__tarpit holds only the Phaser game.

import type Phaser from 'phaser';
import { lazyBuild, soundBuild, WAVES, type BuildAction, type Cell, type Phase, type WaveScript } from '../sim';
import type { GameScene } from './GameScene';
import { LEGACY_SPOT_CELLS } from './legacySpots';
import type { TarpitTestApi } from './testGlobal';

export function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

const SCRIPTS: Record<'soundBuild' | 'lazyBuild', () => WaveScript> = { soundBuild, lazyBuild };

/** Same cap per wave as the headless runner (src/sim/headless.ts). */
const MAX_TICKS_PER_WAVE = 60 * 600;

/**
 * Play a headless wave script through the scene's own actions (the ones the
 * build UI and Start Wave button call), wave by wave: that wave's actions,
 * Start Wave, then single ticks until the wave ends or the game is over.
 * Throws if the sim refuses an action, so a drifting script fails loudly.
 */
function runScript(scene: GameScene, script: WaveScript): Phase {
  const apply = (a: BuildAction) => {
    const r = a.type === 'build' ? scene.build(a.cell, a.tower) : a.type === 'upgrade' ? scene.upgrade(a.cell) : scene.sell(a.cell);
    if (!r.ok) throw new Error(`runScript: ${a.type} at cell (${a.cell.col},${a.cell.row}) refused: ${r.reason}`);
  };
  // A function, not a property read, so TypeScript does not narrow the phase
  // across the calls that change it.
  const phase = (): Phase => scene.state.phase;
  while (phase() === 'setup' && scene.state.wave < WAVES.length) {
    for (const action of script[scene.state.wave] ?? []) apply(action);
    const started = scene.startWave();
    if (!started.ok) throw new Error(`runScript: startWave refused: ${started.reason}`);
    for (let t = 0; phase() === 'wave' && t < MAX_TICKS_PER_WAVE; t++) scene.advance(1, false);
  }
  scene.redraw();
  return phase();
}

/** The cell for a legacy spot id, or an off-grid cell for an unknown id. */
function legacyCell(spotId: number): Cell {
  return LEGACY_SPOT_CELLS[spotId] ?? { col: -1, row: -1 };
}

export function installGlobal(game: Phaser.Game): void {
  if (!isTestMode()) {
    window.__tarpit = { game };
    return;
  }

  const scene = (): GameScene => {
    const s = game.scene.getScene('game') as GameScene;
    if (!game.scene.isActive('game')) throw new Error('GameScene is not running; call startGame() first');
    return s;
  };

  const api: TarpitTestApi = {
    game,
    scene: () => game.scene.getScenes(true)[0]?.scene.key ?? '',
    state: () => scene().state,
    step: (n) => scene().advance(n),
    startGame: () =>
      new Promise<void>((resolve) => {
        if (game.scene.isActive('game')) {
          resolve();
          return;
        }
        game.scene.getScene('game').events.once('create', () => resolve());
        game.scene.getScene('title').scene.start('game');
      }),
    startWave: () => scene().startWave(),
    // Legacy spot ids translate to their cells (legacySpots.ts); an id with
    // no cell gives a cell outside the grid, which the sim refuses.
    build: (spotId, type) => scene().build(legacyCell(spotId), type),
    upgrade: (spotId) => scene().upgrade(legacyCell(spotId)),
    sell: (spotId) => scene().sell(legacyCell(spotId)),
    buildAt: (col, row, type) => scene().build({ col, row }, type),
    setSpeed: (speed) => scene().setSpeed(speed),
    speed: () => scene().speed,
    uiRects: () => scene().uiRects() as ReturnType<TarpitTestApi['uiRects']>,
    ui: () => scene().uiState(),
    hudText: () => scene().hudStrings(),
    endScreen: () => scene().endScreenKind(),
    runScript: (name) => runScript(scene(), SCRIPTS[name]()),
  };
  window.__tarpit = api;
}

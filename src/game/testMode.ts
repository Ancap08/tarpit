// Test mode (?test=1): time is frozen and window.__tarpit exposes hooks for
// Playwright. Outside test mode window.__tarpit holds the Phaser game and the
// read-only uiRects(), canvasToPage(), portraitCardVisible(), animState() and
// titleReady() (milestone 26 follow-up), so real-time
// tests and the demo recorder click the HUD (and, from milestone 25, the
// title menu) where it is drawn at any viewport size.

import type Phaser from 'phaser';
import {
  bestUnlockedSpecial,
  comboBuild,
  DEFAULT_DIFFICULTY,
  DEFAULT_MAP,
  densestCluster,
  ENDLESS_WAVE_CAP,
  endlessGreedy,
  endlessIdle,
  lazyBuild,
  soundBuild,
  WAVES,
  type Archetype,
  type BuildAction,
  type Phase,
  type TimedAction,
  type WaveScript,
} from '../sim';
import type { GameScene } from './GameScene';
import { highScores } from './highScore';
import { portraitCardVisible } from './portrait';
import type { TarpitTestApi } from './testGlobal';
import type { TitleScene } from './TitleScene';

export function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

/**
 * Perf mode (?perf=1, milestone 25c): the live loop runs as in play, but the
 * test-only GameScene.spawnHorde works, for e2e/perf.spec.ts. Without
 * ?test=1 or ?perf=1, spawnHorde does nothing.
 */
export function isPerfMode(): boolean {
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

/** Scripts runScript plays; the endless ones (milestone 26) press Keep going after the win. */
export type ScriptName = 'soundBuild' | 'lazyBuild' | 'comboBuild' | 'endlessIdle' | 'endlessGreedy';
const SCRIPTS: Record<ScriptName, Archetype> = { soundBuild, lazyBuild, comboBuild, endlessIdle, endlessGreedy };

/** Same cap per wave as the headless runner (src/sim/headless.ts). */
const MAX_TICKS_PER_WAVE = 60 * 600;

/**
 * Play a headless wave script through the scene's own actions (the ones the
 * build UI and Start Wave button call), wave by wave: that wave's actions,
 * Start Wave, then single ticks until the wave ends or the game is over.
 * Throws if the sim refuses an action, so a drifting script fails loudly.
 * With `untilWave` (milestone 23), stops in setup before that wave: its
 * actions are applied but it is not started. Timed actions (milestone 25b
 * specials; 25c cluster specials and early calls) fire before the tick on
 * which the wave tick counter reaches their atWaveTick, as in playScripted;
 * a cluster special aims at densestCluster of the live state, and a wave
 * called early starts without Start Wave. An endless script (milestone 26)
 * presses Keep going (the scene's continueEndless) when wave 10 is won and
 * plays on, so `untilWave` may be past 10 (11 stops in setup right after
 * Keep going).
 */
function runScript(scene: GameScene, script: WaveScript, untilWave?: number): Phase {
  const apply = (a: BuildAction) => {
    const r =
      a.type === 'build'
        ? scene.build(a.cell, a.tower)
        : a.type === 'upgrade'
          ? scene.upgrade(a.cell)
          : a.type === 'target'
            ? scene.setTargeting(a.cell, a.mode)
            : scene.sell(a.cell);
    if (!r.ok) throw new Error(`runScript: ${a.type} at cell (${a.cell.col},${a.cell.row}) refused: ${r.reason}`);
  };
  const fire = (a: TimedAction) => {
    if (a.type === 'callEarly') {
      scene.callNextWave();
      return;
    }
    if (a.type === 'special') {
      scene.useSpecialAt(a.special, a.x, a.y);
      return;
    }
    const aim = densestCluster(scene.state);
    const special = bestUnlockedSpecial(scene.state.wave);
    if (aim && special) scene.useSpecialAt(special, aim.centroid.x, aim.centroid.y);
  };
  // A function, not a property read, so TypeScript does not narrow the phase
  // across the calls that change it.
  const phase = (): Phase => scene.state.phase;
  let called = false;
  const limit = script.endless ? ENDLESS_WAVE_CAP : WAVES.length;
  if (script.endless && phase() === 'won') scene.continueEndless();
  while ((phase() === 'setup' || called) && scene.state.wave < limit) {
    const index = called ? scene.state.wave - 1 : scene.state.wave;
    for (const action of script[index] ?? []) apply(action);
    if (!called) {
      if (untilWave !== undefined && scene.state.wave + 1 >= untilWave) break;
      const started = scene.startWave();
      if (!started.ok) throw new Error(`runScript: startWave refused: ${started.reason}`);
    }
    called = false;
    const wave = scene.state.wave;
    const timed = script.timed?.[wave - 1] ?? [];
    for (let t = 0; phase() === 'wave' && t < MAX_TICKS_PER_WAVE; t++) {
      for (const a of timed) if (a.atWaveTick === scene.state.waveTick && scene.state.wave === wave) fire(a);
      if (scene.state.wave !== wave) {
        called = true;
        break;
      }
      scene.advance(1, false);
    }
    if (script.endless && phase() === 'won') scene.continueEndless();
  }
  scene.redraw();
  return phase();
}

const titleScene = (game: Phaser.Game): TitleScene => game.scene.getScene('title') as TitleScene;

/**
 * The clickable rectangles of the running scene: the title menu's
 * (`title:easy`, `title:normal`, `title:hard`, `title:play`) or the
 * GameScene's; none between scenes.
 */
function uiRectsOf(game: Phaser.Game): ReturnType<TarpitTestApi['uiRects']> {
  type Rects = ReturnType<TarpitTestApi['uiRects']>;
  if (game.scene.isActive('title')) return titleScene(game).rects() as Rects;
  if (!game.scene.isActive('game')) return {} as Rects;
  return (game.scene.getScene('game') as GameScene).uiRects() as Rects;
}

/**
 * A canvas-space point in page (CSS pixel) coordinates, through the scale
 * manager's fit: the canvas's on-page bounds and its display scale.
 */
function canvasToPage(game: Phaser.Game, x: number, y: number): { x: number; y: number } {
  const scale = game.scale;
  scale.updateBounds();
  const b = scale.canvasBounds;
  return {
    x: b.left + window.scrollX + x / scale.displayScale.x,
    y: b.top + window.scrollY + y / scale.displayScale.y,
  };
}

export function installGlobal(game: Phaser.Game): void {
  const always = {
    game,
    uiRects: () => uiRectsOf(game),
    animState: (enemyId: number) => (game.scene.isActive('game') ? (game.scene.getScene('game') as GameScene).animState(enemyId) : null),
    canvasToPage: (x: number, y: number) => canvasToPage(game, x, y),
    portraitCardVisible,
    titleReady: () => game.scene.isActive('title') && titleScene(game).isReady,
    // Milestone 31: the play-mode effects (null in test mode or between scenes).
    fx: () => (game.scene.isActive('game') ? (game.scene.getScene('game') as GameScene).fxState() : null),
    towerAngle: (col: number, row: number) =>
      game.scene.isActive('game') ? (game.scene.getScene('game') as GameScene).towerAngle({ col, row }) : null,
  };
  if (!isTestMode()) {
    window.__tarpit = always;
    return;
  }

  const scene = (): GameScene => {
    const s = game.scene.getScene('game') as GameScene;
    if (!game.scene.isActive('game')) throw new Error('GameScene is not running; call startGame() first');
    return s;
  };

  const api: TarpitTestApi = {
    ...always,
    scene: () => game.scene.getScenes(true)[0]?.scene.key ?? '',
    state: () => scene().state,
    step: (n) => scene().advance(n),
    startGame: (difficulty = DEFAULT_DIFFICULTY, map = DEFAULT_MAP) =>
      new Promise<void>((resolve) => {
        if (game.scene.isActive('game')) {
          resolve();
          return;
        }
        game.scene.getScene('game').events.once('create', () => resolve());
        titleScene(game).play(difficulty, map);
      }),
    difficulty: () => scene().state.difficulty,
    startWave: () => scene().startWave(),
    callNextWave: () => scene().callNextWave(),
    continueEndless: () => scene().continueEndless(),
    bestScore: (difficulty, map = DEFAULT_MAP) => highScores.best(difficulty, map) ?? null,
    spawnHorde: (n, span) => scene().spawnHorde(n, span),
    buildAt: (col, row, type) => scene().build({ col, row }, type),
    upgradeAt: (col, row) => scene().upgrade({ col, row }),
    sellAt: (col, row) => scene().sell({ col, row }),
    moveAt: (fromCol, fromRow, toCol, toRow) => scene().move({ col: fromCol, row: fromRow }, { col: toCol, row: toRow }),
    undoUpgradeAt: (col, row) => scene().undoUpgrade({ col, row }),
    setTargetingAt: (col, row, mode) => scene().setTargeting({ col, row }, mode),
    useSpecialAt: (type, x, y) => scene().useSpecialAt(type, x, y),
    setSpeed: (speed) => scene().setSpeed(speed),
    speed: () => scene().speed,
    cheatGold: () => scene().cheatGold(),
    uiRects: () => {
      if (!game.scene.isActive('title')) scene(); // throws between scenes, as the other hooks do
      return uiRectsOf(game);
    },
    ui: (() => (game.scene.isActive('title') ? titleScene(game).uiState() : scene().uiState())) as TarpitTestApi['ui'],
    hudText: () => scene().hudStrings(),
    endScreen: () => scene().endScreenKind(),
    events: () => scene().simEvents(),
    // The archetype records its script on the running game's level (milestone 25) and map (27).
    runScript: (name, untilWave) => runScript(scene(), SCRIPTS[name](scene().state.difficulty, scene().mapId), untilWave),
  };
  window.__tarpit = api;
}

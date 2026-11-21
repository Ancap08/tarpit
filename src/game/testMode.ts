// Test mode (?test=1): time is frozen and window.__tarpit exposes hooks for
// Playwright. Outside test mode window.__tarpit holds the Phaser game and the
// read-only uiRects(), canvasToPage(), portraitCardVisible() and animState(), so real-time
// tests and the demo recorder click the HUD (and, from milestone 25, the
// title menu) where it is drawn at any viewport size.

import type Phaser from 'phaser';
import { comboBuild, DEFAULT_DIFFICULTY, lazyBuild, soundBuild, WAVES, type Archetype, type BuildAction, type Phase, type WaveScript } from '../sim';
import type { GameScene } from './GameScene';
import { portraitCardVisible } from './portrait';
import type { TarpitTestApi } from './testGlobal';
import type { TitleScene } from './TitleScene';

export function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

const SCRIPTS: Record<'soundBuild' | 'lazyBuild' | 'comboBuild', Archetype> = { soundBuild, lazyBuild, comboBuild };

/** Same cap per wave as the headless runner (src/sim/headless.ts). */
const MAX_TICKS_PER_WAVE = 60 * 600;

/**
 * Play a headless wave script through the scene's own actions (the ones the
 * build UI and Start Wave button call), wave by wave: that wave's actions,
 * Start Wave, then single ticks until the wave ends or the game is over.
 * Throws if the sim refuses an action, so a drifting script fails loudly.
 * With `untilWave` (milestone 23), stops in setup before that wave: its
 * actions are applied but it is not started.
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
  // A function, not a property read, so TypeScript does not narrow the phase
  // across the calls that change it.
  const phase = (): Phase => scene.state.phase;
  while (phase() === 'setup' && scene.state.wave < WAVES.length) {
    for (const action of script[scene.state.wave] ?? []) apply(action);
    if (untilWave !== undefined && scene.state.wave + 1 >= untilWave) break;
    const started = scene.startWave();
    if (!started.ok) throw new Error(`runScript: startWave refused: ${started.reason}`);
    for (let t = 0; phase() === 'wave' && t < MAX_TICKS_PER_WAVE; t++) scene.advance(1, false);
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
    startGame: (difficulty = DEFAULT_DIFFICULTY) =>
      new Promise<void>((resolve) => {
        if (game.scene.isActive('game')) {
          resolve();
          return;
        }
        game.scene.getScene('game').events.once('create', () => resolve());
        titleScene(game).play(difficulty);
      }),
    difficulty: () => scene().state.difficulty,
    startWave: () => scene().startWave(),
    buildAt: (col, row, type) => scene().build({ col, row }, type),
    upgradeAt: (col, row) => scene().upgrade({ col, row }),
    sellAt: (col, row) => scene().sell({ col, row }),
    setTargetingAt: (col, row, mode) => scene().setTargeting({ col, row }, mode),
    setSpeed: (speed) => scene().setSpeed(speed),
    speed: () => scene().speed,
    uiRects: () => {
      if (!game.scene.isActive('title')) scene(); // throws between scenes, as the other hooks do
      return uiRectsOf(game);
    },
    ui: (() => (game.scene.isActive('title') ? titleScene(game).uiState() : scene().uiState())) as TarpitTestApi['ui'],
    hudText: () => scene().hudStrings(),
    endScreen: () => scene().endScreenKind(),
    events: () => scene().simEvents(),
    // The archetype records its script on the running game's level (milestone 25).
    runScript: (name, untilWave) => runScript(scene(), SCRIPTS[name](scene().state.difficulty), untilWave),
  };
  window.__tarpit = api;
}

// Test mode (?test=1): time is frozen and window.__tarpit exposes hooks for
// Playwright. Outside test mode window.__tarpit holds only the Phaser game.

import type Phaser from 'phaser';
import type { GameScene } from './GameScene';
import type { TarpitTestApi } from './testGlobal';

export function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
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
    build: (spotId, type) => scene().build(spotId, type),
    upgrade: (spotId) => scene().upgrade(spotId),
    sell: (spotId) => scene().sell(spotId),
    setSpeed: (speed) => scene().setSpeed(speed),
    speed: () => scene().speed,
    uiRects: () => scene().uiRects() as ReturnType<TarpitTestApi['uiRects']>,
    ui: () => scene().uiState(),
    hudText: () => scene().hudStrings(),
  };
  window.__tarpit = api;
}

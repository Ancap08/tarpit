import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import { installGlobal } from './game/testMode';
import { TitleScene } from './game/TitleScene';

const game = new Phaser.Game({
  // CANVAS, not AUTO: the canvas renderer draws the same pixels in headless
  // Chromium on every run, which keeps screenshot baselines stable.
  type: Phaser.CANVAS,
  parent: 'game',
  width: 960,
  height: 580,
  backgroundColor: '#111418',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene],
});

installGlobal(game);

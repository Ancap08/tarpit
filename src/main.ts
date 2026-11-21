import Phaser from 'phaser';
import { TitleScene } from './game/TitleScene';

declare global {
  interface Window {
    __tarpit?: Phaser.Game;
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111418',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene],
});

window.__tarpit = game;

import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import { installPortraitCard } from './game/portrait';
import { installGlobal, isTestMode } from './game/testMode';
import { TitleScene } from './game/TitleScene';

const game = new Phaser.Game({
  // Play uses WebGL (AUTO falls back to Canvas without it). Test mode uses
  // CANVAS: it draws the same pixels in headless Chromium on every run, which
  // keeps screenshot baselines stable (docs/SCOPE-v3.md, "Determinism").
  type: isTestMode() ? Phaser.CANVAS : Phaser.AUTO,
  // Nearest-neighbour sprites: pixelArt turns antialias off, so WebGL
  // textures use NEAREST and the Canvas renderer draws them with
  // imageSmoothingEnabled false; roundPixels snaps them to whole pixels.
  pixelArt: true,
  roundPixels: true,
  parent: 'game',
  width: 960,
  height: 580,
  backgroundColor: '#111418',
  // FIT keeps the 960 x 580 canvas whole and letterboxes the rest of the
  // screen; Phaser re-fits on resize and orientation changes. All game and
  // test coordinates stay in canvas space (see canvasToPage in testMode.ts).
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene],
});

installPortraitCard();
installGlobal(game);

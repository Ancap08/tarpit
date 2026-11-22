import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import { currentLayout, installLayoutSwitch } from './game/layoutSwitch';
import { registerServiceWorker } from './sw/register';
import { installGlobal, isTestMode } from './game/testMode';
import { TitleScene } from './game/TitleScene';

// ?renderer=canvas forces the Canvas renderer in play (time and animations
// stay live). e2e/live.spec.ts uses it so its tick-rate checks do not depend
// on GPU availability: headless Chromium without a GPU renders WebGL in
// software at a few frames a second.
const forceCanvas = new URLSearchParams(window.location.search).get('renderer') === 'canvas';

const game = new Phaser.Game({
  // Play uses WebGL (AUTO falls back to Canvas without it). Test mode uses
  // CANVAS: it draws the same pixels in headless Chromium on every run, which
  // keeps screenshot baselines stable (docs/SCOPE-v3.md, "Determinism").
  type: isTestMode() || forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  // Nearest-neighbour sprites: pixelArt turns antialias off, so WebGL
  // textures use NEAREST and the Canvas renderer draws them with
  // imageSmoothingEnabled false; roundPixels snaps them to whole pixels.
  pixelArt: true,
  roundPixels: true,
  parent: 'game',
  // Milestone 32b: 960 x 580 in landscape, 480 x 1194 in portrait (layout.ts);
  // layoutSwitch.ts changes the size when the window's shape changes.
  width: currentLayout().width,
  height: currentLayout().height,
  backgroundColor: '#111418',
  // FIT keeps the canvas whole and letterboxes the rest of the
  // screen; Phaser re-fits on resize and orientation changes. All game and
  // test coordinates stay in canvas space (see canvasToPage in testMode.ts).
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene],
});

installLayoutSwitch(game);
installGlobal(game);
registerServiceWorker();

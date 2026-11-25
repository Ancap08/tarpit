import Phaser from 'phaser';
import { loadFonts } from './game/fonts';
import { GameScene } from './game/GameScene';
import { currentLayout, installLayoutSwitch, refit } from './game/layoutSwitch';
import { installPageLock } from './game/pageLock';
import { registerServiceWorker } from './sw/register';
import { installGlobal, isTestMode } from './game/testMode';
import { TitleScene } from './game/TitleScene';
import { sound } from './game/audio/engine';
import { useUiCanvasRenderer } from './game/ui/devicePixels';
import { actThreeEnabled, keepSelection } from './game/keep/switch';

// ?renderer=canvas forces the Canvas renderer in play (time and animations
// stay live). e2e/live.spec.ts uses it so its tick-rate checks do not depend
// on GPU availability: headless Chromium without a GPU renders WebGL in
// software at a few frames a second.
const query = new URLSearchParams(window.location.search);
const forceCanvas = query.get('renderer') === 'canvas';
const keep = !!keepSelection(window.location.search) || actThreeEnabled(window.location.search);

useUiCanvasRenderer((game, canvas) => new Phaser.Renderer.Canvas.CanvasRenderer({
  canvas,
  config: { ...game.config, context: null, transparent: true },
  events: new Phaser.Events.EventEmitter(),
  textures: new Phaser.Events.EventEmitter(),
} as unknown as Phaser.Game));

void loadFonts().then(startGame);

function startGame(): void {
  document.getElementById('loading')?.remove();
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
    transparent: keep,
    backgroundColor: keep ? 'rgba(0,0,0,0)' : '#111418',
    // FIT keeps the canvas whole and letterboxes the rest of the
    // screen; Phaser re-fits on resize and orientation changes. All game and
    // test coordinates stay in canvas space (see canvasToPage in testMode.ts).
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [TitleScene, GameScene],
    // Milestone 33: sounds are made by src/game/audio, which creates its own
    // AudioContext on the first gesture; Phaser's sound manager is off so it
    // makes none at boot.
    audio: { noAudio: true },
  });

  installLayoutSwitch(game);
  // Milestone 35: no zoom, scroll or drift; put the page back and re-centre if the browser does it anyway.
  installPageLock(refit);
  installGlobal(game);
  // Milestone 33: gesture, visibility and M key listeners; silent in test mode.
  sound.install({ enabled: !isTestMode() });
  registerServiceWorker();
}

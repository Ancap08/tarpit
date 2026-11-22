// Layout switching (milestone 32b; it replaces the milestone 14 "turn your
// device" card). A window taller than it is wide gets the portrait layout,
// any other the landscape one (layout.ts layoutFor). When a resize or a turn
// of the device changes which applies, the canvas takes the new layout's
// size and every running scene rebuilds itself for it (relayout()): the
// title keeps its picks, and a game keeps its simulation state (GameScene
// relayout()). Narrow, tall desktop windows count as portrait too.

import type Phaser from 'phaser';
import { LANDSCAPE, layoutFor, type Layout } from './layout';

let current: Layout | null = null;

/** The layout for the window now (landscape outside a browser, as in unit tests). */
export function currentLayout(): Layout {
  current ??= typeof window === 'undefined' ? LANDSCAPE : layoutFor(window.innerWidth, window.innerHeight);
  return current;
}

/** A scene that can rebuild itself for a new layout. */
interface Relayable {
  relayout?: () => void;
}

/** Watch the window and switch layouts when its shape changes. */
export function installLayoutSwitch(game: Phaser.Game): void {
  const update = () => {
    const next = layoutFor(window.innerWidth, window.innerHeight);
    if (next === currentLayout()) return;
    current = next;
    game.scale.setGameSize(next.width, next.height);
    for (const scene of game.scene.getScenes(true)) (scene as Relayable).relayout?.();
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.matchMedia('(orientation: portrait)').addEventListener('change', update);
}

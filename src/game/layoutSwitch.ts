// Layout switching (milestone 32b; it replaces the milestone 14 "turn your
// device" card). A window taller than it is wide gets the portrait layout,
// any other the landscape one (layout.ts layoutFor). When a resize or a turn
// of the device changes which applies, the canvas takes the new layout's
// size and every running scene rebuilds itself for it (relayout()): the
// title keeps its picks, and a game keeps its simulation state (GameScene
// relayout()). Narrow, tall desktop windows count as portrait too.
// Milestone 35: the shape is the usable area (pageLock.ts viewportSize: the
// visual viewport at scale 1, never a pinch-zoomed view), and refit() lets
// the page lock re-centre the canvas through the same path.

import type Phaser from 'phaser';
import { LANDSCAPE, layoutFor, type Layout } from './layout';
import { viewportSize } from './pageLock';

let current: Layout | null = null;

/** The layout for the window now (landscape outside a browser, as in unit tests). */
export function currentLayout(): Layout {
  if (current === null) {
    if (typeof window === 'undefined') current = LANDSCAPE;
    else {
      const s = viewportSize();
      current = layoutFor(s.width, s.height);
    }
  }
  return current;
}

/** A scene that can rebuild itself for a new layout. */
interface Relayable {
  relayout?: () => void;
}

let refitGame: (() => void) | null = null;

/** Switch layout if the shape changed (a no-op otherwise), then re-fit and re-centre the canvas in its box. */
export function refit(): void {
  refitGame?.();
}

/** Watch the window and switch layouts when its shape changes. */
export function installLayoutSwitch(game: Phaser.Game): void {
  const update = () => {
    const s = viewportSize();
    const next = layoutFor(s.width, s.height);
    if (next === currentLayout()) return;
    current = next;
    game.scale.setGameSize(next.width, next.height);
    for (const scene of game.scene.getScenes(true)) (scene as Relayable).relayout?.();
  };
  refitGame = () => {
    update();
    game.scale.getParentBounds();
    game.scale.refresh();
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.matchMedia('(orientation: portrait)').addEventListener('change', update);
}

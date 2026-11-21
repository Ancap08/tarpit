// Tower panel: opens beside a selected tower with "Upgrade  40", "Sell  +35"
// and "Target: First". Upgrade reads "Upgraded" and is greyed once used, and
// is greyed when unaffordable. Sell shows the refund, floor(spent * 7 / 10).
// The targeting button (milestone 24) shows the tower's mode and cycles it
// first -> last -> strongest -> first; its label is 13 px and centred so
// "Target: Strongest" (17 Courier characters, about 133 px) fits the 156 px
// button with about 11 px to spare a side (14 px left about 6).
// A 42 x 42 close button ("×") sits in the top-right corner (milestone 14),
// for touch players with no Escape key.

import type Phaser from 'phaser';
import { cellCenter, sellRefund, TARGETING_MODES, TOWER_DEFS, towerAt, type Cell, type GameState, type TargetingMode } from '../../sim';
import { placeBeside, type Rect } from '../input';
import { targetingButtonText } from '../names';
import { ButtonStack } from './button';

export interface TowerPanelHandlers {
  onUpgrade: () => void;
  onSell: () => void;
  /** The targeting button was clicked; `next` is the mode after the tower's current one. */
  onTarget: (next: TargetingMode) => void;
  onClose: () => void;
}

export class TowerPanel {
  private readonly stack: ButtonStack;
  private at: Cell | null = null;
  private mode: TargetingMode = 'first';

  constructor(scene: Phaser.Scene, handlers: TowerPanelHandlers) {
    this.stack = new ButtonStack(scene, [
      { text: 'Upgrade', right: '', onClick: handlers.onUpgrade },
      { text: 'Sell', right: '', onClick: handlers.onSell },
      { text: targetingButtonText('first'), fontSize: '13px', onClick: () => handlers.onTarget(nextMode(this.mode)) },
    ], handlers.onClose);
  }

  /** The cell of the selected tower, or null when closed. */
  get cell(): Cell | null {
    return this.at;
  }

  get rect(): Rect | null {
    return this.stack.rect;
  }

  open(cell: Cell, state: GameState): void {
    this.at = cell;
    const { x, y } = placeBeside(cellCenter(cell), this.stack.width, this.stack.height);
    this.update(state);
    this.stack.show(x, y);
  }

  close(): void {
    this.at = null;
    this.stack.hide();
  }

  /** Refresh labels and affordability. Call on every redraw. */
  update(state: GameState): void {
    if (this.at === null) return;
    const tower = towerAt(state, this.at);
    if (!tower) return;
    const [upgrade, sell, target] = this.stack.buttons;
    if (tower.upgraded) {
      upgrade.set('Upgraded', false, '');
    } else {
      const cost = TOWER_DEFS[tower.type].upgradeCost;
      upgrade.set('Upgrade', state.gold >= cost, String(cost));
    }
    sell.set('Sell', true, `+${sellRefund(tower.spent)}`);
    this.mode = tower.targeting;
    target.set(targetingButtonText(tower.targeting), true);
  }

  /** Button rectangles keyed `panel:upgrade`, `panel:sell`, `panel:target` and `panel:close`, only while open. */
  rects(): Record<string, Rect> {
    if (!this.stack.isOpen) return {};
    const [upgrade, sell, target] = this.stack.buttons;
    const close = this.stack.close as NonNullable<ButtonStack['close']>;
    return { 'panel:upgrade': upgrade.rect, 'panel:sell': sell.rect, 'panel:target': target.rect, 'panel:close': close.rect };
  }

  /** The targeting button's label, while open (for tests), else null. */
  get targetText(): string | null {
    return this.stack.isOpen ? this.stack.buttons[2].text : null;
  }
}

/** The mode after `mode` in the cycle first -> last -> strongest -> first. */
export function nextMode(mode: TargetingMode): TargetingMode {
  return TARGETING_MODES[(TARGETING_MODES.indexOf(mode) + 1) % TARGETING_MODES.length];
}

// Tower panel: opens beside a selected tower with "Upgrade  40" and
// "Sell  +35". Upgrade reads "Upgraded" and is greyed once used, and is
// greyed when unaffordable. Sell shows the refund, floor(spent * 7 / 10).

import type Phaser from 'phaser';
import { MAP, sellRefund, TOWER_DEFS, towerAt, type GameState } from '../../sim';
import { placeBeside, type Rect } from '../input';
import { ButtonStack } from './button';

export interface TowerPanelHandlers {
  onUpgrade: () => void;
  onSell: () => void;
}

export class TowerPanel {
  private readonly stack: ButtonStack;
  private spot: number | null = null;

  constructor(scene: Phaser.Scene, handlers: TowerPanelHandlers) {
    this.stack = new ButtonStack(scene, [
      { text: 'Upgrade', right: '', onClick: handlers.onUpgrade },
      { text: 'Sell', right: '', onClick: handlers.onSell },
    ]);
  }

  /** The spot of the selected tower, or null when closed. */
  get spotId(): number | null {
    return this.spot;
  }

  get rect(): Rect | null {
    return this.stack.rect;
  }

  open(spotId: number, state: GameState): void {
    this.spot = spotId;
    const { x, y } = placeBeside(MAP.buildSpots[spotId], this.stack.width, this.stack.height);
    this.update(state);
    this.stack.show(x, y);
  }

  close(): void {
    this.spot = null;
    this.stack.hide();
  }

  /** Refresh labels and affordability. Call on every redraw. */
  update(state: GameState): void {
    if (this.spot === null) return;
    const tower = towerAt(state, this.spot);
    if (!tower) return;
    const [upgrade, sell] = this.stack.buttons;
    if (tower.upgraded) {
      upgrade.set('Upgraded', false, '');
    } else {
      const cost = TOWER_DEFS[tower.type].upgradeCost;
      upgrade.set('Upgrade', state.gold >= cost, String(cost));
    }
    sell.set('Sell', true, `+${sellRefund(tower.spent)}`);
  }

  /** Button rectangles keyed `panel:upgrade` and `panel:sell`, only while open. */
  rects(): Record<string, Rect> {
    if (!this.stack.isOpen) return {};
    const [upgrade, sell] = this.stack.buttons;
    return { 'panel:upgrade': upgrade.rect, 'panel:sell': sell.rect };
  }
}

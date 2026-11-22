// Tower panel: opens beside a selected tower with "Upgrade  40", "Sell  +35"
// and "Target: First". Upgrade reads "Upgraded" and is greyed once used, and
// is greyed when unaffordable. Sell shows the refund, towerSellValue: 70% of
// spent rounded down, plus in full any upgrade bought this setup phase.
// The targeting button (milestone 24) shows the tower's mode and cycles it
// first -> last -> strongest -> first; its label is 13 px and centred so
// "Target: Strongest" (17 Courier characters, about 133 px) fits the 156 px
// button with about 11 px to spare a side (14 px left about 6).
// A 42 x 42 close button ("×") sits in the top-right corner (milestone 14),
// for touch players with no Escape key.
// Planning phase (milestone 25a): an unlocked tower's Sell reads
// "Remove  +<spent>" (a full refund), and while its upgrade was bought this
// setup phase the Upgrade slot reads "Undo upgrade  +<cost>" in 14 px (16 px
// would not fit the 156 px button) and undoes it. Words from names.ts.
// Milestone 25c: a small 13 px line above the buttons shows the tower's kill
// count ("Kills 43"); the panel grows by KILLS_LINE_H.

import type Phaser from 'phaser';
import { TARGETING_MODES, TOWER_DEFS, towerAt, towerSellValue, type Cell, type GameState, type TargetingMode } from '../../sim';
import { KILLS_LINE_H, placeBeside, type Rect } from '../input';
import type { Layout } from '../layout';
import { killsLabel, PANEL_TEXT, targetingButtonText } from '../names';
import { FONT, TEXT } from '../palette';
import { ButtonStack } from './button';

export interface TowerPanelHandlers {
  onUpgrade: () => void;
  /** The Upgrade slot was clicked while it read "Undo upgrade" (milestone 25a). */
  onUndoUpgrade: () => void;
  /** Sell, or Remove for an unlocked tower: the sim decides the refund. */
  onSell: () => void;
  /** The targeting button was clicked; `next` is the mode after the tower's current one. */
  onTarget: (next: TargetingMode) => void;
  onClose: () => void;
}

export class TowerPanel {
  private readonly stack: ButtonStack;
  private readonly killsText: Phaser.GameObjects.Text;
  private at: Cell | null = null;
  private mode: TargetingMode = 'first';
  /** The Upgrade slot shows "Undo upgrade" (milestone 25a). */
  private undo = false;

  /** `layout` (milestone 32b) places the panel beside the tower inside the map's box on the screen. */
  constructor(
    scene: Phaser.Scene,
    private readonly layout: Layout,
    handlers: TowerPanelHandlers,
  ) {
    this.stack = new ButtonStack(scene, [
      { text: PANEL_TEXT.upgrade, right: '', onClick: () => (this.undo ? handlers.onUndoUpgrade() : handlers.onUpgrade()) },
      { text: PANEL_TEXT.sell, right: '', onClick: handlers.onSell },
      { text: targetingButtonText('first'), fontSize: '13px', onClick: () => handlers.onTarget(nextMode(this.mode)) },
    ], handlers.onClose, KILLS_LINE_H);
    this.killsText = scene.add
      .text(0, 0, killsLabel(0), { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: TEXT.hudDim })
      .setOrigin(0, 0.5)
      .setVisible(false);
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
    const { x, y } = placeBeside(this.layout.cellCenter(cell), this.stack.width, this.stack.height, state.map, this.layout);
    this.update(state);
    this.stack.show(x, y);
    this.killsText.setPosition(x + this.stack.pad, y + this.stack.pad + KILLS_LINE_H / 2 - 2).setVisible(true);
  }

  close(): void {
    this.at = null;
    this.stack.hide();
    this.killsText.setVisible(false);
  }

  /** Refresh labels and affordability. Call on every redraw. */
  update(state: GameState): void {
    if (this.at === null) return;
    const tower = towerAt(state, this.at);
    if (!tower) return;
    const [upgrade, sell, target] = this.stack.buttons;
    const cost = TOWER_DEFS[tower.type].upgradeCost;
    this.undo = state.phase === 'setup' && tower.upgraded && tower.upgradedThisPhase;
    upgrade.setFontSize(this.undo ? '14px' : '16px');
    if (this.undo) {
      upgrade.set(PANEL_TEXT.undoUpgrade, true, `+${cost}`);
    } else if (tower.upgraded) {
      upgrade.set(PANEL_TEXT.upgraded, false, '');
    } else {
      upgrade.set(PANEL_TEXT.upgrade, state.gold >= cost, String(cost));
    }
    sell.set(tower.locked ? PANEL_TEXT.sell : PANEL_TEXT.remove, true, `+${towerSellValue(tower)}`);
    this.mode = tower.targeting;
    target.set(targetingButtonText(tower.targeting), true);
    const kills = killsLabel(tower.kills ?? 0);
    if (this.killsText.text !== kills) this.killsText.setText(kills);
  }

  /** Button rectangles keyed `panel:upgrade`, `panel:sell`, `panel:target` and `panel:close`, only while open. */
  rects(): Record<string, Rect> {
    if (!this.stack.isOpen) return {};
    const [upgrade, sell, target] = this.stack.buttons;
    const close = this.stack.close as NonNullable<ButtonStack['close']>;
    return { 'panel:upgrade': upgrade.rect, 'panel:sell': sell.rect, 'panel:target': target.rect, 'panel:close': close.rect };
  }

  /** The Upgrade and Sell slots' labels ("Remove  +50"), while open (for tests), else null. */
  get upgradeText(): string | null {
    return this.stack.isOpen ? this.stack.buttons[0].text : null;
  }

  get sellText(): string | null {
    return this.stack.isOpen ? this.stack.buttons[1].text : null;
  }

  /** The kill count line ("Kills 43"), while open (for tests), else null (milestone 25c). */
  get killsLine(): string | null {
    return this.stack.isOpen ? this.killsText.text : null;
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

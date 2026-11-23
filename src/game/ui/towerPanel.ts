import type Phaser from 'phaser';
import {
  TARGETING_MODES,
  TOWER_DEFS,
  maxTowerLevel,
  towerAt,
  towerLevel,
  towerSellValue,
  towerUndoValue,
  type Cell,
  type GameState,
  type TargetingMode,
  type UpgradePath,
} from '../../sim';
import { placeBeside, type Rect } from '../input';
import { fontPx, type Layout } from '../layout';
import { killsLabel, PANEL_TEXT, targetingButtonText, towerPanelTitle } from '../names';
import { FONT, TEXT } from '../palette';
import { ink, panel, THEME } from './theme';
import { Button } from './button';
import { STACK_GAP, STACK_PAD } from './geometry';
import { getPathChoices, towerPanelSize, UPGRADE_PATHS, type PathChoice } from './towerPanelModel';

export interface TowerPanelHandlers {
  onUpgrade: (path?: UpgradePath) => void;
  onUndoUpgrade: () => void;
  onSell: () => void;
  onTarget: (next: TargetingMode) => void;
  onClose: () => void;
}

interface Row {
  key: string;
  button: Button;
  path?: PathChoice;
}

export class TowerPanel {
  private readonly backing: Phaser.GameObjects.Graphics;
  private readonly upgrade: Button;
  private readonly undo: Button;
  private readonly sell: Button;
  private readonly target: Button;
  private readonly closeButton: Button;
  private readonly pathButtons: Record<UpgradePath, Button>;
  private readonly allButtons: Button[];
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly pathText: Record<UpgradePath, { description: Phaser.GameObjects.Text; reason: Phaser.GameObjects.Text }>;
  private at: Cell | null = null;
  private mode: TargetingMode = 'first';
  private activeRows: Row[] = [];
  private placed: Rect | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: Layout,
    handlers: TowerPanelHandlers,
  ) {
    const f = (px: number) => fontPx(layout, layout.kind === 'portrait' ? Math.max(20, px) : px);
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    const portrait = layout.kind === 'portrait';
    this.backing = scene.add.graphics().setVisible(false);
    this.upgrade = new Button(scene, rect, PANEL_TEXT.upgrade, () => handlers.onUpgrade(), { fontSize: f(16), right: '' });
    this.undo = new Button(scene, rect, PANEL_TEXT.undoUpgrade, handlers.onUndoUpgrade, { fontSize: f(14), right: '' });
    this.sell = new Button(scene, rect, PANEL_TEXT.sell, handlers.onSell, { fontSize: f(16), right: '' });
    this.target = new Button(scene, rect, targetingButtonText('first'), () => handlers.onTarget(nextMode(this.mode)), { fontSize: f(13) });
    this.closeButton = new Button(scene, rect, '×', handlers.onClose, { fontSize: portrait ? '30px' : '24px' });
    const pathButton = (path: UpgradePath) => new Button(scene, rect, '', () => handlers.onUpgrade(path), {
      right: '',
      fontSize: portrait ? '22px' : '17px',
      labelY: portrait ? 20 : 14,
      sound: null,
    });
    this.pathButtons = { A: pathButton('A'), B: pathButton('B') };
    this.allButtons = [this.upgrade, this.undo, this.sell, this.target, this.closeButton, this.pathButtons.A, this.pathButtons.B];
    for (const button of this.allButtons) button.setShown(false);

    const caption = (size: string, color: string, fontStyle = 'normal') => scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: size, color, fontStyle,
    }).setOrigin(0, 0.5).setVisible(false);
    this.titleText = caption(portrait ? '22px' : '17px', ink, 'bold');
    this.killsText = caption(f(14), ink, 'bold');
    const pathCaption = () => ({
      description: caption(portrait ? '20px' : '15px', TEXT.button),
      reason: caption(portrait ? '20px' : '14px', TEXT.buttonDisabled),
    });
    this.pathText = { A: pathCaption(), B: pathCaption() };
  }

  get cell(): Cell | null {
    return this.at;
  }

  get rect(): Rect | null {
    return this.placed;
  }

  open(cell: Cell, state: GameState): void {
    this.at = cell;
    this.placed = null;
    this.update(state);
  }

  close(): void {
    this.at = null;
    this.placed = null;
    this.activeRows = [];
    this.backing.setVisible(false);
    for (const button of this.allButtons) button.setShown(false);
    this.titleText.setVisible(false);
    this.killsText.setVisible(false);
    for (const { description, reason } of Object.values(this.pathText)) {
      description.setVisible(false);
      reason.setVisible(false);
    }
  }

  /** Refresh affordability, and refit the panel when its rows or display scale change. */
  update(state: GameState): void {
    if (this.at === null) return;
    const tower = towerAt(state, this.at);
    if (!tower) return;
    const level = towerLevel(tower);
    const undo = state.phase === 'setup' ? towerUndoValue(tower) : 0;
    const rows: Row[] = [];
    if (level === 1 && level < maxTowerLevel(state)) {
      const cost = TOWER_DEFS[tower.type].upgradeCost;
      this.upgrade.set(PANEL_TEXT.upgrade, state.gold >= cost, String(cost));
      rows.push({ key: 'upgrade', button: this.upgrade });
    }
    const paths = getPathChoices(tower, state);
    for (const path of paths) {
      const button = this.pathButtons[path.path];
      button.set(path.name, path.disabledReason === null, String(path.price));
      rows.push({ key: `path:${path.path}`, button, path });
    }
    if (undo > 0) {
      this.undo.set(PANEL_TEXT.undoUpgrade, true, `+${undo}`);
      rows.push({ key: 'undo', button: this.undo });
    }
    this.sell.set(tower.locked ? PANEL_TEXT.sell : PANEL_TEXT.remove, true, `+${towerSellValue(tower)}`);
    this.mode = tower.targeting;
    this.target.set(targetingButtonText(tower.targeting), true);
    rows.push({ key: 'sell', button: this.sell }, { key: 'target', button: this.target });
    this.activeRows = rows;

    const portrait = this.layout.kind === 'portrait';
    const scale = portrait || this.scene.sys.game.device.input.touch
      ? Math.max(this.scene.scale.displayScale.x, this.scene.scale.displayScale.y)
      : 0;
    const { close, rowHeight, pathHeight, header, width, height, buttonWidth } =
      towerPanelSize(this.layout, level, rows.length, paths.length, scale);
    if (this.placed?.width !== width || this.placed.height !== height) {
      const location = placeBeside(this.layout.cellCenter(this.at), width, height, state.map, this.layout);
      this.placed = { ...location, width, height };
      panel(this.backing.clear().setVisible(true), this.placed, THEME.paper);
    }
    const { x, y } = this.placed;
    const left = x + STACK_PAD;
    this.closeButton.setSize(close, close);
    this.closeButton.moveTo(x + width - STACK_PAD - close, y + STACK_PAD);
    this.closeButton.setShown(true);

    const title = towerPanelTitle(tower.type, level, tower.path);
    if (this.titleText.text !== title) this.titleText.setText(title);
    this.titleText.setPosition(left, y + STACK_PAD + (portrait ? 13 : 9)).setVisible(level > 1);
    const kills = killsLabel(tower.kills ?? 0, !!state.level && level >= maxTowerLevel(state));
    if (this.killsText.text !== kills) this.killsText.setText(kills);
    this.killsText.setPosition(left, y + STACK_PAD + (level > 1 ? (portrait ? 39 : 29) : header / 2 - 2)).setVisible(true);

    let top = y + STACK_PAD + header;
    for (const { key, button, path } of rows) {
      const h = path ? pathHeight : rowHeight;
      const split = level > 1 ? Math.round(buttonWidth * 0.43) : 0;
      const isSell = split > 0 && key === 'sell';
      const isTarget = split > 0 && key === 'target';
      button.setSize(isSell ? split : isTarget ? buttonWidth - split - STACK_GAP : buttonWidth, h);
      button.moveTo(isTarget ? left + split + STACK_GAP : left, top);
      if (path) {
        const { description, reason } = this.pathText[path.path];
        const hint = path.disabledReason ?? '';
        if (description.text !== path.description) description.setText(path.description);
        if (reason.text !== hint) reason.setText(hint);
        description.setPosition(left + 10, top + (portrait ? 46 : 35));
        reason.setPosition(left + 10, top + (portrait ? 73 : 54));
      }
      if (!isSell) top += h + STACK_GAP;
    }
    for (const b of this.allButtons) b.setShown(b === this.closeButton || rows.some((row) => row.button === b));
    for (const path of UPGRADE_PATHS) {
      const choice = rows.find((row) => row.path?.path === path)?.path;
      const { description, reason } = this.pathText[path];
      description.setVisible(choice !== undefined);
      reason.setVisible(choice !== undefined && choice.disabledReason !== null);
    }
  }

  rects(): Record<string, Rect> {
    if (!this.placed) return {};
    return Object.fromEntries([
      ['panel:close', this.closeButton.rect],
      ...this.activeRows.map(({ key, button }) => [`panel:${key}`, button.rect]),
    ]);
  }

  get upgradeText(): string | null {
    return this.activeRows.find(({ key }) => key === 'upgrade' || key === 'undo')?.button.text ?? null;
  }

  get choices(): PathChoice[] {
    return this.activeRows.flatMap(({ path }) => path ? [path] : []);
  }

  get title(): string | null {
    return this.placed && this.titleText.visible ? this.titleText.text : null;
  }

  get sellText(): string | null {
    return this.placed ? this.sell.text : null;
  }

  get killsLine(): string | null {
    return this.placed ? this.killsText.text : null;
  }

  get targetText(): string | null {
    return this.placed ? this.target.text : null;
  }
}

/** The mode after `mode` in the cycle first -> last -> strongest -> first. */
export function nextMode(mode: TargetingMode): TargetingMode {
  return TARGETING_MODES[(TARGETING_MODES.indexOf(mode) + 1) % TARGETING_MODES.length];
}

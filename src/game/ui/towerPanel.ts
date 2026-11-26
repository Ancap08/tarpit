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
import { killsLabel, PANEL_TEXT, PATH_NAMES, TOWER_NAMES, targetingButtonText, towerPanelTitle } from '../names';
import { FONT, TEXT } from '../palette';
import { CLEAN, battleFont, battleWeight, interLoaded, motionClock, rounded, skinFor, textMetrics } from './newTheme';
import { uiObject } from './devicePixels';
import { drawTowerShape } from '../draw/towers';
import type { PaintedSkin } from '../skin/painted';
import { ink, THEME } from './theme';
import { Button } from './button';
import { STACK_GAP, STACK_PAD } from './geometry';
import { DeviceTextFit, minimumTextSize, textInset, textSlot } from './deviceText';
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
  private readonly backing: Phaser.GameObjects.Rectangle;
  private readonly upgrade: Button;
  private readonly undo: Button;
  private readonly sell: Button;
  private readonly target: Button;
  private readonly closeButton: Button;
  private readonly pathTitleY: number;
  private readonly pathButtons: Record<UpgradePath, Button>;
  private readonly allButtons: Button[];
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly pathText: Record<UpgradePath, { description: Phaser.GameObjects.Text; reason: Phaser.GameObjects.Text }>;
  private at: Cell | null = null;
  private mode: TargetingMode = 'first';
  private activeRows: Row[] = [];
  private placed: Rect | null = null;
  private readonly clean: boolean;
  private readonly paper?: Phaser.GameObjects.Graphics;
  private readonly illustration?: Phaser.GameObjects.Graphics;
  private readonly portraits?: Map<string, Phaser.GameObjects.Image>;
  private portrait?: Phaser.GameObjects.Image;
  private readonly pathHeading?: Phaser.GameObjects.Text;
  private readonly clock?: () => number;
  private openedAt = -Infinity;
  private paintKey = '';
  private currentTitle: string | null = null;
  private readonly titleFit = new DeviceTextFit();
  private readonly metaFit = new DeviceTextFit();
  private readonly headingFit = new DeviceTextFit();
  private readonly pathFit = new DeviceTextFit();
  private readonly descriptionFit = new DeviceTextFit();
  private readonly reasonFit = new DeviceTextFit();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: Layout,
    handlers: TowerPanelHandlers,
    private readonly painted?: PaintedSkin,
  ) {
    this.clean = skinFor(scene) === 'battle';
    this.clock = motionClock(scene);
    const f = (px: number) => fontPx(layout, layout.kind === 'portrait' ? Math.max(this.clean ? 24 : 20, px) : px);
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    const portrait = layout.kind === 'portrait';
    this.backing = scene.add.rectangle(0, 0, 1, 1, THEME.paper)
      .setOrigin(0).setStrokeStyle(2, THEME.brass).setVisible(false);
    if (this.clean) {
      this.paper = scene.add.graphics().setName('clean-tower-panel').setVisible(false);
      this.illustration = scene.add.graphics().setVisible(false);
      if (painted) this.portraits = new Map();
    }
    this.upgrade = new Button(scene, rect, PANEL_TEXT.upgrade, () => handlers.onUpgrade(), { fontSize: f(16), right: '', primary: this.clean });
    this.undo = new Button(scene, rect, PANEL_TEXT.undoUpgrade, handlers.onUndoUpgrade, { fontSize: f(14), right: '' });
    this.sell = new Button(scene, rect, PANEL_TEXT.sell, handlers.onSell, {
      fontSize: f(16), right: '', labelInset: 6, priceFallback: this.clean ? 'remove' : undefined,
    });
    this.target = new Button(scene, rect, targetingButtonText('first'), () => handlers.onTarget(nextMode(this.mode)), {
      fontSize: f(this.clean ? 14 : 13), icon: this.clean ? 'target' : undefined,
      wrap: this.clean && interLoaded && portrait,
    });
    this.closeButton = new Button(scene, rect, this.clean ? '' : '×', handlers.onClose, {
      fontSize: portrait ? '30px' : '24px', icon: this.clean ? 'close' : undefined,
    });
    this.pathTitleY = this.clean ? (portrait ? 23 : 20) : portrait ? 20 : 15;
    const pathButton = (path: UpgradePath) => new Button(scene, rect, '', () => handlers.onUpgrade(path), {
      right: '',
      fontSize: portrait ? (this.clean ? '26px' : '22px') : '17px',
      icon: this.clean ? path === 'A' ? 'target' : 'volley' : undefined,
      upgradeRow: this.clean,
      grouped: this.clean, semibold: true,
      labelInset: this.clean ? (portrait ? 72 : 58) : undefined,
      labelY: this.pathTitleY,
      sound: null,
    });
    this.pathButtons = { A: pathButton('A'), B: pathButton('B') };
    this.allButtons = [this.upgrade, this.undo, this.sell, this.target, this.closeButton, this.pathButtons.A, this.pathButtons.B];
    for (const button of this.allButtons) button.setShown(false);

    const caption = (size: string, color: string, bold = false, semibold = bold) => scene.add.text(0, 0, '', {
      fontFamily: this.clean ? battleFont() : FONT, fontSize: size, color, fontStyle: this.clean ? battleWeight(semibold, bold ? 'bold' : 'normal') : bold ? 'bold' : 'normal',
      ...(this.clean ? { metrics: textMetrics(parseFloat(size)) } : {}),
    }).setOrigin(0, 0.5).setVisible(false);
    this.titleText = caption(portrait ? (this.clean ? '29px' : '22px') : this.clean ? '23px' : '17px',
      this.clean ? CLEAN.ink : ink, true);
    if (this.clean) this.pathHeading = caption(f(14), CLEAN.subdued, true, false).setText(PANEL_TEXT.chooseUpgrade);
    this.killsText = caption(f(14), this.clean ? CLEAN.subdued : ink, true, false);
    const pathCaption = () => ({
      description: caption(portrait ? (this.clean ? '23px' : '20px') : '15px', this.clean ? CLEAN.subdued : TEXT.button).setOrigin(0).setWordWrapCallback((line, label) =>
        label.basicWordWrap(line.replace('. ', '.\n'), label.context, label.style.wordWrapWidth ?? Infinity)),
      reason: caption(portrait ? (this.clean ? '23px' : '20px') : '14px', this.clean ? CLEAN.gold : TEXT.buttonDisabled).setOrigin(0),
    });
    this.pathText = { A: pathCaption(), B: pathCaption() };
  }

  get arrival(): number {
    return this.clock ? Math.min(1, (this.clock() - this.openedAt) / 210) : 1;
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
    this.openedAt = this.clock?.() ?? -Infinity;
    this.update(state);
  }

  close(): void {
    this.at = null;
    this.placed = null;
    this.activeRows = [];
    this.currentTitle = null;
    this.backing.setVisible(false);
    this.paper?.setVisible(false);
    this.illustration?.setVisible(false);
    this.portrait?.setVisible(false);
    this.pathHeading?.setVisible(false);
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
    const sell = { key: 'sell', button: this.sell }, target = { key: 'target', button: this.target };
    if (this.clean) rows.push(target, sell);
    else rows.push(sell, target);
    this.activeRows = rows;

    const portrait = this.layout.kind === 'portrait';
    const scale = portrait || this.scene.sys.game.device.input.touch
      ? Math.max(this.scene.scale.displayScale.x, this.scene.scale.displayScale.y)
      : 0;
    const legacy = towerPanelSize(this.layout, level, rows.length, paths.length, scale);
    const pad = this.clean ? (portrait ? 14 : 12) : STACK_PAD;
    const rowGap = this.clean ? (portrait ? 10 : 7) : STACK_GAP;
    const map = this.layout.map;
    const centre = this.layout.cellCenter(this.at);
    const edge = centre.x < map.x + 38 ? -1 : centre.x > map.x + map.width - 38 ? 1 : 0;
    const atCap = !!state.level && level >= maxTowerLevel(state);
    const separateCap = this.clean && interLoaded && atCap;
    // A tall upgrade choice drawer may sit beside the selected edge tower.
    const edgeWidth = interLoaded ? (paths.length ? 438 : 456) : 418;
    const width = this.clean ? (portrait ? (edge ? edgeWidth : 456) : 382) : legacy.width;
    const close = this.clean ? Math.max(45, legacy.close) : legacy.close;
    const rowHeight = this.clean ? Math.max(45, legacy.rowHeight) : legacy.rowHeight;
    const pathHeight = this.clean ? Math.max(rowHeight, portrait ? 104 : 80) : legacy.pathHeight;
    const metaSize = portrait ? 24 : 14;
    const capLine = separateCap ? textMetrics(Math.max(metaSize, minimumTextSize(this.killsText))).fontSize : 0;
    const titleAreaHeight = portrait ? 104 : 79 + (separateCap ? 6 : 0);
    const header = this.clean ? titleAreaHeight + (paths.length ? 34 : 0) : legacy.header;
    const buttonWidth = this.clean ? width - 2 * pad : legacy.buttonWidth;
    const rowCount = this.clean ? rows.length - 1 : rows.length - (level > 1 ? 1 : 0);
    const baseHeight = this.clean ? 2 * pad + header + (rowCount - 1) * rowGap
      + (rowCount - paths.length) * rowHeight + paths.length * pathHeight : legacy.height;
    // Both headings use the same type. Measure it before placing the wrapped captions.
    const captionGap = (this.clean ? 2.25 : 2) * this.scene.scale.displayScale.y;
    const titleHeight = this.clean ? (portrait ? 29 : 20) : this.pathButtons.A.labelObjects[0].height;
    const descriptionTop = Math.ceil(this.pathTitleY + titleHeight / 2 + captionGap);
    const extraHeight = { A: 0, B: 0 };
    const wrap = buttonWidth - (this.clean ? (portrait ? 83 : 69) : 20);
    const captionSize = portrait ? 23 : 15;
    const reasonSize = portrait ? 23 : 14;
    for (const choice of paths) {
      const { description, reason } = this.pathText[choice.path];
      if (!this.clean && description.style.wordWrapWidth !== wrap) description.setWordWrapWidth(wrap);
      if (description.text !== choice.description) description.setText(choice.description);
      if (this.clean && reason.text !== (choice.disabledReason ?? '')) reason.setText(choice.disabledReason ?? '');
    }
    const showDescriptions = !this.clean || this.descriptionFit.fit(captionSize, paths.map(({ path }) =>
      ({ label: this.pathText[path].description, width: wrap, height: 3 * (captionSize + 4), wrap: true })));
    const showReasons = !this.clean || this.reasonFit.fit(reasonSize, paths.map(({ path }) =>
      ({ label: this.pathText[path].reason, width: wrap, height: 2 * (reasonSize + 4), wrap: true })));
    for (const choice of paths) {
      const { description, reason } = this.pathText[choice.path];
      const reasonHeight = this.clean ? showReasons && choice.disabledReason ? reason.height + captionGap : 0
        : reason.getTextMetrics().fontSize + captionGap;
      const contentHeight = descriptionTop + (showDescriptions ? description.height : 0) + reasonHeight + captionGap;
      extraHeight[choice.path] = Math.max(0, Math.ceil(contentHeight) - pathHeight);
    }
    const height = baseHeight + extraHeight.A + extraHeight.B;
    if (this.placed?.width !== width || this.placed.height !== height) {
      const m = this.layout.map;
      const bottom = m.y + m.height - height - 8;
      const location = this.clean && portrait
        ? {
          x: edge === 1 ? m.x + 9 : edge === -1 ? m.x + m.width - width - 9 : m.x + (m.width - width) / 2,
          y: centre.y + 20 < bottom ? bottom : Math.max(m.y + 8, centre.y - height - 26),
        }
        : placeBeside(centre, width, height, state.map, this.layout);
      this.placed = { ...location, width, height };
      if (!this.clean) this.backing.setPosition(location.x, location.y).setSize(width, height).setVisible(true);

    }
    const { x, y } = this.placed;
    const left = x + pad;
    const offset = this.clean ? 17 * (1 - this.arrival) ** 3 : 0;
    if (this.paper) {
      const key = `${x}:${y}:${width}:${height}:${tower.type}:${level}`;
      if (this.paintKey !== key) {
        this.paintKey = key;
        const g = this.paper.clear();
        rounded(g, this.placed, CLEAN.panel, CLEAN.edge, 29);
        g.fillStyle(0x72918a).fillRect(x + width / 2 - 26, y + 7, 52, 3);
        const tile = { x: left, y: y + 24, width: portrait ? 71 : 54, height: portrait ? 62 : 48 };
        const art = this.illustration!.clear();
        rounded(art, tile, CLEAN.raised, CLEAN.raised, 13);
        if (!this.painted) drawTowerShape(art, tower.type,
          { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }, -Math.PI / 2, level > 1);
      }
      this.paper.setY(offset).setVisible(true);
      this.illustration!.setY(offset).setVisible(true);
      if (this.portraits) {
        this.portrait?.setVisible(false);
        let image = this.portraits.get(tower.type);
        if (!image) {
          image = uiObject(this.painted!.towerIcon(tower.type, portrait ? 61 : 46, portrait ? 51 : 40));
          this.scene.children.moveAbove(image, this.illustration!);
          this.portraits.set(tower.type, image);
        }
        this.portrait = image.setPosition(left + (portrait ? 35.5 : 27), y + offset + (portrait ? 55 : 48)).setVisible(true);
      }
      this.pathHeading!.setPosition(left + 4, y + offset + pad + header - 17);
      this.pathHeading!.setVisible(paths.length > 0 && this.headingFit.fit(portrait ? 24 : 14,
        [textSlot(this.pathHeading!, { x, y: y + offset, width, height: pad + header + textInset(this.pathHeading!) })]));
    }
    this.closeButton.setSize(close, close);
    this.closeButton.moveTo(x + width - pad - close, y + pad);
    this.closeButton.setVisualOffset(offset);
    this.closeButton.setShown(true);

    this.currentTitle = level > 1 ? towerPanelTitle(tower.type, level, tower.path) : null;
    const name = tower.path ? PATH_NAMES[tower.type][tower.path] : TOWER_NAMES[tower.type];
    const title = this.clean && (level < 3 || interLoaded) ? name : towerPanelTitle(tower.type, level, tower.path);
    if (this.titleText.text !== title) this.titleText.setText(title);
    const titleX = this.clean ? left + (portrait ? 82 : 65) : left;
    this.titleText.setPosition(titleX, y + pad + (this.clean ? 49 + capLine : portrait ? 13 : 9) + offset)
      .setVisible(this.clean || level > 1);
    const titleWidth = width - (titleX - x) - close - pad - 5;
    const kills = killsLabel(tower.kills ?? 0, atCap, separateCap ? '\n' : undefined);
    const meta = this.clean ? PANEL_TEXT.towerMeta(level, kills) : kills;
    if (this.killsText.text !== meta) this.killsText.setText(meta);
    this.killsText.setPosition(titleX, y + pad + (this.clean ? 19 + capLine / 2 : level > 1 ? (portrait ? 39 : 29) : header / 2 - 2) + offset)
      .setVisible(true);
    if (this.clean) {
      const area = { x, y: y + offset, width: titleX - x + titleWidth, height: pad + titleAreaHeight };
      const top = this.killsText.y + (portrait ? 13.5 : 8.5) + capLine / 2 - textInset(this.titleText);
      const titleBox = { ...area, y: top, height: y + offset + area.height - top };
      this.titleText.setVisible(this.titleFit.fit(portrait ? 29 : 23, [textSlot(this.titleText, titleBox, true)]));
      this.killsText.setVisible(this.metaFit.fit(metaSize, [textSlot(this.killsText, area)]));
    }

    // Below Close, Sell and Target can share the panel's full inner width.
    const innerWidth = width - 2 * pad;
    const sellShare = this.clean && interLoaded && portrait ? 0.46 : 0.43;
    const split = this.clean || level > 1 ? Math.round(innerWidth * sellShare) : 0;
    let top = y + pad + header;
    for (const { key, button, path } of rows) {
      const h = path ? pathHeight + extraHeight[path.path] : rowHeight;
      const isFirst = split > 0 && key === (this.clean ? 'target' : 'sell');
      const isSecond = split > 0 && key === (this.clean ? 'sell' : 'target');
      const firstWidth = this.clean ? innerWidth - split - rowGap : split;
      button.setSize(isFirst ? firstWidth : isSecond ? innerWidth - firstWidth - rowGap : buttonWidth, h);
      button.moveTo(isSecond ? left + firstWidth + rowGap : left, top);
      button.setVisualOffset(offset);
      if (path) {
        const { description, reason } = this.pathText[path.path];
        const hint = path.disabledReason ?? '';
        const color = this.clean ? CLEAN.subdued : button.isEnabled ? TEXT.button : TEXT.buttonDisabled;
        if (description.style.color !== color) description.setColor(color);
        if (reason.text !== hint) reason.setText(hint);
        description.setPosition(left + (this.clean ? (portrait ? 72 : 58) : 10), top + descriptionTop + offset);
        reason.setPosition(left + (this.clean ? (portrait ? 72 : 58) : 10), description.y + (showDescriptions ? description.height : 0) + captionGap);
      }
      if (!isFirst) top += h + rowGap;
    }
    for (const b of this.allButtons) b.setShown(b === this.closeButton || rows.some((row) => row.button === b));
    if (this.clean) Button.fitGroup(this.pathFit, paths.map(choice => this.pathButtons[choice.path]));
    for (const path of UPGRADE_PATHS) {
      const choice = rows.find((row) => row.path?.path === path)?.path;
      const { description, reason } = this.pathText[path];
      description.setVisible(choice !== undefined && showDescriptions);
      reason.setVisible(choice !== undefined && choice.disabledReason !== null && showReasons);
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
    return this.clean ? this.currentTitle : this.placed && this.titleText.visible ? this.titleText.text : null;
  }

  get sellText(): string | null {
    return this.placed ? this.sell.text : null;
  }

  get killsLine(): string | null {
    return this.placed ? (this.clean ? this.killsText.text.split(' · ').at(-1)! : this.killsText.text) : null;
  }

  get targetText(): string | null {
    return this.placed ? this.target.text : null;
  }
}

/** The mode after `mode` in the cycle first -> last -> strongest -> first. */
export function nextMode(mode: TargetingMode): TargetingMode {
  return TARGETING_MODES[(TARGETING_MODES.indexOf(mode) + 1) % TARGETING_MODES.length];
}

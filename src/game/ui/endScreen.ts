// The veil is deliberately not interactive. Phaser orders overlapping
// interactive objects by the camera's last render list; a click that lands
// before the first frame showing the end screen would find neither the veil
// nor the buttons in that list and could hand the click to the veil. With the
// buttons the only interactive objects there, a click always reaches one.

import Phaser from 'phaser';
import type { GameState } from '../../sim';
import type { Rect } from '../input';
import { TAXED_PORTRAIT, type Layout } from '../layout';
import { COLORS, FONT, TEXT } from '../palette';
import { ink, panel as drawPanel, rule } from './theme';
import { Button } from './button';
import { drawStarRow } from './starRow';
import { townCondition } from '../decor/townCondition';
import { townPortrait } from './townPortrait';
import { menuKeys } from './menuKeys';
import { CAMPAIGN_END, END_TEXT, LEVEL_NAMES, STORY_TEXT, levelNumberText } from '../names';
import { PRINT, glyph, line, motionClock, rounded, sheet, skinFor, textMetrics } from './newTheme';
import { uiObject } from './devicePixels';
import { printedText } from './printCard';
import { endScreenText, type CampaignResult, type EndKind } from './endText';

export type { EndKind };

const LANDSCAPE_WIDTH = 750;
const PORTRAIT_WIDTH = 440;
const BUTTON_W = 180;
/** [Keep going] (milestone 26). */
const KEEP_GOING_W = 170;
/** 42 px: at least 44 px on screen at iPad landscape scale (milestone 14). */
const BUTTON_H = 42;
/** [Menu] (milestone 25): smaller, to the right of [Play again]. */
const MENU_W = 100;
const BUTTON_GAP = 16;
/**
 * Portrait (milestone 32b): the row of buttons does not fit 480 px at
 * thumb size, so they stack, 280 x 70 and 12 px apart, under the title and
 * lines in a 440 px panel centred on the map.
 */
const P_BUTTON_W = 280;
const P_BUTTON_H = 70;
const P_GAP = 12;
export class EndScreen {
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly story: Phaser.GameObjects.Text;
  private close?: Phaser.GameObjects.Text;
  private readonly lines: Phaser.GameObjects.Text;
  private readonly boons: Phaser.GameObjects.Text;
  private starRow?: Phaser.GameObjects.Container;
  private detailRows: Phaser.GameObjects.Text[] = [];
  private readonly button: Button;
  private readonly menu: Button;
  private readonly keepGoing: Button;
  private fixedWaves = false;
  private campaign: CampaignResult | null = null;
  handleKey?: (event: KeyboardEvent) => void;
  private picture?: Phaser.GameObjects.Image;
  private readonly cx: number;
  private shown: EndKind | null = null;
  private readonly portrait: boolean;
  private readonly cy: number;
  private readonly printed: boolean;
  private folio?: Phaser.GameObjects.Text;
  private arrivalAt = -Infinity;
  private readonly clock?: () => number;
  private arrival?: (offset: number) => void;

  /** `layout` (milestone 32b): the veil covers its map box and the panel is centred on it. */
  constructor(scene: Phaser.Scene, private readonly board: Layout, onPlayAgain: () => void, onMenu: () => void, onKeepGoing: () => void, salute?: Phaser.GameObjects.Layer) {
    this.printed = skinFor(scene) === 'battle';
    this.clock = this.printed ? motionClock(scene) : undefined;
    const MAP_AREA = this.printed ? { x: 0, y: 0, width: board.width, height: board.height } : board.map;
    const cx = MAP_AREA.x + MAP_AREA.width / 2;
    const cy = MAP_AREA.y + MAP_AREA.height / 2;
    this.portrait = board.turned;
    this.cy = cy;
    const bw = this.portrait ? P_BUTTON_W : BUTTON_W;
    const bh = this.portrait ? P_BUTTON_H : BUTTON_H;
    const buttonFont = board === TAXED_PORTRAIT ? '23px' : '22px';

    this.veil = scene.add
      .rectangle(MAP_AREA.x, MAP_AREA.y, MAP_AREA.width, MAP_AREA.height, this.printed ? 0xc8b99a : COLORS.endVeil, this.printed ? (salute ? .975 : 1) : .38)
      .setOrigin(0, 0);
    if (salute) {
      // The evening salute shines through the open field around the paper.
      // Keep the panel, labels and every control above it.
      Phaser.Utils.Array.BringToTop(scene.children.list, salute);
    }
    this.panel = scene.add.graphics();
    if (this.printed) this.panel.setName('clean-printed-result');
    this.title = scene.add
      .text(cx, 0, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: TEXT.paperGold })
      .setOrigin(0.5);
    this.story = scene.add.text(cx, 0, '', {
      fontFamily: FONT, fontSize: this.portrait ? '20px' : '19px', color: ink, align: 'center',
    }).setOrigin(0.5, 0);
    this.lines = scene.add
      .text(cx, 0, '', {
        fontFamily: FONT,
        fontSize: this.portrait ? '20px' : '18px',
        fontStyle: 'bold',
        color: ink,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);
    this.boons = scene.add
      .text(cx, 0, '', {
        fontFamily: FONT,
        fontSize: this.portrait ? '20px' : '14px',
        color: ink,
        align: 'center',
        wordWrap: { width: this.portrait ? PORTRAIT_WIDTH - 40 : 442 },
      })
      .setOrigin(0.5, this.portrait ? 0 : 0.5);
    // The pair is centred on the panel: [Play again] then [Menu].
    const left = cx - (BUTTON_W + BUTTON_GAP + MENU_W) / 2;
    const y = 0; // Positioned from measured content when shown.
    this.cx = cx;
    this.button = new Button(scene, { x: left, y, width: bw, height: bh }, END_TEXT.playAgain, onPlayAgain, {
      fontSize: this.portrait ? buttonFont : '20px',
      ...(this.printed ? { skin: 'paper', icon: 'replay' } as const : {}),
    });
    this.menu = new Button(
      scene,
      { x: left + BUTTON_W + BUTTON_GAP, y, width: this.portrait ? P_BUTTON_W : MENU_W, height: bh },
      END_TEXT.menu,
      onMenu,
      { fontSize: this.portrait ? buttonFont : '18px', ...(this.printed ? { skin: 'paper', icon: 'map' } as const : {}) },
    );
    this.keepGoing = new Button(scene, { x: 0, y, width: this.portrait ? P_BUTTON_W : KEEP_GOING_W, height: bh }, END_TEXT.keepGoing, onKeepGoing, {
      fontSize: this.portrait ? buttonFont : '20px',
      ...(this.printed ? { skin: 'paper', primary: true, icon: 'arrow' } as const : {}),
    });
    if (this.printed) {
      for (const object of [this.veil, this.panel, this.title, this.story, this.lines, this.boons]) object.setDepth(10);
      for (const button of [this.button, this.menu, this.keepGoing]) button.setDepth(11);
    }
    this.keepGoing.setPicked(true);
    this.setVisible(false);
  }

  /** Which screen is showing, or null. */
  get kind(): EndKind | null {
    return this.shown;
  }

  get result(): CampaignResult | null {
    return this.campaign;
  }

  private get hasAdvance(): boolean {
    return this.campaign ? this.campaign.nextId !== null : this.shown === 'won' && !this.fixedWaves;
  }

  /** Show the screen for `kind`. Calling it again while shown does nothing. */
  show(kind: EndKind, state: GameState, campaign: CampaignResult | null): void {
    if (this.shown !== null) return;
    this.shown = kind;
    this.fixedWaves = !!state.fixedWaves;
    this.picture = townPortrait(this.title.scene, townCondition(state));
    this.campaign = campaign;
    this.story.setText(campaign?.story ?? (kind === 'lost' ? STORY_TEXT.loss : ''));
    this.story.setColor(kind === 'lost' ? TEXT.paperDefeat : '#254a57');
    if (campaign) {
      this.title.setText(campaign.title);
      const actResult = Boolean(campaign.actClose || state.level?.feat);
      const actFont = this.board === TAXED_PORTRAIT ? '23px' : '22px';
      const detailSize = this.portrait ? (actResult ? actFont : '20px') : '18px';
      if (actResult) {
        this.story.setFontSize(this.portrait ? actFont : '19px');
        this.story.setWordWrapWidth((this.portrait ? PORTRAIT_WIDTH : LANDSCAPE_WIDTH) - 44);
        if (campaign.actClose) {
          this.close = this.story.scene.add.text(this.cx, 0, campaign.actClose, {
            fontFamily: FONT, fontSize: this.story.style.fontSize, color: ink, align: 'center',
            wordWrap: { width: (this.portrait ? PORTRAIT_WIDTH : LANDSCAPE_WIDTH) - 44 },
          }).setOrigin(0.5, 0);
        }
      }
      if (campaign.slots) this.starRow = drawStarRow(this.title.scene, this.cx, 0, campaign.stars, this.printed && this.portrait ? 34 : 28, TEXT.paperGold, !!state.level?.feat, this.printed);
      this.detailRows = campaign.details.map(text => this.boons.scene.add.text(this.cx, 0, text, {
        fontFamily: FONT, fontSize: detailSize, color: ink, align: 'center',
        wordWrap: { width: this.portrait ? PORTRAIT_WIDTH - 40 : 442 },
      }).setOrigin(0.5, 0));
      this.button.set(kind === 'won' ? END_TEXT.playAgain : CAMPAIGN_END.retry, true);
      this.menu.set(CAMPAIGN_END.map, true);
      this.keepGoing.set(CAMPAIGN_END.next, true);
      for (const b of [this.keepGoing, this.button, this.menu]) {
        if (this.portrait && actResult) b.setSize(P_BUTTON_W, this.board === TAXED_PORTRAIT ? 82 : 80);
        if (!this.portrait) b.setSize(160, actResult ? 66 : 52);
      }
    } else {
      const { title, lines, boons } = endScreenText(kind, state);
      this.title.setText(title);
      this.lines.setText(lines.join('\n'));
      this.boons.setText(boons);
    }
    this.title.setColor(kind === 'won' ? ink : TEXT.paperDefeat);
    if (this.printed) {
      document.body.style.backgroundColor = '#c8b99a';
      this.printLayout(state);
    }
    else this.layout();
    this.setVisible(true);
  }

  /** Hide the screen (milestone 26: after Keep going); a later show() works again. */
  hide(): void {
    if (this.printed) document.body.style.backgroundColor = '#0b1e20';
    this.folio?.destroy();
    this.folio = undefined;
    this.arrival = undefined;
    this.close?.destroy();
    this.close = undefined;
    this.picture?.destroy();
    this.picture = undefined;
    for (const row of this.detailRows) row.destroy();
    this.detailRows = [];
    this.starRow?.destroy();
    this.starRow = undefined;
    this.shown = null;
    this.campaign = null;
    this.handleKey = undefined;
    this.setVisible(false);
  }

  /** `playAgain` and `menu` while shown, and `keepGoing` on the win screen; else nothing. */
  rects(): Record<string, Rect> {
    if (this.shown === null) return {};
    const out: Record<string, Rect> = { playAgain: this.button.rect, menu: this.menu.rect };
    if (this.hasAdvance) out[this.campaign ? 'nextLevel' : 'keepGoing'] = this.keepGoing.rect;
    return out;
  }

  /** Lay the sheet over the field. Offsets affect only the rendered objects. */
  private printLayout(state: GameState): void {
    const phone = this.portrait;
    const width = phone ? Math.min(this.cx * 2 - 46, 730) : 720;
    const x = this.cx - width / 2;
    const pad = phone ? 25 : 22;
    const inner = width - 2 * pad;
    const gap = phone ? 14 : 9;
    const tall = phone ? 26 : 16;
    const scene = this.title.scene;
    const picture = this.picture!;
    const controls = this.hasAdvance ? [this.keepGoing, this.button, this.menu] : [this.button, this.menu];
    const details = this.campaign ? this.detailRows : [this.lines, this.boons].filter(label => label.text);
    const paperLabel = (label: Phaser.GameObjects.Text, px: number, wrap: number, color: string, fontStyle = 'normal') =>
      label.setStyle({ color, fontSize: px, fontStyle, align: 'center', metrics: textMetrics(px), wordWrap: { width: wrap }, lineSpacing: 0 })
        .setOrigin(.5, 0).setDepth(11);
    const titleSize = phone ? this.shown === 'won' ? 86 : 66 : 55;
    paperLabel(this.title, titleSize, inner, this.shown === 'won' ? PRINT.ink : PRINT.red);
    // Caslon's display-size descenders extend beyond the small-label line box.
    this.title.setPadding(0, 0, 0, Math.ceil(titleSize * .12));
    paperLabel(this.story, phone ? 27 : 18, inner, PRINT.muted, 'italic');
    if (this.close) paperLabel(this.close, tall, inner, PRINT.ink);
    details.forEach(row => paperLabel(row, tall, phone ? inner - 38 : 302, PRINT.ink));
    if (state.level) {
      this.folio = printedText(scene, `${levelNumberText(state.level.id)} · ${LEVEL_NAMES[state.level.id].name}`, tall, inner, PRINT.red, 'bold')
        .setDepth(11);
    }
    uiObject(picture.setDepth(11));
    if (this.starRow) uiObject(this.starRow);
    this.starRow?.setDepth(11).setScale(phone ? 2.04 : 1.3);
    const stars = this.starRow?.getBounds().height ?? 0;
    const photoW = phone ? inner : 306;
    const photoH = photoW / 2 + (phone ? 4 : 0);
    const rowsH = details.reduce((sum, row) => sum + row.height + gap, 0);
    const headline = pad + (this.folio ? this.folio.height + 2 * gap : 0) + this.title.height + gap + (stars ? stars + gap : 0);
    const body = phone ? photoH + gap + rowsH : Math.max(photoH, rowsH);
    const reply = (this.story.text ? this.story.height + gap : 0) + (this.close ? this.close.height + gap : 0);
    const tapH = phone ? Math.max(89, Math.ceil(44 * scene.scale.displayScale.y)) : 49;
    const actions = phone && this.hasAdvance ? 2 * tapH + gap : tapH;
    const height = headline + body + reply + actions + gap + pad;
    const y = this.cy - height / 2;
    const g = this.panel.clear();
    sheet(g, { x, y, width, height });
    let top = y + pad;
    if (this.folio) {
      this.folio.setPosition(this.cx, top);
      top += this.folio.height + gap;
      line(g, x + pad, top, inner);
      top += gap;
    }
    this.title.setPosition(this.cx, top);
    top += this.title.height + gap;
    if (this.starRow) {
      this.starRow.setPosition(this.cx, top + stars / 2);
      top += stars + gap;
    }
    const photoX = phone ? x + pad : x + pad + 7;
    const photoY = top + (phone ? 0 : (body - photoH) / 2);
    rounded(g, { x: photoX, y: photoY, width: photoW, height: photoH }, PRINT.inset, PRINT.edge, 10);
    picture.setPosition(photoX + photoW / 2, photoY + photoH / 2).setDisplaySize(photoW - 8, (photoW - 8) / 2);
    let lineY = top + (phone ? photoH + gap : (body - rowsH) / 2);
    for (const [i, row] of details.entries()) {
      const textX = phone ? this.cx : x + width - pad - 166;
      row.setPosition(textX, lineY);
      if (i === 0 && this.shown === 'won') glyph(g, 'heart', textX - row.width / 2 - 15, lineY + row.height / 2, phone ? 23 : 16, PRINT.green);
      lineY += row.height + gap;
    }
    top += body + gap;
    line(g, x + pad, top - gap / 2, inner);
    this.story.setPosition(this.cx, top);
    if (this.close) this.close.setPosition(this.cx, top + (this.story.text ? this.story.height + gap : 0));
    top += reply;
    if (phone && this.hasAdvance) {
      this.keepGoing.setSize(inner, tapH);
      this.keepGoing.setFontSize('26px');
      this.keepGoing.moveTo(x + pad, top);
      top += tapH + gap;
    }
    const row = phone ? [this.button, this.menu] : controls;
    const each = (inner - (row.length - 1) * gap) / row.length;
    row.forEach((button, i) => {
      button.setSize(each, tapH);
      button.setFontSize(phone ? '26px' : '17px');
      button.moveTo(x + pad + i * (each + gap), top);
    });
    if (this.campaign) this.handleKey = menuKeys(controls, 0, this.menu);
    if (this.clock) {
      const objects = [g, this.title, this.folio, this.starRow, picture, ...details, this.story, this.close]
        .filter(object => object !== undefined);
      const origins = objects.map(object => object.y);
      this.arrival = offset => {
        objects.forEach((object, i) => object.setY(origins[i] + offset));
        controls.forEach(button => button.setVisualOffset(offset));
      };
      this.arrivalAt = this.clock();
      this.animate(this.arrivalAt);
    }
  }

  animate(now: number): void {
    if (!this.arrival) return;
    const t = Math.min(1, (now - this.arrivalAt) / 240);
    this.arrival(18 * (1 - t) ** 3);
    if (t === 1) this.arrival = undefined;
  }

  /** The panel width and the button row for this screen: two buttons, or three on the win screen (milestone 26). */
  private layout(): void {
    const buttons = this.hasAdvance ? [this.keepGoing, this.button, this.menu] : [this.button, this.menu];
    const picture = this.picture!;
    const portrait = this.portrait;
    const w = portrait ? PORTRAIT_WIDTH : LANDSCAPE_WIDTH;
    const pad = 22, gap = 8;
    const titleY = pad + this.title.height / 2;
    const imageW = portrait ? 302 : 240;
    const imageH = imageW / 2;
    const afterTitle = titleY + this.title.height / 2 + gap;
    const textX = this.cx + (portrait ? 0 : (imageW + 12) / 2);
    const content = this.campaign ? this.detailRows : [this.lines, this.boons].filter(row => row.text);
    const starH = this.starRow ? this.starRow.getBounds().height + 2 : 0;
    const textH = (starH ? starH + gap : 0) + content.reduce((h, row) => h + row.height + gap, -gap);
    const bodyH = portrait ? imageH + gap + textH : Math.max(imageH, textH);
    const buttonH = this.button.rect.height;
    const buttonsH = portrait ? buttons.length * buttonH + (buttons.length - 1) * P_GAP : this.button.rect.height;
    this.story.setScale(Math.min(1, (w - 2 * pad) / Math.max(1, this.story.width)));
    const storyH = this.story.text ? this.story.displayHeight + gap : 0;
    const closeH = this.close ? this.close.height + gap : 0;
    const h = afterTitle + bodyH + storyH + closeH + 16 + buttonsH + pad;
    const top = this.cy - h / 2;
    this.paper(w, h, titleY);
    this.title.setY(top + titleY);
    picture.setDisplaySize(imageW, imageH).setPosition(
      portrait ? this.cx : this.cx - w / 2 + pad + imageW / 2,
      top + afterTitle + (portrait ? imageH : bodyH) / 2);
    let y = top + afterTitle + (portrait ? imageH + gap : (bodyH - textH) / 2);
    if (this.starRow) {
      this.starRow.setPosition(textX, y + starH / 2);
      y += starH + gap;
    }
    for (const row of content) {
      row.setOrigin(0.5, 0).setPosition(textX, y);
      y += row.height + gap;
    }
    this.story.setPosition(this.cx, top + afterTitle + bodyH + gap);
    this.close?.setY(this.story.y + storyH);
    const buttonsY = top + afterTitle + bodyH + storyH + closeH + 16;
    if (portrait) {
      buttons.forEach((b, i) => b.moveTo(this.cx - P_BUTTON_W / 2, buttonsY + i * (buttonH + P_GAP)));
    } else {
      this.buttonRow(buttons, buttonsY);
    }
    if (this.campaign) this.handleKey = menuKeys(buttons, 0, this.menu);
  }

  private paper(width: number, height: number, titleY: number): void {
    const x = this.cx - width / 2, y = this.cy - height / 2;
    this.panel.clear();
    drawPanel(this.panel, { x, y, width, height });
    const side = (width - this.title.width) / 2 - 36;
    if (side >= 28) {
      rule(this.panel, x + 18 + side / 2, y + titleY, side);
      rule(this.panel, x + width - 18 - side / 2, y + titleY, side);
    }
  }

  private buttonRow(buttons: Button[], y: number): void {
    const total = buttons.reduce((n, b) => n + b.rect.width, 0) + (buttons.length - 1) * BUTTON_GAP;
    let x = this.cx - total / 2;
    for (const b of buttons) {
      b.moveTo(x, y);
      x += b.rect.width + BUTTON_GAP;
    }
  }

  private setVisible(visible: boolean): void {
    for (const o of [this.veil, this.panel, this.title, this.lines, this.boons, this.story]) o.setVisible(visible);
    this.button.setShown(visible);
    this.menu.setShown(visible);
    this.keepGoing.setShown(visible && this.hasAdvance);
  }
}

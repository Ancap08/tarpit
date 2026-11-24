// The veil is deliberately not interactive. Phaser orders overlapping
// interactive objects by the camera's last render list; a click that lands
// before the first frame showing the end screen would find neither the veil
// nor the buttons in that list and could hand the click to the veil. With the
// buttons the only interactive objects there, a click always reaches one.

import Phaser from 'phaser';
import type { GameState } from '../../sim';
import type { Rect } from '../input';
import type { Layout } from '../layout';
import { COLORS, FONT, TEXT } from '../palette';
import { ink, panel as drawPanel, rule } from './theme';
import { Button } from './button';
import { drawStarRow } from './starRow';
import { townCondition } from '../decor/townCondition';
import { townPortrait } from './townPortrait';
import { menuKeys } from './menuKeys';
import { CAMPAIGN_END, END_TEXT, STORY_TEXT } from '../names';
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
  private readonly lines: Phaser.GameObjects.Text;
  private readonly boons: Phaser.GameObjects.Text;
  private starRow?: Phaser.GameObjects.Container;
  private detailRows: Phaser.GameObjects.Text[] = [];
  private readonly button: Button;
  private readonly menu: Button;
  private readonly keepGoing: Button;
  private campaign: CampaignResult | null = null;
  handleKey?: (event: KeyboardEvent) => void;
  private picture?: Phaser.GameObjects.Image;
  private readonly cx: number;
  private shown: EndKind | null = null;
  private readonly portrait: boolean;
  private readonly cy: number;

  /** `layout` (milestone 32b): the veil covers its map box and the panel is centred on it. */
  constructor(scene: Phaser.Scene, layout: Layout, onPlayAgain: () => void, onMenu: () => void, onKeepGoing: () => void, salute?: Phaser.GameObjects.Layer) {
    const MAP_AREA = layout.map;
    const cx = MAP_AREA.x + MAP_AREA.width / 2;
    const cy = MAP_AREA.y + MAP_AREA.height / 2;
    this.portrait = layout.kind === 'portrait';
    this.cy = cy;
    const bw = this.portrait ? P_BUTTON_W : BUTTON_W;
    const bh = this.portrait ? P_BUTTON_H : BUTTON_H;

    this.veil = scene.add
      .rectangle(MAP_AREA.x, MAP_AREA.y, MAP_AREA.width, MAP_AREA.height, COLORS.endVeil, 0.38)
      .setOrigin(0, 0);
    if (salute) {
      // The evening salute shines through the open field around the paper.
      // Keep the panel, labels and every control above it.
      Phaser.Utils.Array.BringToTop(scene.children.list, salute);
    }
    this.panel = scene.add.graphics();
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
      fontSize: this.portrait ? '22px' : '20px',
    });
    this.menu = new Button(
      scene,
      { x: left + BUTTON_W + BUTTON_GAP, y, width: this.portrait ? P_BUTTON_W : MENU_W, height: bh },
      END_TEXT.menu,
      onMenu,
      { fontSize: this.portrait ? '22px' : '18px' },
    );
    this.keepGoing = new Button(scene, { x: 0, y, width: this.portrait ? P_BUTTON_W : KEEP_GOING_W, height: bh }, END_TEXT.keepGoing, onKeepGoing, {
      fontSize: this.portrait ? '22px' : '20px',
    });
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
    return this.campaign ? this.campaign.nextId !== null : this.shown === 'won';
  }

  /** Show the screen for `kind`. Calling it again while shown does nothing. */
  show(kind: EndKind, state: GameState, campaign: CampaignResult | null): void {
    if (this.shown !== null) return;
    this.shown = kind;
    this.picture = townPortrait(this.title.scene, townCondition(state));
    this.campaign = campaign;
    this.story.setText(campaign?.story ?? (kind === 'lost' ? STORY_TEXT.loss : ''));
    this.story.setColor(kind === 'lost' ? TEXT.paperDefeat : '#254a57');
    if (campaign) {
      this.title.setText(campaign.title);
      if (kind === 'won') this.starRow = drawStarRow(this.title.scene, this.cx, 0, campaign.stars, 28, TEXT.paperGold);
      this.detailRows = campaign.details.map(text => this.boons.scene.add.text(this.cx, 0, text, {
        fontFamily: FONT, fontSize: this.portrait ? '20px' : '18px', color: ink, align: 'center',
        wordWrap: { width: this.portrait ? PORTRAIT_WIDTH - 40 : 442 },
      }).setOrigin(0.5, 0));
      this.button.set(kind === 'won' ? END_TEXT.playAgain : CAMPAIGN_END.retry, true);
      this.menu.set(CAMPAIGN_END.map, true);
      this.keepGoing.set(CAMPAIGN_END.next, true);
      if (!this.portrait) {
        for (const b of [this.keepGoing, this.button, this.menu]) b.setSize(160, 52);
      }
    } else {
      const { title, lines, boons } = endScreenText(kind, state);
      this.title.setText(title);
      this.lines.setText(lines.join('\n'));
      this.boons.setText(boons);
    }
    this.title.setColor(kind === 'won' ? ink : TEXT.paperDefeat);
    this.layout();
    this.setVisible(true);
  }

  /** Hide the screen (milestone 26: after Keep going); a later show() works again. */
  hide(): void {
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
    const buttonsH = portrait ? buttons.length * P_BUTTON_H + (buttons.length - 1) * P_GAP : this.button.rect.height;
    this.story.setScale(Math.min(1, (w - 2 * pad) / Math.max(1, this.story.width)));
    const storyH = this.story.text ? this.story.displayHeight + gap : 0;
    const h = afterTitle + bodyH + storyH + 16 + buttonsH + pad;
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
    const buttonsY = top + afterTitle + bodyH + storyH + 16;
    if (portrait) {
      buttons.forEach((b, i) => b.moveTo(this.cx - P_BUTTON_W / 2, buttonsY + i * (P_BUTTON_H + P_GAP)));
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

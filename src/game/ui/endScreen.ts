// End screen: shown once the simulation's phase is 'won' or 'lost'. A
// translucent veil covers the map area (the HUD below stays visible with the
// final numbers) and a centred panel, translucent enough that the map shows
// through faintly, holds a title, one or two stat lines, the held boons and a [Play again] button
// (same level) and, beside it, a smaller [Menu] button back to the title
// menu (milestone 25). The scene ignores map clicks and hover while it shows.
// Milestone 26: the win screen widens to 520 px and adds [Keep going] as
// the primary button (highlighted, on the left): [Keep going] [Play again]
// [Menu], 42 px tall and 16 px apart. Pressing it turns the game endless
// and hides the screen. The lose screen is unchanged.
//
// The veil is deliberately not interactive. Phaser orders overlapping
// interactive objects by the camera's last render list; a click that lands
// before the first frame showing the end screen would find neither the veil
// nor the buttons in that list and could hand the click to the veil. With the
// buttons the only interactive objects there, a click always reaches one.

import type Phaser from 'phaser';
import type { GameState } from '../../sim';
import type { Rect } from '../input';
import type { Layout } from '../layout';
import { COLORS, FONT, TEXT } from '../palette';
import { Button } from './button';
import { CAMPAIGN_END, END_TEXT } from '../names';
import { endScreenText, type CampaignResult, type EndKind } from './endText';

export type { EndKind };

const PANEL_W = 460;
/** The win screen's panel (milestone 26): wide enough for three buttons. */
const PANEL_W_WON = 520;
const PANEL_H = 230;
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
const P_PANEL_W = 440;
const P_BUTTON_W = 280;
const P_BUTTON_H = 70;
const P_GAP = 12;
/** From the panel's top: the title's centre, the lines' centre and the first button's top. */
const P_TITLE_Y = 52;
const P_LINES_Y = 124;
const P_BOONS_TOP = 150;
const P_BUTTONS_Y = 178;
const P_PAD_BOTTOM = 24;

export class EndScreen {
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly lines: Phaser.GameObjects.Text;
  private readonly boons: Phaser.GameObjects.Text;
  private detailRows: Phaser.GameObjects.Text[] = [];
  private readonly button: Button;
  private readonly menu: Button;
  private readonly keepGoing: Button;
  private campaign: CampaignResult | null = null;
  private readonly buttonY: number;
  private readonly cx: number;
  private shown: EndKind | null = null;
  private readonly portrait: boolean;
  private readonly cy: number;

  /** `layout` (milestone 32b): the veil covers its map box and the panel is centred on it. */
  constructor(scene: Phaser.Scene, layout: Layout, onPlayAgain: () => void, onMenu: () => void, onKeepGoing: () => void) {
    const MAP_AREA = layout.map;
    const cx = MAP_AREA.x + MAP_AREA.width / 2;
    const cy = MAP_AREA.y + MAP_AREA.height / 2;
    this.portrait = layout.kind === 'portrait';
    this.cy = cy;
    const bw = this.portrait ? P_BUTTON_W : BUTTON_W;
    const bh = this.portrait ? P_BUTTON_H : BUTTON_H;
    const top = cy - PANEL_H / 2;

    this.veil = scene.add
      .rectangle(MAP_AREA.x, MAP_AREA.y, MAP_AREA.width, MAP_AREA.height, COLORS.endVeil, 0.62)
      .setOrigin(0, 0);
    this.panel = scene.add
      .rectangle(cx, cy, PANEL_W, PANEL_H, COLORS.endPanel, 0.85)
      .setStrokeStyle(2, COLORS.endPanelEdge, 0.9);
    this.title = scene.add
      .text(cx, top + 44, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: TEXT.victory })
      .setOrigin(0.5);
    this.lines = scene.add
      .text(cx, top + 112, '', {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT.endLine,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);
    this.boons = scene.add
      .text(cx, top + 148, '', {
        fontFamily: FONT,
        fontSize: this.portrait ? '18px' : '14px',
        color: TEXT.endLine,
        align: 'center',
        wordWrap: this.portrait ? { width: P_PANEL_W - 32 } : undefined,
      })
      .setOrigin(0.5, this.portrait ? 0 : 0.5);
    // The pair is centred on the panel: [Play again] then [Menu].
    const left = cx - (BUTTON_W + BUTTON_GAP + MENU_W) / 2;
    const y = top + PANEL_H - BUTTON_H - 22;
    this.buttonY = y;
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
    this.campaign = campaign;
    if (campaign) {
      this.title.setText(campaign.title);
      this.lines.setText(campaign.slots).setFontSize(32).setColor(TEXT.victory);
      this.detailRows = campaign.details.map(text => this.boons.scene.add.text(this.cx, 0, text, {
        fontFamily: FONT, fontSize: '18px', color: TEXT.endLine, align: 'center',
        wordWrap: { width: (this.portrait ? P_PANEL_W : 560) - 32 },
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
    this.title.setColor(kind === 'won' ? TEXT.victory : TEXT.defeat);
    this.layout();
    this.setVisible(true);
  }

  /** Hide the screen (milestone 26: after Keep going); a later show() works again. */
  hide(): void {
    for (const row of this.detailRows) row.destroy();
    this.detailRows = [];
    this.shown = null;
    this.campaign = null;
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
    if (this.campaign) {
      const titleY = this.portrait ? P_TITLE_Y : 36;
      const starsY = this.portrait ? P_LINES_Y : 82;
      const rowGap = 8;
      let cursor = this.lines.text
        ? starsY + this.lines.height / 2 + rowGap
        : starsY;
      for (const row of this.detailRows) {
        row.setY(cursor);
        cursor += row.height + rowGap;
      }
      const buttonsY = cursor - rowGap + (this.portrait ? 16 : 22);
      const buttonHeight = this.portrait
        ? buttons.length * P_BUTTON_H + (buttons.length - 1) * P_GAP
        : this.button.rect.height;
      const h = buttonsY + buttonHeight + (this.portrait ? P_PAD_BOTTOM : 22);
      const top = this.cy - h / 2;
      this.panel.setSize(this.portrait ? P_PANEL_W : 560, h);
      this.title.setY(top + titleY);
      this.lines.setY(top + starsY);
      for (const row of this.detailRows) row.setY(top + row.y);
      if (this.portrait) {
        buttons.forEach((b, i) => b.moveTo(this.cx - P_BUTTON_W / 2, top + buttonsY + i * (P_BUTTON_H + P_GAP)));
      } else {
        this.buttonRow(buttons, top + buttonsY);
      }
      return;
    }
    if (this.portrait) {
      const detailsY = P_BOONS_TOP;
      const buttonsY = this.boons.text
        ? Math.max(P_BUTTONS_Y, detailsY + this.boons.height + 10)
        : P_BUTTONS_Y;
      const h = buttonsY + buttons.length * P_BUTTON_H + (buttons.length - 1) * P_GAP + P_PAD_BOTTOM;
      const top = this.cy - h / 2;
      this.panel.setSize(P_PANEL_W, h).setDisplayOrigin(P_PANEL_W / 2, h / 2);
      this.title.setY(top + P_TITLE_Y);
      this.lines.setY(top + P_LINES_Y);
      this.boons.setY(top + detailsY);
      buttons.forEach((b, i) => b.moveTo(this.cx - P_BUTTON_W / 2, top + buttonsY + i * (P_BUTTON_H + P_GAP)));
      return;
    }
    this.panel.setSize(this.hasAdvance ? PANEL_W_WON : PANEL_W, PANEL_H);
    this.buttonRow(buttons, this.buttonY);
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
    for (const o of [this.veil, this.panel, this.title, this.lines, this.boons]) o.setVisible(visible);
    this.button.setShown(visible);
    this.menu.setShown(visible);
    this.keepGoing.setShown(visible && this.hasAdvance);
  }
}

// End screen: shown once the simulation's phase is 'won' or 'lost'. A
// translucent veil covers the map area (the HUD below stays visible with the
// final numbers) and a centred panel, translucent enough that the map shows
// through faintly, holds a title, one or two lines, a [Play again] button
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
import { END_TEXT } from '../names';
import { endScreenText, type EndKind } from './endText';

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

export class EndScreen {
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly lines: Phaser.GameObjects.Text;
  private readonly button: Button;
  private readonly menu: Button;
  private readonly keepGoing: Button;
  private readonly buttonY: number;
  private readonly cx: number;
  private shown: EndKind | null = null;

  /** `layout` (milestone 32b): the veil covers its map box and the panel is centred on it. */
  constructor(scene: Phaser.Scene, layout: Layout, onPlayAgain: () => void, onMenu: () => void, onKeepGoing: () => void) {
    const MAP_AREA = layout.map;
    const cx = MAP_AREA.x + MAP_AREA.width / 2;
    const cy = MAP_AREA.y + MAP_AREA.height / 2;
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
    // The pair is centred on the panel: [Play again] then [Menu].
    const left = cx - (BUTTON_W + BUTTON_GAP + MENU_W) / 2;
    const y = top + PANEL_H - BUTTON_H - 22;
    this.buttonY = y;
    this.cx = cx;
    this.button = new Button(scene, { x: left, y, width: BUTTON_W, height: BUTTON_H }, END_TEXT.playAgain, onPlayAgain, {
      fontSize: '20px',
    });
    this.menu = new Button(
      scene,
      { x: left + BUTTON_W + BUTTON_GAP, y, width: MENU_W, height: BUTTON_H },
      END_TEXT.menu,
      onMenu,
      { fontSize: '18px' },
    );
    this.keepGoing = new Button(scene, { x: 0, y, width: KEEP_GOING_W, height: BUTTON_H }, END_TEXT.keepGoing, onKeepGoing, {
      fontSize: '20px',
    });
    this.keepGoing.setPicked(true);
    this.setVisible(false);
  }

  /** Which screen is showing, or null. */
  get kind(): EndKind | null {
    return this.shown;
  }

  /** Show the screen for `kind`. Calling it again while shown does nothing. */
  show(kind: EndKind, state: GameState): void {
    if (this.shown !== null) return;
    this.shown = kind;
    const { title, lines } = endScreenText(kind, state);
    this.title.setText(title).setColor(kind === 'won' ? TEXT.victory : TEXT.defeat);
    this.lines.setText(lines.join('\n'));
    this.layout(kind);
    this.setVisible(true);
  }

  /** Hide the screen (milestone 26: after Keep going); a later show() works again. */
  hide(): void {
    this.shown = null;
    this.setVisible(false);
  }

  /** `playAgain` and `menu` while shown, and `keepGoing` on the win screen; else nothing. */
  rects(): Record<string, Rect> {
    if (this.shown === null) return {};
    const out: Record<string, Rect> = { playAgain: this.button.rect, menu: this.menu.rect };
    if (this.shown === 'won') out.keepGoing = this.keepGoing.rect;
    return out;
  }

  /** The panel width and the button row for this screen: two buttons, or three on the win screen (milestone 26). */
  private layout(kind: EndKind): void {
    const won = kind === 'won';
    this.panel.setSize(won ? PANEL_W_WON : PANEL_W, PANEL_H);
    const row = won ? [this.keepGoing, this.button, this.menu] : [this.button, this.menu];
    const total = row.reduce((n, b) => n + b.rect.width, 0) + (row.length - 1) * BUTTON_GAP;
    let x = this.cx - total / 2;
    for (const b of row) {
      b.moveTo(x, this.buttonY);
      x += b.rect.width + BUTTON_GAP;
    }
  }

  private setVisible(visible: boolean): void {
    for (const o of [this.veil, this.panel, this.title, this.lines]) o.setVisible(visible);
    this.button.setShown(visible);
    this.menu.setShown(visible);
    this.keepGoing.setShown(visible && this.shown === 'won');
  }
}

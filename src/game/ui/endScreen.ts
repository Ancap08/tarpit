// End screen: shown once the simulation's phase is 'won' or 'lost'. A
// translucent veil covers the map area (the HUD below stays visible with the
// final numbers) and a centred panel, translucent enough that the map shows
// through faintly, holds a title, one or two lines and a
// [Play again] button. The scene ignores map clicks and hover while it shows.
//
// The veil is deliberately not interactive. Phaser orders overlapping
// interactive objects by the camera's last render list; a click that lands
// before the first frame showing the end screen would find neither the veil
// nor the button in that list and could hand the click to the veil. With the
// button the only interactive object there, a click always reaches it.

import type Phaser from 'phaser';
import type { GameState } from '../../sim';
import { MAP_AREA, type Rect } from '../input';
import { COLORS, FONT, TEXT } from '../palette';
import { Button } from './button';
import { endScreenText, type EndKind } from './endText';

export type { EndKind };

const PANEL_W = 460;
const PANEL_H = 230;
const BUTTON_W = 180;
/** 42 px: at least 44 px on screen at iPad landscape scale (milestone 14). */
const BUTTON_H = 42;

export class EndScreen {
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly lines: Phaser.GameObjects.Text;
  private readonly button: Button;
  private shown: EndKind | null = null;

  constructor(scene: Phaser.Scene, onPlayAgain: () => void) {
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
    this.button = new Button(
      scene,
      { x: cx - BUTTON_W / 2, y: top + PANEL_H - BUTTON_H - 22, width: BUTTON_W, height: BUTTON_H },
      'Play again',
      onPlayAgain,
      { fontSize: '20px' },
    );
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
    this.setVisible(true);
  }

  /** `playAgain` while shown, else nothing. */
  rects(): Record<string, Rect> {
    return this.shown === null ? {} : { playAgain: this.button.rect };
  }

  private setVisible(visible: boolean): void {
    for (const o of [this.veil, this.panel, this.title, this.lines]) o.setVisible(visible);
    this.button.setShown(visible);
  }
}

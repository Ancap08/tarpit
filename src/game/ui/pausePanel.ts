import Phaser from 'phaser';
import { hudMetrics } from '../hud';
import { contains, type Rect } from '../input';
import type { Layout } from '../layout';
import { CAMPAIGN_END, END_TEXT, PAUSE_TEXT } from '../names';
import { COLORS, FONT } from '../palette';
import { Button, CANCEL_UI_PRESS } from './button';
import { menuKeys } from './menuKeys';
import { ink, panel, rule } from './theme';

interface Actions {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
}

export class PausePanel {
  private readonly shade: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly paper: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly buttons: Button[];
  private navigate?: (event: KeyboardEvent) => void;
  private confirming = false;

  constructor(private readonly scene: Phaser.Scene, layout: Layout, campaign: boolean, actions: Actions) {
    const depth = 20; // Above reward cards, held boons and the boss banner.
    const mute = hudMetrics(layout).mute;
    this.shade = scene.add.graphics().setDepth(depth);
    // The scene's input layer can include a rail to the right of the map. Leave
    // a hole for the real mute button, including after a same-layout refit.
    this.blocker = scene.add.zone(0, 0, 1, 1).setOrigin(0).setDepth(depth)
      .setInteractive(new Phaser.Geom.Rectangle(), (_area: unknown, x: number, y: number) =>
        !contains(mute, x, y) && !this.buttons.some(button => contains(button.rect, x, y)));
    const fitShade = () => {
      const { width, height } = scene.scale;
      this.blocker.setSize(width, height);
      const right = mute.x + mute.width, bottom = mute.y + mute.height;
      this.shade.clear().fillStyle(COLORS.endVeil, 0.66)
        .fillRect(0, 0, width, mute.y)
        .fillRect(0, bottom, width, height - bottom)
        .fillRect(0, mute.y, mute.x, mute.height)
        .fillRect(right, mute.y, width - right, mute.height);
    };
    fitShade();
    scene.scale.on('resize', fitShade);
    scene.events.once('shutdown', () => scene.scale.off('resize', fitShade));

    const cx = layout.map.x + layout.map.width / 2;
    const cy = layout.map.y + layout.map.height / 2;
    this.title = scene.add.text(cx, 0, PAUSE_TEXT.title, {
      fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: ink,
    }).setOrigin(0.5, 0).setDepth(depth + 1);
    const portrait = layout.turned;
    const buttonW = portrait ? 260 : 166;
    const buttonH = portrait ? 80 : 56;
    const gap = 12;
    const pad = 22;
    const width = portrait ? 328 : 3 * buttonW + 2 * (gap + pad);
    const height = pad * 2 + this.title.height + 22 + (portrait ? 3 * buttonH + 2 * gap : buttonH);
    const top = cy - height / 2, left = cx - width / 2;
    this.paper = scene.add.graphics().setDepth(depth);
    panel(this.paper, { x: left, y: top, width, height });
    this.title.setY(top + pad);
    rule(this.paper, cx, top + pad + this.title.height + 8, 110);
    const buttonTop = top + pad + this.title.height + 22;
    const rect = (i: number): Rect => ({
      x: portrait ? cx - buttonW / 2 : left + pad + i * (buttonW + gap),
      y: buttonTop + (portrait ? i * (buttonH + gap) : 0),
      width: buttonW, height: buttonH,
    });
    const options = { fontSize: portrait ? '22px' : '18px', sound: null };
    this.buttons = [
      new Button(scene, rect(0), PAUSE_TEXT.resume, actions.onResume, options),
      new Button(scene, rect(1), PAUSE_TEXT.restart, () => {
        if (this.confirming) actions.onRestart();
        else {
          this.confirming = true;
          this.buttons[1].set(PAUSE_TEXT.confirm, true);
        }
      }, options),
      new Button(scene, rect(2), campaign ? CAMPAIGN_END.map : END_TEXT.menu, actions.onMenu, options),
    ];
    for (const b of this.buttons) b.setDepth(depth + 1);
    this.setShown(false);
  }

  setShown(shown: boolean): void {
    if (shown) this.scene.input.emit(CANCEL_UI_PRESS);
    this.confirming = false;
    this.buttons[1].set(PAUSE_TEXT.restart, true);
    this.navigate = shown ? menuKeys(this.buttons, 0) : undefined;
    for (const o of [this.shade, this.paper, this.title, this.blocker]) o.setVisible(shown);
    this.blocker.input!.enabled = shown;
    for (const b of this.buttons) b.setShown(shown);
  }

  handleKey(event: KeyboardEvent): void {
    this.navigate?.(event);
  }

  rects(): Record<string, Rect> {
    if (!this.navigate) return {};
    return { 'pause:resume': this.buttons[0].rect, 'pause:restart': this.buttons[1].rect, 'pause:menu': this.buttons[2].rect };
  }
}

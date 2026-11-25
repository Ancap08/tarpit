import type Phaser from 'phaser';
import type { BoonId, BoonOffer, Rect } from '../../sim';
import { contains } from '../input';
import type { Layout } from '../layout';
import { BOON_NAMES, REWARD_KEYS, boonDescription, rewardTitle } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import { ink, panel, THEME } from './theme';
import { CANCEL_UI_PRESS } from './button';
import { drawBoonIcon } from './boonIcons';
import { CLEAN, SANS, rounded, skinFor, textMetrics } from './newTheme';
import { heldBoonLayout, rewardLayout } from './boonLayout';

const HELD_DEPTH = 5;
const REWARD_DEPTH = 7;
const DETAIL_MS = 2800;

function label(scene: Phaser.Scene, px: number, color: string, bold = false): Phaser.GameObjects.Text {
  const clean = skinFor(scene) === 'battle';
  return scene.add.text(0, 0, '', { fontFamily: clean ? SANS : FONT, fontSize: `${px}px`,
    color: clean ? CLEAN.ink : color, fontStyle: bold ? 'bold' : 'normal',
    ...(clean ? { metrics: textMetrics(px) } : {}),
  });
}

/** A fixed set of reward choices over the map. GameScene owns selection and the simulation. */
export class BoonReward {
  private readonly view: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly geo: ReturnType<typeof rewardLayout>;
  private readonly cards: { card: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.Text; effect: Phaser.GameObjects.Text }[];
  private offer: BoonOffer | null = null;

  constructor(scene: Phaser.Scene, layout: Layout, onPick: (id: BoonId) => void) {
    const clean = skinFor(scene) === 'battle';
    const m = layout.map;
    this.geo = rewardLayout(layout, clean);
    this.view = scene.add.container(0, 0).setDepth(REWARD_DEPTH).setVisible(false);
    const veil = scene.add.rectangle(m.x, m.y, m.width, m.height, COLORS.endVeil, 0.8).setOrigin(0);
    this.title = label(scene, 30, TEXT.hud, true).setOrigin(0.5).setPosition(this.geo.title.x, this.geo.title.y);
    this.view.add([veil, this.title]);
    const origin = layout.kind === 'portrait' ? 0 : 0.5;
    this.cards = this.geo.cards.map((r, i) => {
      const { icon: g, name: n, description: d } = this.geo;
      const card = scene.add.rectangle(r.x, r.y, r.width, r.height, THEME.paper).setOrigin(0)
        .setStrokeStyle(2, COLORS.menuEdge).setInteractive({ useHandCursor: true });
      const print = scene.add.graphics();
      const paint = (state: 'normal' | 'hover' | 'press' = 'normal') => {
        print.clear();
        if (clean) rounded(print, r, state === 'press' ? 0x2b5051 : state === 'hover' ? CLEAN.raised : CLEAN.panel);
        else panel(print, r, state === 'press' ? COLORS.rewardPressed : state === 'hover' ? COLORS.rewardHover : THEME.paper);
      };
      if (clean) card.setFillStyle(0, 0).setStrokeStyle();
      paint();
      const centerX = r.x + g.x;
      const centerY = r.y + g.y;
      const tile = scene.add.circle(centerX, centerY, 19 * g.scale, clean ? CLEAN.raised : COLORS.button)
        .setStrokeStyle(1.5, clean ? CLEAN.edge : COLORS.menuEdge);
      const icon = scene.add.graphics().setPosition(centerX, centerY).setScale(g.scale);
      const name = label(scene, n.font, ink, true).setOrigin(origin, 0.5).setPosition(r.x + n.x, r.y + n.y);
      const effect = label(scene, d.font, ink).setOrigin(origin, 0.5).setPosition(r.x + d.x, r.y + d.y)
        .setAlign(layout.kind === 'portrait' ? 'left' : 'center').setWordWrapWidth(this.geo.textWidth, true);
      this.view.add([card, print, tile, icon, name, effect]);
      if (layout.kind === 'landscape') {
        const keyX = r.x + 22;
        const keyY = r.y + 22;
        const keycap = scene.add.rectangle(keyX, keyY, 23, 23, COLORS.hudBar).setStrokeStyle(1, COLORS.menuEdge);
        const key = label(scene, 14, TEXT.hud, true).setOrigin(0.5).setPosition(keyX, keyY).setText(REWARD_KEYS[i]);
        this.view.add([keycap, key]);
      }
      let pressed = false;
      scene.input.on(CANCEL_UI_PRESS, () => { pressed = false; });
      card.on('pointerover', () => paint('hover'));
      card.on('pointerout', () => {
        pressed = false;
        paint();
      });
      card.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        pressed = true;
        paint('press');
      });
      card.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        const id = this.offer?.options[i];
        const pick = pressed && id !== undefined;
        pressed = false;
        paint();
        if (pick) onPick(id);
      });
      if (card.input) card.input.enabled = false;
      return { card, icon, name, effect };
    });
  }

  update(offer: BoonOffer | null | undefined): void {
    const next = offer ?? null;
    if (next === this.offer) return;
    this.offer = next;
    this.view.setVisible(next !== null);
    this.cards.forEach(({ card }, i) => {
      if (card.input) card.input.enabled = next?.options[i] !== undefined;
    });
    if (!next) return;
    this.title.setText(rewardTitle(next.wave));
    next.options.forEach((id, i) => {
      const { icon, name, effect } = this.cards[i];
      icon.clear();
      drawBoonIcon(icon, id);
      name.setText(BOON_NAMES[id]);
      effect.setText(boonDescription(id));
    });
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries(this.offer?.options.map((id, i) => [`reward:${id}`, { ...this.geo.cards[i] }]) ?? []);
  }
}

/** Held boons stay in the HUD. Hover or tap an icon to briefly see its effect. */
export class HeldBoons {
  private geo: ReturnType<typeof heldBoonLayout>;
  private readonly icons: { view: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Graphics; box: Phaser.GameObjects.Rectangle; backing?: Phaser.GameObjects.Graphics }[];
  private readonly detail: Phaser.GameObjects.Container;
  private readonly name: Phaser.GameObjects.Text;
  private readonly effect: Phaser.GameObjects.Text;
  private ids: readonly BoonId[] = [];
  private readonly clean: boolean;
  private hovered: BoonId | null = null;
  private tapped: BoonId | null = null;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout) {
    this.clean = skinFor(scene) === 'battle';
    this.geo = heldBoonLayout(layout, scene.scale.parentSize, this.clean);
    this.icons = this.geo.slots.map((r, i) => {
      const view = scene.add.container(r.x, r.y).setDepth(HELD_DEPTH).setVisible(false);
      const box = scene.add.rectangle(0, 0, r.width, r.height, COLORS.button).setOrigin(0)
        .setStrokeStyle(1.5, COLORS.menuEdge).setInteractive({ useHandCursor: true });
      const icon = scene.add.graphics().setPosition(r.width / 2, r.height / 2).setScale(r.width / 46);
      const backing = this.clean ? scene.add.graphics() : undefined;
      if (backing) {
        box.setFillStyle(0, 0).setStrokeStyle();
        rounded(backing, { ...r, x: 0, y: 0 }, CLEAN.raised);
        view.add(backing);
      }
      view.add([box, icon]);
      if (box.input) box.input.enabled = false;
      let pressed = false;
      scene.input.on(CANCEL_UI_PRESS, () => { pressed = false; });
      box.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch) return;
        this.hovered = this.ids[i] ?? null;
        this.refresh();
        this.startTimer(scene);
      });
      box.on('pointerout', () => {
        pressed = false;
        if (this.hovered === this.ids[i]) this.hovered = null;
        this.refresh();
      });
      box.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        pressed = true;
      });
      box.on('pointerup', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        if (!pressed) return;
        event.stopPropagation();
        pressed = false;
        const id = this.ids[i];
        if (id === undefined) return;
        if (pointer.wasTouch && this.tapped === id) {
          this.dismiss();
          return;
        }
        this.tapped = id;
        this.refresh();
        this.startTimer(scene);
      });
      return { view, icon, box, backing };
    });
    const r = this.geo.tooltip;
    const bg = scene.add.graphics();
    if (this.clean) rounded(bg, { ...r, x: 0, y: 0 });
    else panel(bg, { ...r, x: 0, y: 0 });
    this.name = label(scene, this.clean && layout.turned ? 24 : 20, ink, true).setOrigin(0, 0.5).setPosition(14, r.height * 0.3);
    this.effect = label(scene, this.clean && layout.turned ? 23 : this.geo.descriptionFont, ink).setOrigin(0, 0.5).setPosition(14, r.height * 0.68)
      .setWordWrapWidth(r.width - 28, true);
    this.detail = scene.add.container(r.x, r.y, [bg, this.name, this.effect]).setDepth(HELD_DEPTH).setVisible(false);
    scene.scale.on('resize', this.fit, this);
    scene.events.once('shutdown', () => {
      scene.scale.off('resize', this.fit, this);
      this.dismiss();
      // On rotation the next layout already owns the canvas size.
      if (scene.scale.height === layout.height && scene.scale.width !== layout.width) {
        scene.scale.setGameSize(layout.width, layout.height);
      }
    });
  }

  get tooltip(): BoonId | null {
    return this.hovered ?? this.tapped;
  }

  dismiss(): void {
    this.timer?.remove(false);
    this.timer = null;
    if (this.tooltip === null) return;
    this.hovered = null;
    this.tapped = null;
    this.refresh();
  }

  update(ids: readonly BoonId[]): void {
    if (ids.length === this.ids.length && ids.every((id, i) => id === this.ids[i])) return;
    this.ids = [...ids];
    this.fit();
    this.dismiss();
    this.icons.forEach(({ view, icon, box }, i) => {
      const id = ids[i];
      view.setVisible(id !== undefined);
      if (box.input) box.input.enabled = id !== undefined;
      if (id === undefined) return;
      icon.clear();
      drawBoonIcon(icon, id);
    });
  }

  contains(x: number, y: number): boolean {
    return (this.tooltip !== null && contains(this.geo.tooltip, x, y)) ||
      this.ids.some((_, i) => contains(this.geo.slots[i], x, y));
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries(this.ids.map((id, i) => [`boon:${id}`, { ...this.geo.slots[i] }]));
  }

  /** Refit the actual input boxes on a pick, rotation or same-orientation resize. */
  private fit(): void {
    const scale = this.scene.scale;
    if (scale.height !== this.layout.height) return;
    const geo = heldBoonLayout(this.layout, scale.parentSize, this.clean);
    this.geo = geo;
    this.icons.forEach(({ view, icon, box, backing }, i) => {
      const r = geo.slots[i];
      view.setPosition(r.x, r.y);
      box.setSize(r.width, r.height);
      if (backing) rounded(backing.clear(), { ...r, x: 0, y: 0 }, CLEAN.raised);
      icon.setPosition(r.width / 2, r.height / 2).setScale(r.width / 46);
    });
    const width = this.ids.length > 0 ? geo.canvasWidth : this.layout.width;
    if (scale.width !== width) scale.setGameSize(width, this.layout.height);
  }

  private startTimer(scene: Phaser.Scene): void {
    this.timer?.remove(false);
    this.timer = scene.time.delayedCall(DETAIL_MS, () => this.dismiss());
  }

  private refresh(): void {
    const id = this.tooltip;
    this.detail.setVisible(id !== null);
    for (const [i, { box }] of this.icons.entries()) {
      if (this.clean) continue;
      const active = id !== null && id === this.ids[i];
      box.setFillStyle(active ? COLORS.buttonHover : COLORS.button)
        .setStrokeStyle(1.5, active ? COLORS.buttonEdgePicked : COLORS.menuEdge);
    }
    if (id === null) return;
    this.name.setText(BOON_NAMES[id]);
    this.effect.setText(boonDescription(id));
  }
}

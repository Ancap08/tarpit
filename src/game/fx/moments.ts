import { uiBounds, uiObject } from '../ui/devicePixels';
import { panel, THEME } from '../ui/theme';
import type Phaser from 'phaser';
import type { Rect } from '../input';
import { ACT_ONE_LAST_WAVE, SPECIAL_DEFS, specialAllowed, type GameState, type GameEvent, type MapDef } from '../../sim';
import { sound } from '../audio/engine';
import { CLEAN_SIEGE_PHONE_HEADER, fontPx, type Layout } from '../layout';
import { ACT_TWO_TEXT, BARRICADE_UNLOCKED, BARRICADE_UNLOCK_HINT, BOON_NAMES, BOSS_BANNER_SUB, GRUMBLEMAW_SUB, GUARDS_UNLOCKED, GUARDS_UNLOCK_HINT, ENEMY_NAMES, PACK_CALL_TEXT, REWARD_PICKED_TEXT, waveStartBanner, waveClearBanner, bonusGoldText } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import { battleFont, battleWeight, rounded, skinFor, textMetrics } from '../ui/newTheme';
import { DeviceTextFit, textSlot } from '../ui/deviceText';
import { BannerQueue } from './fxMath';

let showedBarricadeUnlock = false;
let showedGuardsUnlock = false;
const PANEL_GUTTER = 8;
const TEXT_PAD_X = 24;

/** The same single banner queue and cave signal in play and frozen browser frames. */
export class Moments {
  private readonly banners = new BannerQueue();
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly bannerSub: Phaser.GameObjects.Text;
  private readonly bannerBg: Phaser.GameObjects.Graphics;
  private bannerKey = '';
  private readonly cave: Phaser.GameObjects.Graphics;
  private readonly clean: boolean;
  private packAt = -Infinity;
  private now = 0;
  private readonly headingFit = new DeviceTextFit();
  private readonly subFit = new DeviceTextFit();
  private scale = 0;
  private plate?: Rect;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, private readonly map: MapDef) {
    const clean = this.clean = skinFor(scene) === 'battle';
    this.cave = layout.placeWorld(scene.add.graphics());
    this.bannerBg = this.scene.add.graphics();
    if (clean) uiObject(this.bannerBg);
    this.bannerText = this.scene.add
      .text(this.bannerX, 0, '', { fontFamily: clean ? battleFont() : FONT, fontSize: '30px', fontStyle: clean ? battleWeight(true) : 'bold', color: TEXT.waveBanner })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.bannerSub = this.scene.add
      .text(this.bannerX, 0, '', { fontFamily: clean ? battleFont() : FONT, fontSize: clean && layout.turned ? '24px' : fontPx(this.layout, 17),
        ...(clean ? { metrics: textMetrics(layout.turned ? 24 : 17) } : {}), fontStyle: clean ? battleWeight(false, 'bold') : 'bold', color: TEXT.waveBannerSub })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    if (clean) {
      const width = layout.map.width - 2 * (PANEL_GUTTER + TEXT_PAD_X);
      this.bannerText.setWordWrapWidth(width, true).setAlign('center');
      this.bannerSub.setWordWrapWidth(width, true).setAlign('center');
    }
  }

  get screenObjects(): Phaser.GameObjects.GameObject[] {
    return [this.bannerBg, this.bannerText, this.bannerSub];
  }

  /** The banners' centre line: the middle of the map on the screen. */
  private get bannerX(): number {
    return this.layout.map.x + this.layout.map.width / 2;
  }

  onEvents(events: readonly GameEvent[], now: number, live: boolean, state: GameState): void {
    for (const e of events) {
      switch (e.kind) {
        case 'boonOffered':
          this.banners.clear();
          sound.play('boonOffer');
          break;
        case 'boonPicked':
          this.banners.push({ text: BOON_NAMES[e.id], sub: REWARD_PICKED_TEXT, big: false }, now);
          sound.play('boonPick');
          break;
        case 'waveStart':
          if (e.wave === ACT_ONE_LAST_WAVE + 1) {
            this.banners.push({ text: ACT_TWO_TEXT, sub: waveStartBanner(e.wave), big: false }, now);
            sound.play('act2');
          } else if (e.wave === SPECIAL_DEFS.barricade.unlockWave && specialAllowed(state, 'barricade') && !showedBarricadeUnlock) {
            showedBarricadeUnlock = true;
            this.banners.push({ text: BARRICADE_UNLOCKED, sub: BARRICADE_UNLOCK_HINT, big: false }, now);
          } else if (e.wave === SPECIAL_DEFS.guards.unlockWave && specialAllowed(state, 'guards') && !showedGuardsUnlock) {
            showedGuardsUnlock = true;
            this.banners.push({ text: GUARDS_UNLOCKED, sub: GUARDS_UNLOCK_HINT, big: false }, now);
          } else if (live) this.banners.push({ text: waveStartBanner(e.wave), sub: '', big: false }, now);
          break;
        case 'waveClear':
          if (live) this.banners.push({ text: waveClearBanner(e.wave), sub: e.bonus > 0 ? bonusGoldText(e.bonus) : '', big: false }, now);
          break;
        case 'bossSpawn':
          if (live || e.enemyType === 'grumblemaw') {
            this.banners.push({ text: ENEMY_NAMES[e.enemyType], sub: e.enemyType === 'boss' ? BOSS_BANNER_SUB : GRUMBLEMAW_SUB, big: true }, now);
          }
          break;
        case 'packCall':
          this.packAt = now;
          this.banners.push({ text: PACK_CALL_TEXT, sub: '', big: false }, now);
          sound.play('packCall');
          break;
        case 'won':
        case 'lost':
          this.banners.clear();
          break;
      }
    }
  }

  get text(): string | null {
    return this.banners.current(this.now)?.banner.text ?? null;
  }

  get pending(): number {
    return this.banners.pending;
  }

  get packCue(): boolean {
    return this.now - this.packAt < 1100;
  }

  advance(now: number): void {
    this.now = now;
    this.banners.update(now);
  }

  draw(now: number): void {
    this.advance(now);
    this.cave.clear();
    if (this.packCue) {
      const t = (now - this.packAt) / 1100;
      const spawn = this.map.path[0];
      for (const radius of [19, 32, 45]) {
        this.cave.lineStyle(6, COLORS.fxDark, 1 - t).strokeCircle(spawn.x, spawn.y, radius + 12 * t);
        this.cave.lineStyle(3, COLORS.bossBurst, 1 - t).strokeCircle(spawn.x, spawn.y, radius + 12 * t);
      }
    }
    const cur = this.banners.current(now);
    const key = cur === null ? '' : `${cur.banner.text}|${cur.banner.sub}|${cur.banner.big}`;
    const scale = this.scene.scale.displayScale.y;
    if (key !== this.bannerKey || (this.clean && cur && scale !== this.scale)) {
      this.bannerKey = key;
      this.scale = scale;
      this.bannerBg.clear();
      if (cur === null) {
        this.bannerText.setVisible(false);
        this.bannerSub.setVisible(false);
      } else {
        const b = cur.banner;
        const top = this.clean && this.map.id === 'keep' && this.layout.turned ? CLEAN_SIEGE_PHONE_HEADER : this.layout.map.y;
        const y = top + (b.big ? 200 : 150);
        const size = b.big ? 44 : 30;
        this.bannerText.setText(b.text);
        if (!this.clean) this.bannerText.setFontSize(size);
        this.bannerText
          .setColor(b.big ? TEXT.bossBanner : TEXT.waveBanner)
          .setY(y)
          .setVisible(true);
        this.bannerSub.setText(b.sub).setVisible(b.sub !== '');
        const maxWidth = this.layout.map.width - 2 * (PANEL_GUTTER + TEXT_PAD_X);
        if (!this.clean) {
          for (const line of [this.bannerText, this.bannerSub]) {
            line.setScale(Math.min(1, maxWidth / Math.max(1, line.width)));
          }
        }
        const map = this.layout.map;
        const area = { x: map.x + PANEL_GUTTER, y: y - 55, width: map.width - 2 * PANEL_GUTTER, height: 110 };
        if (this.clean) {
          const slot = textSlot(this.bannerText, area, true);
          slot.width = Math.min(slot.width, maxWidth);
          this.bannerText.setVisible(this.headingFit.fit(size, [slot]));
        }
        const headingBottom = y + (this.bannerText.visible ? this.bannerText.displayHeight / 2 : 0);
        this.bannerSub.setY(Math.max(y + (b.big ? 36 : 28), headingBottom + 2 + this.bannerSub.displayHeight / 2));
        if (this.clean && b.sub) {
          const slot = textSlot(this.bannerSub, { ...area, y: y - 55, height: 190 }, true);
          slot.width = Math.min(slot.width, maxWidth);
          this.bannerSub.setVisible(this.subFit.fit(this.layout.turned ? 24 : 17, [slot]));
          this.bannerSub.setY(Math.max(y + (b.big ? 36 : 28), headingBottom + 2 + this.bannerSub.displayHeight / 2));
        }
        const w = Math.max(this.bannerText.visible ? this.bannerText.displayWidth : 0, this.bannerSub.visible ? this.bannerSub.displayWidth : 0) + 2 * TEXT_PAD_X;
        const panelTop = Math.min(y - 30, y - (this.bannerText.visible ? this.bannerText.displayHeight / 2 : 0) - 4);
        const contentBottom = this.bannerSub.visible ? this.bannerSub.y + this.bannerSub.displayHeight / 2 : headingBottom;
        const bottom = Math.max(y - 30 + (b.sub === '' ? 52 : b.big ? 100 : 84), contentBottom + 4);
        const rect = { x: this.bannerX - w / 2, y: panelTop, width: w, height: bottom - panelTop };
        if (this.clean) {
          this.plate = rect;
          uiBounds(this.bannerBg, rect);
          rounded(this.bannerBg, this.plate);
        }
        else panel(this.bannerBg, rect, b.big ? THEME.red : THEME.blue);
      }
    }
    if (cur !== null) {
      this.bannerText.setAlpha(cur.alpha);
      this.bannerSub.setAlpha(cur.alpha);
      this.bannerBg.setAlpha(cur.alpha);
    }
  }
}

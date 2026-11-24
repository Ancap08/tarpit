import { panel, THEME } from '../ui/theme';
import type Phaser from 'phaser';
import { ACT_ONE_LAST_WAVE, SPECIAL_DEFS, specialAllowed, type GameState, type GameEvent, type MapDef } from '../../sim';
import { sound } from '../audio/engine';
import { fontPx, type Layout } from '../layout';
import { ACT_TWO_TEXT, BARRICADE_UNLOCKED, BARRICADE_UNLOCK_HINT, BOON_NAMES, BOSS_BANNER_SUB, GRUMBLEMAW_SUB, GUARDS_UNLOCKED, GUARDS_UNLOCK_HINT, ENEMY_NAMES, PACK_CALL_TEXT, REWARD_PICKED_TEXT, waveStartBanner, waveClearBanner, bonusGoldText } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
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
  private packAt = -Infinity;
  private now = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, private readonly map: MapDef) {
    this.cave = layout.placeWorld(scene.add.graphics());
    this.bannerBg = this.scene.add.graphics();
    this.bannerText = this.scene.add
      .text(this.bannerX, 0, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: TEXT.waveBanner })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.bannerSub = this.scene.add
      .text(this.bannerX, 0, '', { fontFamily: FONT, fontSize: fontPx(this.layout, 17), fontStyle: 'bold', color: TEXT.waveBannerSub })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
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
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      this.bannerBg.clear();
      if (cur === null) {
        this.bannerText.setVisible(false);
        this.bannerSub.setVisible(false);
      } else {
        const b = cur.banner;
        const y = this.layout.map.y + (b.big ? 200 : 150);
        this.bannerText
          .setText(b.text)
          .setFontSize(b.big ? 44 : 30)
          .setColor(b.big ? TEXT.bossBanner : TEXT.waveBanner)
          .setY(y)
          .setVisible(true);
        this.bannerSub.setText(b.sub).setVisible(b.sub !== '');
        const maxWidth = this.layout.map.width - 2 * (PANEL_GUTTER + TEXT_PAD_X);
        for (const line of [this.bannerText, this.bannerSub]) {
          line.setScale(Math.min(1, maxWidth / Math.max(1, line.width)));
        }
        const headingBottom = y + this.bannerText.displayHeight / 2;
        this.bannerSub.setY(Math.max(y + (b.big ? 36 : 28), headingBottom + 2 + this.bannerSub.displayHeight / 2));
        const w = Math.max(this.bannerText.displayWidth, this.bannerSub.displayWidth) + 2 * TEXT_PAD_X;
        const top = Math.min(y - 30, y - this.bannerText.displayHeight / 2 - 4);
        const contentBottom = this.bannerSub.visible ? this.bannerSub.y + this.bannerSub.displayHeight / 2 : headingBottom;
        const bottom = Math.max(y - 30 + (b.sub === '' ? 52 : b.big ? 100 : 84), contentBottom + 4);
        panel(this.bannerBg, { x: this.bannerX - w / 2, y: top, width: w, height: bottom - top }, b.big ? THEME.red : THEME.blue);
      }
    }
    if (cur !== null) {
      this.bannerText.setAlpha(cur.alpha);
      this.bannerSub.setAlpha(cur.alpha);
      this.bannerBg.setAlpha(cur.alpha);
    }
  }
}

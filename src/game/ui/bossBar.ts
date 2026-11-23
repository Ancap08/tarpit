// HUD boss bar (milestone 23, docs/SCOPE-v4.md): while the boss lives, a
// 300 x 14 bar centred at the top of the map with a dark trough, a red fill
// proportional to his hp, a 1 px cream border and his hp right-aligned
// inside ("4000 / 4000"), and his name (names.ts BOSS_NAME) in 14 px on a
// dark pill above the bar's left end. Hidden otherwise. The bar sits at
// y 24 rather than flush at the map top so the 18 px name pill fits above
// it (y 4 to 22) inside the canvas.

import type Phaser from 'phaser';
import { enemyMaxHp, isBoss, type GameState } from '../../sim';
import { ENEMY_NAMES } from '../names';
import { LANDSCAPE, PORTRAIT_MIN_FONT, type Layout } from '../layout';
import { COLORS, FONT, TEXT } from '../palette';

export const BOSS_BAR = { x: 330, y: 24, width: 300, height: 14 } as const;
/** The name pill: 18 px tall, ending 2 px above the bar, flush with its left end. */
export const BOSS_PILL = { y: 4, height: 18, padX: 6 } as const;
export const BOSS_NAME_SIZE = 14;
export const BOSS_HP_SIZE = 11;

/** The bar's geometry: the bar, the name pill above it and the two text sizes. */
export interface BossBarGeometry {
  bar: { x: number; y: number; width: number; height: number };
  pill: { y: number; height: number; padX: number };
  nameSize: number;
  hpSize: number;
}

/**
 * Where the boss bar goes in `layout` (milestone 32b): landscape as above;
 * portrait a 360 px bar 30 px under the map's top edge, with 18 px text
 * (the hp count inside the bar), centred across the 480 px map.
 */
export function bossBarGeometry(layout: Layout): BossBarGeometry {
  if (layout.kind === 'landscape') return { bar: { ...BOSS_BAR }, pill: { ...BOSS_PILL }, nameSize: BOSS_NAME_SIZE, hpSize: BOSS_HP_SIZE };
  const m = layout.map;
  const width = 360;
  return {
    bar: { x: m.x + (m.width - width) / 2, y: m.y + 34, width, height: 22 },
    pill: { y: m.y + 6, height: 26, padX: 6 },
    nameSize: PORTRAIT_MIN_FONT,
    hpSize: PORTRAIT_MIN_FONT,
  };
}

export interface BossBarInfo {
  name: string;
  /** "4000 / 4000": hp rounded up, so a live boss never shows 0. */
  hpText: string;
  /** Fill fraction in [0, 1]. */
  fraction: number;
}

/** What the boss bar shows, or null while no boss is alive. */
export function bossBarInfo(state: GameState): BossBarInfo | null {
  const boss = state.enemies.find(isBoss);
  if (!boss) return null;
  const max = boss.maxHp ?? enemyMaxHp(boss.type, state.difficulty);
  const hp = Math.max(0, boss.hp);
  return { name: ENEMY_NAMES[boss.type], hpText: `${Math.ceil(hp)} / ${max}`, fraction: Math.min(1, hp / max) };
}

/** The HUD's boss label text (hudText().boss): name and hp, or null when hidden. */
export function bossLabel(info: BossBarInfo | null): string | null {
  return info === null ? null : `${info.name} ${info.hpText}`;
}

export class BossBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly hp: Phaser.GameObjects.Text;
  private info: BossBarInfo | null = null;
  private readonly geo: BossBarGeometry;

  constructor(scene: Phaser.Scene, layout: Layout = LANDSCAPE) {
    const geo = bossBarGeometry(layout);
    const { bar: BOSS_BAR, pill: BOSS_PILL } = geo;
    this.geo = geo;
    this.g = scene.add.graphics();
    this.name = scene.add
      .text(BOSS_BAR.x + BOSS_PILL.padX, BOSS_PILL.y + BOSS_PILL.height / 2, '', {
        fontFamily: FONT,
        fontSize: `${geo.nameSize}px`,
        fontStyle: 'bold',
        color: TEXT.bossName,
      })
      .setOrigin(0, 0.5);
    this.hp = scene.add
      .text(BOSS_BAR.x + BOSS_BAR.width - 4, BOSS_BAR.y + BOSS_BAR.height / 2, '', {
        fontFamily: FONT,
        fontSize: `${geo.hpSize}px`,
        fontStyle: 'bold',
        color: TEXT.bossHp,
      })
      .setOrigin(1, 0.5);
    this.setVisible(false);
  }

  private setVisible(on: boolean): void {
    this.g.setVisible(on);
    this.name.setVisible(on);
    this.hp.setVisible(on);
  }

  update(state: GameState): void {
    const info = bossBarInfo(state);
    this.info = info;
    if (info === null) {
      this.setVisible(false);
      return;
    }
    if (this.name.text !== info.name) {
      this.name.setText(info.name);
      this.name.setScale(Math.min(1, this.geo.pill.height / this.name.height));
    }
    if (this.hp.text !== info.hpText) {
      this.hp.setText(info.hpText);
      this.hp.setScale(Math.min(1, this.geo.bar.height / this.hp.height));
    }
    const { x, y, width, height } = this.geo.bar;
    const BOSS_PILL = this.geo.pill;
    const g = this.g;
    g.clear();
    // Name pill, sized to the name.
    g.fillStyle(COLORS.bossNamePill, 0.85);
    g.fillRoundedRect(x, BOSS_PILL.y, Math.ceil(this.name.displayWidth) + 2 * BOSS_PILL.padX, BOSS_PILL.height, 5);
    // Border, trough, fill.
    g.fillStyle(COLORS.bossBarEdge, 1);
    g.fillRect(x - 1, y - 1, width + 2, height + 2);
    g.fillStyle(COLORS.bossBarBg, 1);
    g.fillRect(x, y, width, height);
    const fill = Math.round(width * info.fraction);
    if (fill > 0) {
      g.fillStyle(COLORS.bossBarFill, 1);
      g.fillRect(x, y, fill, height);
    }
    this.setVisible(true);
  }

  /** The label text while shown, else null. */
  label(): string | null {
    return bossLabel(this.info);
  }
}

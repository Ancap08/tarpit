// HUD boss bar (milestone 23, docs/SCOPE-v4.md): while the boss lives, a
// 300 x 14 bar centred at the top of the map with a dark trough, a red fill
// proportional to his hp, a 1 px cream border and his hp right-aligned
// inside ("4000 / 4000"), and his name (names.ts BOSS_NAME) in 14 px on a
// dark pill above the bar's left end. Hidden otherwise. The bar sits at
// y 24 rather than flush at the map top so the 18 px name pill fits above
// it (y 4 to 22) inside the canvas.

import type Phaser from 'phaser';
import { ENEMY_STATS, isBoss, type GameState } from '../../sim';
import { BOSS_NAME } from '../names';
import { COLORS, FONT, TEXT } from '../palette';

export const BOSS_BAR = { x: 330, y: 24, width: 300, height: 14 } as const;
/** The name pill: 18 px tall, ending 2 px above the bar, flush with its left end. */
export const BOSS_PILL = { y: 4, height: 18, padX: 6 } as const;
export const BOSS_NAME_SIZE = 14;
export const BOSS_HP_SIZE = 11;

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
  const max = ENEMY_STATS[boss.type].hp;
  const hp = Math.max(0, boss.hp);
  return { name: BOSS_NAME, hpText: `${Math.ceil(hp)} / ${max}`, fraction: Math.min(1, hp / max) };
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

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.name = scene.add
      .text(BOSS_BAR.x + BOSS_PILL.padX, BOSS_PILL.y + BOSS_PILL.height / 2, '', {
        fontFamily: FONT,
        fontSize: `${BOSS_NAME_SIZE}px`,
        fontStyle: 'bold',
        color: TEXT.bossName,
      })
      .setOrigin(0, 0.5);
    this.hp = scene.add
      .text(BOSS_BAR.x + BOSS_BAR.width - 4, BOSS_BAR.y + BOSS_BAR.height / 2, '', {
        fontFamily: FONT,
        fontSize: `${BOSS_HP_SIZE}px`,
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
    if (this.name.text !== info.name) this.name.setText(info.name);
    if (this.hp.text !== info.hpText) this.hp.setText(info.hpText);
    const { x, y, width, height } = BOSS_BAR;
    const g = this.g;
    g.clear();
    // Name pill, sized to the name.
    g.fillStyle(COLORS.bossNamePill, 0.85);
    g.fillRoundedRect(x, BOSS_PILL.y, Math.ceil(this.name.width) + 2 * BOSS_PILL.padX, BOSS_PILL.height, 5);
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

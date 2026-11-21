import { describe, expect, it } from 'vitest';
import { createGame, ENEMY_STATS, type Enemy } from '../../sim';
import { BOSS_NAME } from '../names';
import { BOSS_BAR, BOSS_PILL, bossBarInfo, bossLabel } from './bossBar';

const boss = (hp: number): Enemy => ({ id: 41, type: 'boss', hp, distance: 10, slow: 0, slowTicksLeft: 0 });
const goblin: Enemy = { id: 1, type: 'goblin', hp: 30, distance: 5, slow: 0, slowTicksLeft: 0 };

describe('boss bar (milestone 23)', () => {
  it('is hidden with no boss alive', () => {
    expect(bossBarInfo({ ...createGame(), enemies: [goblin] })).toBeNull();
    expect(bossLabel(null)).toBeNull();
  });

  it('shows the name and "hp / max" with a proportional fill', () => {
    const full = bossBarInfo({ ...createGame(), enemies: [goblin, boss(ENEMY_STATS.boss.hp)] });
    expect(full).toEqual({ name: BOSS_NAME, hpText: '4000 / 4000', fraction: 1 });
    expect(bossLabel(full)).toBe(`${BOSS_NAME} 4000 / 4000`);
    const hurt = bossBarInfo({ ...createGame(), enemies: [boss(1000)] });
    expect(hurt).toEqual({ name: BOSS_NAME, hpText: '1000 / 4000', fraction: 0.25 });
  });

  it('rounds fractional (burn) hp up, so a live boss never reads 0', () => {
    expect(bossBarInfo({ ...createGame(), enemies: [boss(0.2)] })?.hpText).toBe('1 / 4000');
    expect(bossBarInfo({ ...createGame(), enemies: [boss(2999.5)] })?.hpText).toBe('3000 / 4000');
  });

  it('measures against the level\'s full hp (milestone 25): 3000 on Easy, 5200 on Hard', () => {
    expect(bossBarInfo({ ...createGame({ difficulty: 'easy' }), enemies: [boss(3000)] })).toEqual({ name: BOSS_NAME, hpText: '3000 / 3000', fraction: 1 });
    expect(bossBarInfo({ ...createGame({ difficulty: 'hard' }), enemies: [boss(1300)] })).toEqual({ name: BOSS_NAME, hpText: '1300 / 5200', fraction: 0.25 });
  });

  it('is 300 x 14, centred on the 960 px map, with the name pill above it inside the canvas', () => {
    expect(BOSS_BAR.width).toBe(300);
    expect(BOSS_BAR.height).toBe(14);
    expect(BOSS_BAR.x + BOSS_BAR.width / 2).toBe(480);
    expect(BOSS_PILL.y).toBeGreaterThanOrEqual(0);
    expect(BOSS_PILL.y + BOSS_PILL.height).toBeLessThan(BOSS_BAR.y - 1); // clear of the 1 px border
  });
});

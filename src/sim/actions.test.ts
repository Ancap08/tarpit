import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, upgradeTower } from './actions';
import { createGame, startWave } from './game';
import { sellRefund } from './towers';

describe('buildTower', () => {
  it('builds a musketeer: 100 - 50 = 50 gold, spent 50, cooldown 0', () => {
    const s = createGame();
    const r = buildTower(s, 0, 'musketeer');
    expect(r).toEqual({
      ok: true,
      gold: 50,
      tower: { spotId: 0, type: 'musketeer', upgraded: false, cooldownTicks: 0, spent: 50 },
    });
    expect(s.gold).toBe(50);
    expect(s.towers).toHaveLength(1);
  });

  it('charges 80 for a cannon and 60 for a tar pit', () => {
    const s = createGame();
    s.gold = 140;
    expect(buildTower(s, 1, 'cannon')).toMatchObject({ ok: true, gold: 60 });
    expect(buildTower(s, 2, 'tarpit')).toMatchObject({ ok: true, gold: 0 });
  });

  it('keeps towers sorted by spotId', () => {
    const s = createGame();
    s.gold = 1000;
    for (const id of [7, 2, 9, 0]) buildTower(s, id, 'musketeer');
    expect(s.towers.map((t) => t.spotId)).toEqual([0, 2, 7, 9]);
  });

  it('refuses unknown spots', () => {
    const s = createGame();
    for (const id of [-1, 10, 1.5]) {
      expect(buildTower(s, id, 'musketeer')).toEqual({ ok: false, reason: 'unknown-spot' });
    }
    expect(s.gold).toBe(100);
  });

  it('refuses an occupied spot', () => {
    const s = createGame();
    buildTower(s, 3, 'musketeer');
    expect(buildTower(s, 3, 'tarpit')).toEqual({ ok: false, reason: 'spot-occupied' });
    expect(s.gold).toBe(50);
  });

  it('refuses when gold is short, and allows exactly enough', () => {
    const s = createGame();
    s.gold = 79;
    expect(buildTower(s, 0, 'cannon')).toEqual({ ok: false, reason: 'not-enough-gold' });
    s.gold = 80;
    expect(buildTower(s, 0, 'cannon')).toMatchObject({ ok: true, gold: 0 });
  });

  it('is allowed mid-wave', () => {
    const s = createGame();
    startWave(s);
    expect(buildTower(s, 0, 'musketeer')).toMatchObject({ ok: true });
  });
});

describe('upgradeTower', () => {
  it('upgrades a musketeer for 35: gold 15, spent 85', () => {
    const s = createGame();
    buildTower(s, 0, 'musketeer');
    const r = upgradeTower(s, 0);
    expect(r).toMatchObject({ ok: true, gold: 15, tower: { upgraded: true, spent: 85 } });
    expect(s.gold).toBe(15);
  });

  it('charges 60 for a cannon and 50 for a tar pit', () => {
    const s = createGame();
    s.gold = 80 + 60 + 60 + 50;
    buildTower(s, 0, 'cannon');
    buildTower(s, 1, 'tarpit');
    expect(upgradeTower(s, 0)).toMatchObject({ ok: true, gold: 50, tower: { spent: 140 } });
    expect(upgradeTower(s, 1)).toMatchObject({ ok: true, gold: 0, tower: { spent: 110 } });
  });

  it('refuses with no tower, when already upgraded, and when gold is short', () => {
    const s = createGame();
    expect(upgradeTower(s, 0)).toEqual({ ok: false, reason: 'no-tower' });
    expect(upgradeTower(s, 42)).toEqual({ ok: false, reason: 'no-tower' });
    buildTower(s, 0, 'musketeer'); // 50 left
    s.gold = 34;
    expect(upgradeTower(s, 0)).toEqual({ ok: false, reason: 'not-enough-gold' });
    s.gold = 100;
    upgradeTower(s, 0);
    expect(upgradeTower(s, 0)).toEqual({ ok: false, reason: 'already-upgraded' });
    expect(s.gold).toBe(65);
  });
});

describe('sellTower', () => {
  it('refunds floor(70%) of spent and frees the spot', () => {
    const s = createGame();
    buildTower(s, 0, 'musketeer');
    expect(sellTower(s, 0)).toEqual({ ok: true, refund: 35, gold: 85 });
    expect(s.towers).toEqual([]);
    expect(buildTower(s, 0, 'tarpit')).toMatchObject({ ok: true });
  });

  it('a 50 + 35 musketeer refunds 59', () => {
    const s = createGame();
    buildTower(s, 0, 'musketeer');
    upgradeTower(s, 0);
    expect(s.gold).toBe(15);
    expect(sellTower(s, 0)).toEqual({ ok: true, refund: 59, gold: 74 });
  });

  it('uses integer math: 90 refunds 63, not 62 from 90 * 0.7 in floating point', () => {
    expect(Math.floor(90 * 0.7)).toBe(62);
    expect(sellRefund(90)).toBe(63);
  });

  it('rounds down: cannon 80 -> 56, 140 -> 98; tar pit 60 -> 42, 110 -> 77', () => {
    expect([80, 140, 60, 110].map(sellRefund)).toEqual([56, 98, 42, 77]);
  });

  it('refuses with no tower', () => {
    const s = createGame();
    expect(sellTower(s, 0)).toEqual({ ok: false, reason: 'no-tower' });
  });
});

describe('game over', () => {
  it('refuses build, upgrade and sell once won or lost', () => {
    for (const phase of ['won', 'lost'] as const) {
      const s = createGame();
      buildTower(s, 0, 'musketeer');
      s.phase = phase;
      expect(buildTower(s, 1, 'musketeer')).toEqual({ ok: false, reason: 'game-over' });
      expect(upgradeTower(s, 0)).toEqual({ ok: false, reason: 'game-over' });
      expect(sellTower(s, 0)).toEqual({ ok: false, reason: 'game-over' });
      expect(s.gold).toBe(50);
      expect(s.towers).toHaveLength(1);
    }
  });
});

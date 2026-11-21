import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, upgradeTower } from './actions';
import { createGame, startWave } from './game';
import { sellRefund } from './towers';
import type { Cell } from './grid';

const cell = (col: number, row: number): Cell => ({ col, row });
// Buildable cells used below: off the path, inside the grid.
const A = cell(2, 5);
const B = cell(7, 5);
const C = cell(7, 7);

describe('buildTower', () => {
  it('builds a musketeer: 100 - 50 = 50 gold, spent 50, cooldown 0', () => {
    const s = createGame();
    const r = buildTower(s, A, 'musketeer');
    expect(r).toEqual({
      ok: true,
      gold: 50,
      tower: {
        cell: { col: 2, row: 5 },
        type: 'musketeer',
        upgraded: false,
        targeting: 'first',
        cooldownTicks: 0,
        spent: 50,
        locked: false,
        unlockedSpend: 50,
        upgradedThisPhase: false,
      },
    });
    expect(s.gold).toBe(50);
    expect(s.towers).toHaveLength(1);
  });

  it('charges 80 for a cannon and 60 for a tar pit', () => {
    const s = createGame();
    s.gold = 140;
    expect(buildTower(s, B, 'cannon')).toMatchObject({ ok: true, gold: 60 });
    expect(buildTower(s, C, 'tarpit')).toMatchObject({ ok: true, gold: 0 });
  });

  it('keeps towers sorted by cellKey (row, then column): the firing order', () => {
    const s = createGame();
    s.gold = 1000;
    for (const c of [cell(0, 9), cell(29, 0), cell(7, 5), cell(2, 5)]) buildTower(s, c, 'musketeer');
    expect(s.towers.map((t) => t.cell)).toEqual([cell(29, 0), cell(2, 5), cell(7, 5), cell(0, 9)]);
  });

  it('refuses cells outside the grid, on the path strip, or not integers', () => {
    const s = createGame();
    const bad = [
      cell(-1, 0),
      cell(30, 0),
      cell(0, 15),
      cell(0, -1),
      cell(1.5, 0),
      cell(0, Number.NaN),
      cell(0, 7), // on the first path segment (y 240 is this row's centre)
      cell(2, 6), // centre (80,208): 32 px from the path, inside the 36 px clearance
      cell(13, 7), // centre (432,240): 12 px from the x = 420 segment
    ];
    for (const c of bad) expect(buildTower(s, c, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(s.gold).toBe(100);
    expect(s.towers).toEqual([]);
  });

  it('refuses an occupied cell', () => {
    const s = createGame();
    buildTower(s, C, 'musketeer');
    expect(buildTower(s, { ...C }, 'tarpit')).toEqual({ ok: false, reason: 'cell-occupied' });
    expect(s.gold).toBe(50);
  });

  it('checks buildable before gold: a path cell with no gold is not-buildable', () => {
    const s = createGame();
    s.gold = 0;
    expect(buildTower(s, cell(0, 7), 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, A, 'musketeer')).toEqual({ ok: false, reason: 'not-enough-gold' });
  });

  it('copies the cell, so later changes to the argument do not move the tower', () => {
    const s = createGame();
    const c = cell(2, 5);
    buildTower(s, c, 'musketeer');
    c.col = 9;
    expect(s.towers[0].cell).toEqual(cell(2, 5));
  });

  it('refuses when gold is short, and allows exactly enough', () => {
    const s = createGame();
    s.gold = 79;
    expect(buildTower(s, A, 'cannon')).toEqual({ ok: false, reason: 'not-enough-gold' });
    s.gold = 80;
    expect(buildTower(s, A, 'cannon')).toMatchObject({ ok: true, gold: 0 });
  });

  it('is allowed mid-wave', () => {
    const s = createGame();
    startWave(s);
    expect(buildTower(s, A, 'musketeer')).toMatchObject({ ok: true });
  });
});

describe('upgradeTower', () => {
  it('upgrades a musketeer for 35: gold 15, spent 85', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    const r = upgradeTower(s, A);
    expect(r).toMatchObject({ ok: true, gold: 15, tower: { upgraded: true, spent: 85 } });
    expect(s.gold).toBe(15);
  });

  it('charges 60 for a cannon and 50 for a tar pit', () => {
    const s = createGame();
    s.gold = 80 + 60 + 60 + 50;
    buildTower(s, A, 'cannon');
    buildTower(s, B, 'tarpit');
    expect(upgradeTower(s, A)).toMatchObject({ ok: true, gold: 50, tower: { spent: 140 } });
    expect(upgradeTower(s, B)).toMatchObject({ ok: true, gold: 0, tower: { spent: 110 } });
  });

  it('refuses with no tower, when already upgraded, and when gold is short', () => {
    const s = createGame();
    expect(upgradeTower(s, A)).toEqual({ ok: false, reason: 'no-tower' });
    expect(upgradeTower(s, cell(99, 99))).toEqual({ ok: false, reason: 'no-tower' });
    buildTower(s, A, 'musketeer'); // 50 left
    s.gold = 34;
    expect(upgradeTower(s, A)).toEqual({ ok: false, reason: 'not-enough-gold' });
    s.gold = 100;
    upgradeTower(s, A);
    expect(upgradeTower(s, A)).toEqual({ ok: false, reason: 'already-upgraded' });
    expect(s.gold).toBe(65);
  });
});

describe('sellTower', () => {
  // A tower locked by Start Wave (milestone 25a) sells for 70%.
  it('refunds floor(70%) of spent and frees the cell', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    startWave(s);
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 35, gold: 85 });
    expect(s.towers).toEqual([]);
    expect(buildTower(s, A, 'tarpit')).toMatchObject({ ok: true });
  });

  it('a 50 + 35 musketeer refunds 59', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    expect(s.gold).toBe(15);
    startWave(s);
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 59, gold: 74 });
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
    expect(sellTower(s, A)).toEqual({ ok: false, reason: 'no-tower' });
  });
});

describe('game over', () => {
  it('refuses build, upgrade and sell once won or lost', () => {
    for (const phase of ['won', 'lost'] as const) {
      const s = createGame();
      buildTower(s, A, 'musketeer');
      s.phase = phase;
      expect(buildTower(s, B, 'musketeer')).toEqual({ ok: false, reason: 'game-over' });
      expect(upgradeTower(s, A)).toEqual({ ok: false, reason: 'game-over' });
      expect(sellTower(s, A)).toEqual({ ok: false, reason: 'game-over' });
      expect(s.gold).toBe(50);
      expect(s.towers).toHaveLength(1);
    }
  });
});

// Planning phase (milestone 25a): lock, refund, move and undo rules.
import { describe, expect, it } from 'vitest';
import { MAPS } from './map';
import { buildTower, moveTower, sellTower, setTargeting, undoUpgrade, upgradeTower } from './actions';
import { fireTowers } from './combat';
import { createGame, startWave, tick } from './game';
import { cellCenter, cellKey, isBuildableTerrain, type Cell } from './grid';
import { runHeadless } from './headless';
import type { GameState } from './types';

const cell = (col: number, row: number): Cell => ({ col, row });
const A = cell(7, 5);
const B = cell(9, 5);
const PATH = cell(0, 7);

function clearWave(s: GameState): void {
  startWave(s);
  for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
}

describe('lock and refund', () => {
  it('a tower built in setup is unlocked, and selling it then refunds everything: 100 -> 50 -> 100', () => {
    const s = createGame();
    const r = buildTower(s, A, 'musketeer');
    expect(r).toMatchObject({ ok: true, gold: 50, tower: { locked: false, unlockedSpend: 50, upgradedThisPhase: false } });
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 50, gold: 100 });
    expect(s.towers).toEqual([]);
  });

  it('startWave locks every tower and zeroes unlockedSpend; a mid-wave sell pays 35', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    startWave(s);
    expect(s.towers[0]).toMatchObject({ locked: true, unlockedSpend: 0, upgradedThisPhase: false });
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 35, gold: 85 });
  });

  it('built in setup, wave cleared, sold in the next setup: locked, 35', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    clearWave(s);
    expect(s.phase).toBe('setup');
    expect(s.towers[0].locked).toBe(true);
    const before = s.gold;
    expect(sellTower(s, A)).toMatchObject({ ok: true, refund: 35 });
    expect(s.gold - before).toBe(35);
  });

  it('built mid-wave: locked at once, sold at once for 35', () => {
    const s = createGame();
    startWave(s);
    expect(buildTower(s, A, 'musketeer')).toMatchObject({ ok: true, tower: { locked: true, unlockedSpend: 0 } });
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 35, gold: 85 });
  });

  it('upgrading mid-wave adds nothing refundable', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    startWave(s);
    upgradeTower(s, A);
    expect(s.towers[0]).toMatchObject({ upgraded: true, spent: 85, unlockedSpend: 0, upgradedThisPhase: false });
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'not-in-setup' });
  });

  it('build + upgrade in setup, then sell: everything back (100 -> 15 -> 100)', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    expect(s.gold).toBe(15);
    expect(s.towers[0]).toMatchObject({ spent: 85, unlockedSpend: 85, upgradedThisPhase: true, locked: false });
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 85, gold: 100 });
  });
});

describe('selling a locked tower upgraded this setup', () => {
  it('pays the upgrade in full plus 70% of the rest: 35 + floor(50 * 0.7) = 70, the same as undo then sell', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    clearWave(s);
    s.gold = 100;
    upgradeTower(s, A);
    expect(s.gold).toBe(65);
    s.events = [];
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 70, gold: 135 });
    expect(s.events).toEqual([{ kind: 'sell', cell: A, tower: 'musketeer', refund: 70, full: false }]);
  });

  it('a locked mortar upgraded this setup: 80 + floor(110 * 0.7) = 157; after Start Wave only 70% of 190 = 133', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, A, 'mortar');
    clearWave(s);
    upgradeTower(s, A);
    const t = structuredClone(s);
    const before = s.gold;
    expect(sellTower(s, A)).toMatchObject({ ok: true, refund: 157 });
    expect(s.gold - before).toBe(157);
    startWave(t);
    expect(sellTower(t, A)).toMatchObject({ ok: true, refund: 133 });
  });
});

describe('undoUpgrade', () => {
  it('on a locked tower upgraded this setup: full upgrade cost back, tower base again and still locked', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    clearWave(s);
    s.gold = 100;
    upgradeTower(s, A);
    expect(s.gold).toBe(65);
    expect(s.towers[0]).toMatchObject({ locked: true, upgraded: true, spent: 85, unlockedSpend: 35, upgradedThisPhase: true });
    const r = undoUpgrade(s, A);
    expect(r).toMatchObject({ ok: true, refund: 35, gold: 100 });
    expect(s.towers[0]).toMatchObject({ locked: true, upgraded: false, spent: 50, unlockedSpend: 0, upgradedThisPhase: false });
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    // Locked, so a sell is still 70% of the build.
    expect(sellTower(s, A)).toMatchObject({ ok: true, refund: 35 });
  });

  it('on an unlocked tower: the tower stays unlocked with its build refundable', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    expect(undoUpgrade(s, A)).toMatchObject({ ok: true, refund: 35, gold: 50 });
    expect(s.towers[0]).toMatchObject({ locked: false, upgraded: false, spent: 50, unlockedSpend: 50 });
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 50, gold: 100 });
  });

  it('fails after startWave, and in the next setup for an upgrade bought earlier', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    startWave(s);
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'not-in-setup' });
    for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
    expect(s.phase).toBe('setup');
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'nothing-to-undo' });
  });

  it('reasons: no-tower, nothing-to-undo (not upgraded), game-over', () => {
    const s = createGame();
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'no-tower' });
    buildTower(s, A, 'musketeer');
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    upgradeTower(s, A);
    s.phase = 'lost';
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'game-over' });
  });
});

describe('moveTower', () => {
  it('moves an unlocked tower for free, keeping type, upgrade, targeting and spend', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    setTargeting(s, A, 'strongest');
    const r = moveTower(s, A, B);
    expect(r.ok).toBe(true);
    expect(s.gold).toBe(15);
    expect(s.towers).toEqual([
      {
        cell: B,
        type: 'musketeer',
        upgraded: true,
        targeting: 'strongest',
        cooldownTicks: 0,
        spent: 85,
        locked: false,
        unlockedSpend: 85,
        upgradedThisPhase: true,
        kills: 0,
      },
    ]);
    // Still unlocked after a move: the undo and the full refund work from the new cell.
    expect(undoUpgrade(s, B)).toMatchObject({ ok: true, refund: 35 });
    expect(sellTower(s, B)).toEqual({ ok: true, refund: 50, gold: 100 });
  });

  it('moving onto itself succeeds and changes nothing (no event)', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    const before = structuredClone(s.towers);
    s.events = [];
    expect(moveTower(s, A, { ...A })).toMatchObject({ ok: true });
    expect(s.towers).toEqual(before);
    expect(s.events).toEqual([]);
  });

  it('every failure reason, in order', () => {
    const s = createGame();
    s.gold = 1000;
    expect(moveTower(s, A, B)).toEqual({ ok: false, reason: 'no-tower' });
    buildTower(s, A, 'musketeer');
    buildTower(s, B, 'cannon');
    expect(moveTower(s, A, PATH)).toEqual({ ok: false, reason: 'not-buildable' });
    expect(moveTower(s, A, cell(30, 0))).toEqual({ ok: false, reason: 'not-buildable' });
    expect(moveTower(s, A, cell(7.5, 5))).toEqual({ ok: false, reason: 'not-buildable' });
    expect(moveTower(s, A, B)).toEqual({ ok: false, reason: 'cell-occupied' });
    expect(s.towers.map((t) => t.cell)).toEqual([A, B]);

    startWave(s);
    expect(moveTower(s, A, cell(2, 5))).toEqual({ ok: false, reason: 'not-in-setup' });
    for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
    expect(s.phase).toBe('setup');
    expect(moveTower(s, A, cell(2, 5))).toEqual({ ok: false, reason: 'locked' });
    s.phase = 'won';
    expect(moveTower(s, A, cell(2, 5))).toEqual({ ok: false, reason: 'game-over' });
    expect(s.towers.map((t) => t.cell)).toEqual([A, B]);
  });

  it('keeps the towers sorted by cell key', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, cell(2, 5), 'musketeer');
    buildTower(s, A, 'longbow');
    buildTower(s, cell(7, 7), 'tarpit');
    moveTower(s, cell(2, 5), cell(9, 9));
    moveTower(s, cell(7, 7), cell(1, 1));
    const keys = s.towers.map((t) => cellKey(t.cell));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(s.towers.map((t) => t.cell)).toEqual([cell(1, 1), A, cell(9, 9)]);
  });

  it('after a move and startWave the tower fires from its new cell', () => {
    const far = cell(25, 3);
    expect(isBuildableTerrain(far, MAPS.meadow)).toBe(true);
    const s = createGame();
    buildTower(s, cell(2, 5), 'musketeer');
    expect(moveTower(s, cell(2, 5), far).ok).toBe(true);
    startWave(s);
    // Goblin 0 at the spawn: in range of (2,5) only. Goblin 1 at path distance 1440, (816,192): 80 px from (25,3).
    s.enemies = [
      { id: 0, type: 'goblin', hp: 30, distance: 0, slow: 0, slowTicksLeft: 0 },
      { id: 1, type: 'goblin', hp: 30, distance: 1440, slow: 0, slowTicksLeft: 0 },
    ];
    s.shots = [];
    fireTowers(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]).toMatchObject({ cell: far, targetId: 1, from: cellCenter(far) });
  });
});

describe('events', () => {
  it('move, undoUpgrade, and sell with full', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    moveTower(s, A, B);
    undoUpgrade(s, B);
    sellTower(s, B);
    buildTower(s, A, 'cannon');
    startWave(s);
    sellTower(s, A);
    expect(moveTower(s, A, B).ok).toBe(false); // refused: no event
    expect(s.events).toEqual([
      { kind: 'build', cell: A, tower: 'musketeer' },
      { kind: 'upgrade', cell: A, tower: 'musketeer', level: 2 },
      { kind: 'move', from: A, to: B, tower: 'musketeer' },
      { kind: 'undoUpgrade', cell: B, tower: 'musketeer', refund: 35 },
      { kind: 'sell', cell: B, tower: 'musketeer', refund: 50, full: true },
      { kind: 'build', cell: A, tower: 'cannon' },
      { kind: 'waveStart', wave: 1 },
      { kind: 'sell', cell: A, tower: 'cannon', refund: 56, full: false },
    ]);
  });
});

describe('headless', () => {
  it('runs move and undoUpgrade script actions', () => {
    const run = runHeadless([
      { type: 'build', cell: A, tower: 'musketeer' },
      { type: 'upgrade', cell: A },
      { type: 'move', from: A, to: B },
      { type: 'undoUpgrade', cell: B },
      { type: 'move', from: B, to: PATH },
      { type: 'startWave' },
      { type: 'move', from: B, to: A },
      { type: 'undoUpgrade', cell: B },
    ]);
    expect(run.log.map((l) => ('result' in l ? [l.action, l.result.ok ? 'ok' : l.result.reason] : l.action))).toEqual([
      ['build', 'ok'],
      ['upgrade', 'ok'],
      ['move', 'ok'],
      ['undoUpgrade', 'ok'],
      ['move', 'not-buildable'],
      ['startWave', 'ok'],
      ['move', 'not-in-setup'],
      ['undoUpgrade', 'not-in-setup'],
    ]);
    expect(run.state.gold).toBe(50);
    expect(run.state.towers).toMatchObject([{ cell: B, upgraded: false, locked: true }]);
  });
});

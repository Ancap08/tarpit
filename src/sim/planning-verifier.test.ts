// Verifier probes for the planning phase (milestone 25a). Written from
// docs/SCOPE-v4.md and docs/DESIGN.md "Planning phase", not from the
// implementer's tests. Gold is exact everywhere.
import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, setTargeting, undoUpgrade, upgradeTower } from './actions';
import { createGame, startWave, tick } from './game';
import { cellKey, GRID_COLS, GRID_ROWS, isBuildableTerrain, type Cell } from './grid';
import { sellRefund, TOWER_DEFS } from './towers';
import type { GameEvent } from './events';
import type { GameState, TowerType } from './types';

const cell = (col: number, row: number): Cell => ({ col, row });
const A = cell(7, 5);
const B = cell(9, 5);
const TYPES = Object.keys(TOWER_DEFS) as TowerType[];

/** Tiny seeded LCG (Numerical Recipes constants); no Math.random. */
function lcg(seed: number): (n: number) => number {
  let x = seed >>> 0;
  return (n) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return Math.floor((x / 4294967296) * n);
  };
}

function clearWave(s: GameState): void {
  startWave(s);
  for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
}

const refundable = (s: GameState) => s.towers.reduce((n, t) => n + t.unlockedSpend, 0);
/** The most gold the player could hold by liquidating everything now, by the documented rules. */
const worth = (s: GameState) =>
  s.gold + s.towers.reduce((n, t) => n + (t.locked ? sellRefund(t.spent - t.unlockedSpend) + t.unlockedSpend : t.spent), 0);
const snapshot = (s: GameState) => JSON.stringify({ gold: s.gold, towers: s.towers });

const BUILDABLE: Cell[] = [];
for (let row = 0; row < GRID_ROWS; row++) for (let col = 0; col < GRID_COLS; col++) if (isBuildableTerrain(cell(col, row))) BUILDABLE.push(cell(col, row));

describe('(a) exploit hunt', () => {
  // Coordinator follow-up: the fresh upgrade comes back in full, the rest at 70%.
  it('a locked tower with an upgrade bought this setup sells for 35 + 35 = 70, the same as undo then sell', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    clearWave(s);
    expect(s.phase).toBe('setup');
    s.gold = 100;
    expect(upgradeTower(s, A)).toMatchObject({ ok: true, gold: 65, tower: { locked: true, spent: 85, unlockedSpend: 35, upgradedThisPhase: true } });
    // Sell now: 35 + floor(0.7 * 50) = 70, the same as undo (+35) then sell (+35).
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 70, gold: 135 });
    expect(s.events.at(-1)).toMatchObject({ kind: 'sell', refund: 70, full: false });

    const t = createGame();
    buildTower(t, A, 'musketeer');
    clearWave(t);
    t.gold = 100;
    upgradeTower(t, A);
    expect(undoUpgrade(t, A)).toMatchObject({ ok: true, refund: 35, gold: 100, tower: { locked: true, spent: 50, unlockedSpend: 0 } });
    expect(sellTower(t, A)).toEqual({ ok: true, refund: 35, gold: 135 });
  });

  it('upgrade / undo and build / remove cycles never mint gold', () => {
    const s = createGame();
    for (let i = 0; i < 50; i++) {
      buildTower(s, A, 'musketeer');
      upgradeTower(s, A);
      moveTower(s, A, B);
      undoUpgrade(s, B);
      upgradeTower(s, B);
      sellTower(s, B);
      expect(s.gold).toBe(100);
      expect(s.towers).toEqual([]);
    }
  });

  it('200 pseudo-random planning actions before wave 1: gold + refundable spend is conserved, gold never above the start', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rnd = lcg(seed);
      const s = createGame();
      s.gold = 400;
      const start = s.gold;
      let ok = 0;
      for (let i = 0; i < 200; i++) {
        const before = snapshot(s);
        const any = s.towers.length ? s.towers[rnd(s.towers.length)].cell : BUILDABLE[rnd(BUILDABLE.length)];
        const to = rnd(4) === 0 ? cell(rnd(GRID_COLS + 2) - 1, rnd(GRID_ROWS + 2) - 1) : BUILDABLE[rnd(BUILDABLE.length)];
        let r: { ok: boolean };
        switch (rnd(5)) {
          case 0: r = buildTower(s, to, TYPES[rnd(TYPES.length)]); break;
          case 1: r = upgradeTower(s, any); break;
          case 2: r = undoUpgrade(s, any); break;
          case 3: r = moveTower(s, any, to); break;
          default: r = sellTower(s, any);
        }
        if (r.ok) ok++;
        else expect(snapshot(s)).toBe(before); // a refused action changes nothing
        expect(s.gold + refundable(s)).toBe(start);
        expect(s.gold).toBeLessThanOrEqual(start);
        expect(s.gold).toBeGreaterThanOrEqual(0);
        const keys = s.towers.map((t) => cellKey(t.cell));
        expect(new Set(keys).size).toBe(keys.length); // no duplicated tower
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
        for (const t of s.towers) {
          expect(t.locked).toBe(false);
          expect(t.spent).toBe(TOWER_DEFS[t.type].cost + (t.upgraded ? TOWER_DEFS[t.type].upgradeCost : 0));
          expect(t.unlockedSpend).toBe(t.spent);
          expect(isBuildableTerrain(t.cell)).toBe(true);
        }
      }
      expect(ok).toBeGreaterThan(60); // the walk really did things
      // Liquidate: everything comes back, exactly.
      for (const t of [...s.towers]) sellTower(s, t.cell);
      expect(s.gold).toBe(start);
    }
  });

  it('200 pseudo-random actions in a later setup with locked towers: liquidation worth never rises', () => {
    let total = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
      const rnd = lcg(seed);
      const s = createGame();
      s.gold = 1000;
      buildTower(s, A, 'musketeer');
      buildTower(s, B, 'cannon');
      buildTower(s, cell(11, 5), 'longbow');
      upgradeTower(s, cell(11, 5));
      buildTower(s, cell(7, 9), 'mortar');
      clearWave(s);
      expect(s.phase).toBe('setup');
      s.gold = 400;
      const start = s.gold;
      let w = worth(s);
      let lockedSales = 0;
      let lockedUpgradedSales = 0;
      let losses = 0;
      for (let i = 0; i < 200; i++) {
        const before = snapshot(s);
        const any = s.towers.length ? s.towers[rnd(s.towers.length)] : undefined;
        const at = any ? any.cell : BUILDABLE[rnd(BUILDABLE.length)];
        const to = BUILDABLE[rnd(BUILDABLE.length)];
        let r: { ok: boolean };
        const pick = rnd(6);
        if (pick === 0) r = buildTower(s, to, TYPES[rnd(TYPES.length)]);
        else if (pick === 1 || pick === 5) r = upgradeTower(s, at);
        else if (pick === 2) r = undoUpgrade(s, at);
        else if (pick === 3) r = moveTower(s, at, to);
        else {
          const wasLocked = any?.locked ?? false;
          const pending = any?.unlockedSpend ?? 0;
          const sold = sellTower(s, at);
          // Only the 70% part of a locked sale is new gold; a fresh upgrade just comes back.
          if (sold.ok && wasLocked) {
            lockedSales += sold.refund - pending;
            if (pending > 0) lockedUpgradedSales++;
          }
          r = sold;
        }
        if (!r.ok) expect(snapshot(s)).toBe(before);
        const now = worth(s);
        expect(now).toBeLessThanOrEqual(w);
        if (now < w) losses++;
        w = now;
        // Gold only ever exceeds the phase start by what 70% sales of locked towers paid.
        expect(s.gold + refundable(s)).toBe(start + lockedSales);
        expect(s.gold).toBeGreaterThanOrEqual(0);
        const keys = s.towers.map((t) => cellKey(t.cell));
        expect(new Set(keys).size).toBe(keys.length);
      }
      // A sale pays exactly the liquidation worth, so worth never drops.
      expect(losses).toBe(0);
      total += lockedUpgradedSales;
    }
    expect(total).toBeGreaterThanOrEqual(5); // the walks did sell locked towers with a fresh upgrade
  });
});

describe('(a) follow-up: selling a locked tower with a fresh upgrade', () => {
  it.each(TYPES)('%s: one sell pays exactly what undo then sell pays, and never more than was spent this phase plus 70%% of the rest', (type) => {
    const { cost, upgradeCost } = TOWER_DEFS[type];
    const make = () => {
      const s = createGame();
      s.gold = cost;
      buildTower(s, A, type);
      clearWave(s);
      s.gold = 500;
      expect(upgradeTower(s, A)).toMatchObject({ ok: true, gold: 500 - upgradeCost });
      return s;
    };
    const one = make();
    expect(sellTower(one, A)).toEqual({ ok: true, refund: upgradeCost + sellRefund(cost), gold: 500 + sellRefund(cost) });
    const two = make();
    undoUpgrade(two, A);
    sellTower(two, A);
    expect(two.gold).toBe(one.gold);
    // Selling, rebuilding (unlocked now), upgrading and removing again adds nothing more.
    const loop = make();
    sellTower(loop, A);
    const after = loop.gold;
    buildTower(loop, A, type);
    upgradeTower(loop, A);
    expect(sellTower(loop, A)).toMatchObject({ ok: true, refund: cost + upgradeCost });
    expect(loop.gold).toBe(after);
    expect(after).toBe(500 + sellRefund(cost));
    // After Start Wave the same tower is back to 70% of everything.
    const late = make();
    startWave(late);
    expect(sellTower(late, A)).toMatchObject({ ok: true, refund: sellRefund(cost + upgradeCost) });
  });
});

describe('(b) (c) move rules', () => {
  const fresh = () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    buildTower(s, B, 'longbow');
    s.events = [];
    return s;
  };

  it('onto its own cell: ok, nothing changes, no event', () => {
    const s = fresh();
    const before = snapshot(s);
    expect(moveTower(s, A, A)).toMatchObject({ ok: true, tower: { cell: A } });
    expect(snapshot(s)).toBe(before);
    expect(s.events).toEqual([]);
  });

  it.each([
    ['an occupied cell', B, 'cell-occupied'],
    ['a path cell', cell(3, 7), 'not-buildable'],
    ['the cottage', cell(28, 4), 'not-buildable'],
    ['left of the grid', cell(-1, 5), 'not-buildable'],
    ['below the grid', cell(7, GRID_ROWS), 'not-buildable'],
    ['right of the grid', cell(GRID_COLS, 5), 'not-buildable'],
    ['a fractional cell', cell(7.5, 5), 'not-buildable'],
  ] as const)('onto %s fails and changes nothing', (_n, to, reason) => {
    const s = fresh();
    const before = snapshot(s);
    expect(moveTower(s, A, to)).toEqual({ ok: false, reason });
    expect(snapshot(s)).toBe(before);
    expect(s.events).toEqual([]);
  });

  it('from an empty cell: no-tower', () => {
    expect(moveTower(fresh(), cell(12, 12), cell(13, 12))).toEqual({ ok: false, reason: 'no-tower' });
  });

  it('during a wave: not-in-setup; a locked tower in the next setup: locked', () => {
    const s = fresh();
    startWave(s);
    expect(moveTower(s, A, cell(7, 9))).toEqual({ ok: false, reason: 'not-in-setup' });
    for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
    expect(s.phase).toBe('setup');
    const before = snapshot(s);
    expect(moveTower(s, A, cell(7, 9))).toEqual({ ok: false, reason: 'locked' });
    expect(moveTower(s, A, A)).toEqual({ ok: false, reason: 'locked' }); // locked is checked before the own-cell no-op
    expect(snapshot(s)).toBe(before);
  });
});

describe('(d) (e) a moved tower', () => {
  it('keeps its targeting mode, upgrade and spend, and hits from the new cell in the next wave', () => {
    const s = createGame();
    s.gold = 200;
    buildTower(s, cell(2, 12), 'musketeer'); // far from the path's first run
    upgradeTower(s, cell(2, 12));
    setTargeting(s, cell(2, 12), 'last');
    expect(moveTower(s, cell(2, 12), cell(2, 5))).toMatchObject({
      ok: true,
      tower: { cell: cell(2, 5), type: 'musketeer', upgraded: true, targeting: 'last', spent: 85, unlockedSpend: 85, locked: false },
    });
    expect(s.gold).toBe(115);
    startWave(s);
    let hit: Extract<GameEvent, { kind: 'hit' }> | undefined;
    for (let i = 0; i < 600 && !hit; i++) {
      tick(s);
      hit = s.events.find((e): e is Extract<GameEvent, { kind: 'hit' }> => e.kind === 'hit');
    }
    expect(hit).toMatchObject({ cell: cell(2, 5), tower: 'musketeer', damage: 22 });
  });

  it('towers stay in cell-key order through 20 random moves, and hits within a tick follow that order', () => {
    const rnd = lcg(7);
    const s = createGame();
    s.gold = 1000;
    for (const c of [cell(2, 5), cell(3, 5), cell(2, 9), cell(3, 9), cell(7, 5)]) buildTower(s, c, 'longbow');
    let moved = 0;
    while (moved < 20) {
      const t = s.towers[rnd(s.towers.length)];
      const r = moveTower(s, t.cell, BUILDABLE[rnd(BUILDABLE.length)]);
      if (!r.ok) continue;
      moved++;
      const keys = s.towers.map((x) => cellKey(x.cell));
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
    }
    expect(s.towers).toHaveLength(5);
    expect(s.gold).toBe(800);
    // Bring them back beside the first path run so several fire in the same tick.
    const home = [cell(4, 9), cell(3, 5), cell(2, 9), cell(2, 5), cell(3, 9)];
    const isHome = (c: Cell) => home.some((h) => h.col === c.col && h.row === c.row);
    for (const h of home) {
      if (s.towers.some((t) => t.cell.col === h.col && t.cell.row === h.row)) continue;
      const t = s.towers.find((x) => !isHome(x.cell));
      expect(t).toBeDefined();
      expect(moveTower(s, t!.cell, h).ok).toBe(true);
    }
    expect(s.towers.every((t) => isHome(t.cell))).toBe(true);
    startWave(s);
    let multi = 0;
    for (let i = 0; i < 900; i++) {
      tick(s);
      const keys = s.shots.map((x) => cellKey(x.cell));
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
      expect(keys).toEqual(s.towers.filter((t) => keys.includes(cellKey(t.cell))).map((t) => cellKey(t.cell)));
      if (keys.length > 1) multi++;
    }
    expect(multi).toBeGreaterThan(0);
  });
});

describe('(f) undoUpgrade', () => {
  it('twice: the second is nothing-to-undo; after a sell: no-tower', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    expect(undoUpgrade(s, A)).toMatchObject({ ok: true, refund: 35, gold: 50 });
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    expect(s.gold).toBe(50);
    expect(sellTower(s, A)).toEqual({ ok: true, refund: 50, gold: 100 });
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'no-tower' });
    expect(s.gold).toBe(100);
  });

  it('an upgrade from an earlier phase or bought mid-wave cannot be undone', () => {
    const s = createGame();
    s.gold = 300;
    buildTower(s, A, 'musketeer');
    upgradeTower(s, A);
    buildTower(s, B, 'musketeer');
    startWave(s);
    upgradeTower(s, B);
    expect(undoUpgrade(s, B)).toEqual({ ok: false, reason: 'not-in-setup' });
    for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
    expect(s.phase).toBe('setup');
    expect(undoUpgrade(s, A)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    expect(undoUpgrade(s, B)).toEqual({ ok: false, reason: 'nothing-to-undo' });
  });
});

describe('(g) (h) locking', () => {
  it('a tower built mid-wave is locked at once and still sells for 70% in the next setup', () => {
    const s = createGame();
    s.gold = 200;
    buildTower(s, A, 'musketeer');
    startWave(s);
    expect(buildTower(s, B, 'cannon')).toMatchObject({ ok: true, tower: { locked: true, unlockedSpend: 0 } });
    for (let i = 0; i < 60 * 600 && s.phase === 'wave'; i++) tick(s);
    expect(s.phase).toBe('setup');
    expect(s.towers.find((t) => t.type === 'cannon')).toMatchObject({ locked: true, unlockedSpend: 0 });
    const gold = s.gold;
    expect(moveTower(s, B, cell(9, 9))).toEqual({ ok: false, reason: 'locked' });
    expect(sellTower(s, B)).toEqual({ ok: true, refund: 56, gold: gold + 56 });
    expect(s.events.at(-1)).toMatchObject({ kind: 'sell', full: false });
  });

  it('startWave zeroes unlockedSpend and clears upgradedThisPhase on every tower', () => {
    const s = createGame();
    s.gold = 1000;
    TYPES.forEach((type, i) => {
      buildTower(s, cell(10 + i, 14), type);
      if (i % 2 === 0) upgradeTower(s, cell(10 + i, 14));
    });
    expect(s.towers.every((t) => !t.locked && t.unlockedSpend === t.spent)).toBe(true);
    expect(s.towers.filter((t) => t.upgradedThisPhase)).toHaveLength(3);
    const spent = s.towers.map((t) => t.spent);
    startWave(s);
    expect(s.towers).toHaveLength(6);
    for (const t of s.towers) expect(t).toMatchObject({ locked: true, unlockedSpend: 0, upgradedThisPhase: false });
    expect(s.towers.map((t) => t.spent)).toEqual(spent); // spent itself is kept for the 70% rule
  });
});

describe('(i) events', () => {
  it('move, undoUpgrade and sell.full carry the right values', () => {
    const s = createGame();
    s.gold = 500;
    buildTower(s, A, 'cannon');
    upgradeTower(s, A);
    s.events = [];
    moveTower(s, A, B);
    moveTower(s, B, B); // no-op: no event
    moveTower(s, B, cell(3, 7)); // refused: no event
    undoUpgrade(s, B);
    undoUpgrade(s, B); // refused: no event
    sellTower(s, B);
    expect(s.events).toEqual([
      { kind: 'move', from: A, to: B, tower: 'cannon' },
      { kind: 'undoUpgrade', cell: B, tower: 'cannon', refund: 60 },
      { kind: 'sell', cell: B, tower: 'cannon', refund: 80, full: true },
    ]);
    buildTower(s, A, 'cannon');
    startWave(s);
    s.events = [];
    sellTower(s, A);
    expect(s.events).toEqual([{ kind: 'sell', cell: A, tower: 'cannon', refund: 56, full: false }]);
  });
});

describe('(j) the first planning phase and a later one behave the same', () => {
  it('the same action list gives the same results and gold changes before wave 1 and before wave 2', () => {
    const run = (s: GameState) => {
      s.gold = 300;
      const C = cell(12, 12);
      const D = cell(13, 12);
      return [
        buildTower(s, C, 'firepot'),
        upgradeTower(s, C),
        moveTower(s, C, D),
        undoUpgrade(s, D),
        undoUpgrade(s, D),
        upgradeTower(s, D),
        moveTower(s, D, cell(3, 7)),
        sellTower(s, D),
        sellTower(s, D),
      ].map((r) => (r.ok ? ['ok', s.gold] : [r.reason])).concat([[String(s.towers.length), s.gold]]);
    };
    const first = createGame();
    const later = createGame();
    clearWave(later);
    expect(later.phase).toBe('setup');
    expect(later.wave).toBe(1);
    const a = run(first);
    expect(run(later)).toEqual(a);
    expect(a.at(-1)).toEqual(['0', 300]);
  });
});

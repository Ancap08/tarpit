import { describe, expect, it } from 'vitest';
import {
  availableSpecials, buildTower, callNextWave, continueEndless, createGame, lastWave, levelStars,
  MAPS, nextWavePreview, pickBoon, startWave, tick, upgradeTower, useSpecial, type GameState, type LevelDef,
} from '.';

const goblins = { groups: [{ type: 'goblin', count: 1, interval: 1, delay: 0 }] } as const;
const wolves = { groups: [{ type: 'wolf', count: 1, interval: 1, delay: 0 }] } as const;
const level: LevelDef = {
  id: 1, map: 'switchback', waves: [goblins, wolves], startGold: 200, startLives: 9,
  hpScale: 1.25, hpGrowthStart: null,
  allowedTowers: ['musketeer'], maxTowerLevel: 2,
  allowedSpecials: ['keg', 'guards'], rewardWaves: [], stars: { two: 6, three: 8 },
};

function finishWave(state: GameState): void {
  for (let i = 0; i < 4000 && state.phase === 'wave'; i++) tick(state);
  expect(state.phase).not.toBe('wave');
}

describe('campaign level rules', () => {
  it('takes map, economy and wave definitions from the level and wins after its last wave', () => {
    const state = createGame({ level, map: 'meadow', difficulty: 'hard' });
    expect(state.map).toBe(MAPS.switchback);
    expect(state).toMatchObject({ gold: 200, lives: 9 });
    expect(lastWave(state)).toBe(2);
    expect(nextWavePreview(state)).toEqual([{ type: 'goblin', count: 1 }]);
    expect(startWave(state)).toEqual({ ok: true, wave: 1 });
    tick(state);
    expect(state.enemies[0]).toMatchObject({ hp: 29, maxHp: 29 });
    expect(nextWavePreview(state)).toEqual([{ type: 'wolf', count: 1 }]);
    finishWave(state);
    expect(state).toMatchObject({ phase: 'setup', lives: 8, gold: 225 });
    expect(startWave(state)).toEqual({ ok: true, wave: 2 });
    tick(state);
    expect(state.enemies[0]).toMatchObject({ hp: 25, maxHp: 25 });
    const lastWaveBefore = structuredClone(state);
    expect(callNextWave(state)).toEqual({ ok: false, reason: 'last-wave' });
    expect(state).toEqual(lastWaveBefore);
    finishWave(state);
    expect(state).toMatchObject({ phase: 'won', wave: 2, lives: 7, gold: 250 });
    expect(nextWavePreview(state)).toEqual([]);
    expect(levelStars(state)).toBe(2);
    const wonBefore = structuredClone(state);
    expect(continueEndless(state)).toEqual({ ok: false, reason: 'campaign-level' });
    expect(state).toEqual(wonBefore);
  });

  it.each([[0, [3, 3]], [0.005, [2, 3]]] as const)(
    'spawns every enemy due on the same tick with interval %s',
    (interval, counts) => {
      const group = { type: 'goblin' as const, count: 3, interval, delay: 0 };
      const state = createGame({ level: { ...level, waves: [{ groups: [group] }] } });
      startWave(state);
      for (const count of counts) {
        tick(state);
        expect(state.enemies).toHaveLength(count);
        expect(state.spawnedPerGroup).toEqual([count]);
      }
      finishWave(state);
      expect(state).toMatchObject({ phase: 'won', lives: 6 });
    },
  );

  it('uses the same scaled HP for scheduled enemies and summoned Wolves, rounded once', () => {
    const state = createGame({ level: {
      ...level, hpGrowthStart: 2, waves: [goblins, { ...wolves, hpMultiplier: 1.13 }],
    } });
    startWave(state);
    tick(state);
    expect(state.enemies[0].hp).toBe(29);
    expect(callNextWave(state)).toMatchObject({ ok: true, wave: 2, bonus: 20 });
    state.packs.push({ nextTick: 0, remaining: 1 });
    tick(state);
    expect(state.enemies.filter((enemy) => enemy.type === 'wolf').map((enemy) => enemy.hp)).toEqual([36, 36]);
  });

  it('uses scaled boss thresholds and keeps summoned Wolves on time across an early call', () => {
    const bossWave = { groups: [{ type: 'grumblemaw', count: 1, interval: 1, delay: 0 }], hpMultiplier: 1.13 } as const;
    const state = createGame({ level: {
      ...level, hpGrowthStart: 1, waves: [bossWave, { ...wolves, hpMultiplier: 0.9 }],
    } });
    startWave(state);
    tick(state);
    const boss = state.enemies[0];
    expect(boss).toMatchObject({ hp: 10125, maxHp: 10125 });
    boss.hp = 6810;
    expect(useSpecial(state, 'keg', { x: 0, y: 96 })).toMatchObject({ ok: true, hits: 1, kills: 0 });
    expect(state.events).toContainEqual({ kind: 'packCall', enemyId: boss.id, threshold: 2 });
    tick(state);
    expect(state.enemies[1]).toMatchObject({ type: 'wolf', hp: 36, maxHp: 36 });
    expect(callNextWave(state)).toMatchObject({ ok: true, wave: 2 });
    for (let i = 0; i < 29; i++) tick(state);
    expect(state.enemies).toHaveLength(3);
    tick(state);
    expect(state.enemies[3]).toMatchObject({ type: 'wolf', hp: 35, maxHp: 35 });
  });

  it('rejects disallowed actions without spending or affecting any state', () => {
    const state = createGame({ level });
    const cell = { col: 5, row: 0 };
    let before = structuredClone(state);
    expect(buildTower(state, cell, 'cannon')).toEqual({ ok: false, reason: 'tower-locked' });
    expect(state).toEqual(before);
    expect(buildTower(state, cell, 'musketeer').ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    before = structuredClone(state);
    expect(upgradeTower(state, cell, 'A')).toEqual({ ok: false, reason: 'max-level' });
    expect(state).toEqual(before);
    startWave(state);
    expect(availableSpecials(state)).toEqual(['keg', 'guards']);
    before = structuredClone(state);
    expect(useSpecial(state, 'fireArrows', { x: 192, y: 96 })).toEqual({ ok: false, reason: 'locked' });
    expect(state).toEqual(before);
    expect(useSpecial(state, 'guards', { x: 192, y: 96 }).ok).toBe(true);
  });

  it('does not grant a charge to a level with no specials', () => {
    const state = createGame({ level: { ...level, allowedSpecials: [] } });
    startWave(state);
    expect(state.specialCharges).toBe(0);
    tick(state);
    expect(callNextWave(state).ok).toBe(true);
    expect(state.specialCharges).toBe(0);
  });

  it('uses the selected reward waves for offers and early-call restrictions', () => {
    const waves = [goblins, goblins, goblins, goblins, goblins, wolves];
    const baseline = createGame({ level: { ...level, waves, rewardWaves: [] } });
    const rewards = createGame({ level: { ...level, waves, rewardWaves: [5] } });
    for (const state of [baseline, rewards]) {
      for (let i = 0; i < 3; i++) {
        expect(startWave(state).ok).toBe(true);
        finishWave(state);
      }
      expect(startWave(state).ok).toBe(true);
      tick(state);
    }
    expect(callNextWave(baseline)).toMatchObject({ ok: true, wave: 5 });
    finishWave(baseline);
    expect(baseline.pendingBoon).toBeNull();
    const before = structuredClone(rewards);
    expect(callNextWave(rewards)).toEqual({ ok: false, reason: 'boon-wave' });
    expect(rewards).toEqual(before);
    finishWave(rewards);
    startWave(rewards);
    finishWave(rewards);
    expect(rewards.pendingBoon).toEqual({ wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] });
    expect(startWave(rewards)).toEqual({ ok: false, reason: 'boon-pending' });
    expect(pickBoon(rewards, 'warChest').ok).toBe(true);
    expect(startWave(rewards)).toEqual({ ok: true, wave: 6 });
  });

  it('offers the existing menus in order at arbitrary level waves', () => {
    const rules = { ...level, waves: [goblins, goblins, goblins, goblins], rewardWaves: [2, 3] };
    const state = createGame({ level: rules });
    for (let wave = 1; wave <= 3; wave++) {
      expect(startWave(state)).toMatchObject({ ok: true, wave });
      finishWave(state);
      if (wave === 2) {
        expect(state.pendingBoon).toEqual({ wave, options: ['longBarrels', 'keenArrows', 'warChest'] });
        expect(pickBoon(state, 'warChest').ok).toBe(true);
      }
    }
    expect(state.pendingBoon).toEqual({ wave: 3, options: ['stickyTar', 'hotCoals', 'quickHands'] });
    expect(() => createGame({ level: { ...rules, rewardWaves: [1, 2, 3, 4] } })).toThrow(RangeError);
  });

  it('gives one star for a win and includes the exact two- and three-star thresholds', () => {
    expect([0, 1, 5, 6, 7, 8, 9].map((lives) => levelStars({ level, phase: 'won', lives })))
      .toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(levelStars({ level, phase: 'lost', lives: 9 })).toBe(0);
    expect(levelStars({ phase: 'won', lives: 9 })).toBe(0);
  });
});

// The special policy (milestone 30, specialPolicy.ts): the scripted players
// fire specials the way a person would. One rule per test.
import { describe, expect, it } from 'vitest';
import { useSpecial } from './actions';
import { createGame, startWave } from './game';
import { comboBuild, comboWithoutSpecial, playScripted } from './headless';
import { MAPS, pathLength } from './map';
import { policyCandidates, policyChoice, POLICY_CHECK_TICKS, POLICY_MIN_HITS, POLICY_POINT_SPACING, zoneTurn } from './specialPolicy';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { WAVES } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };

function enemy(id: number, type: EnemyType, distance: number): Enemy {
  return { id, type, hp: 1000, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

function inWave(wave: number, enemies: Enemy[]): GameState {
  const s = createGame({ map: LINE });
  s.wave = wave - 1;
  startWave(s);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  return s;
}

describe('the policy numbers', () => {
  it('looks every 30 ticks, needs 3 enemies in the circle, candidate points every 30 px', () => {
    expect([POLICY_CHECK_TICKS, POLICY_MIN_HITS, POLICY_POINT_SPACING]).toEqual([30, 3, 30]);
  });

  it('candidates lie every 30 px along the path, nearest the exit first', () => {
    const c = policyCandidates(LINE);
    expect(c.length).toBe(31);
    expect(c[0]).toEqual({ x: 930, y: 240 });
    expect(c[30]).toEqual({ x: 30, y: 240 });
    expect(policyCandidates(MAPS.meadow).length).toBe(Math.ceil(pathLength(MAPS.meadow) / 30) - 1);
  });
});

describe('the rule', () => {
  it('rule 2: a crowd of small ones gets the keg, at the point catching the most', () => {
    const s = inWave(1, [enemy(0, 'goblin', 500), enemy(1, 'goblin', 510), enemy(2, 'goblin', 520), enemy(3, 'goblin', 100)]);
    // Points 450 to 570 catch the three (90 px); ties go to the one nearest the exit.
    expect(policyChoice(s, undefined)).toEqual({ special: 'keg', x: 570, y: 240, hits: 3 });
  });

  it('waits with fewer than 3 in any circle, off a check tick, or with no charge', () => {
    expect(policyChoice(inWave(1, [enemy(0, 'goblin', 100), enemy(1, 'goblin', 500), enemy(2, 'goblin', 900)]), undefined)).toBeUndefined();
    const s = inWave(1, [enemy(0, 'goblin', 500), enemy(1, 'goblin', 510), enemy(2, 'goblin', 520)]);
    s.waveTick = 29;
    expect(policyChoice(s, undefined)).toBeUndefined();
    s.waveTick = 30;
    expect(policyChoice(s, undefined)).toBeDefined();
    s.specialCharges = 0;
    expect(policyChoice(s, undefined)).toBeUndefined();
  });

  it('rule 1: a Troll in the crowd gets the Tar Barrel, then the Fire Arrows, taking turns', () => {
    const crowd = () => [enemy(0, 'troll', 500), enemy(1, 'goblin', 510), enemy(2, 'goblin', 520)];
    expect(policyChoice(inWave(7, crowd()), undefined)?.special).toBe('tarBarrel');
    expect(policyChoice(inWave(7, crowd()), 'tarBarrel')?.special).toBe('fireArrows');
    expect(policyChoice(inWave(7, crowd()), 'fireArrows')?.special).toBe('tarBarrel');
    // Before wave 7 the Tar Barrel takes every turn; before wave 4 the keg is all there is.
    expect(policyChoice(inWave(5, crowd()), 'tarBarrel')?.special).toBe('tarBarrel');
    expect(policyChoice(inWave(3, crowd()), undefined)?.special).toBe('keg');
  });

  it('rule 1 needs the big one inside the circle; otherwise the keg goes to the crowd', () => {
    const s = inWave(7, [enemy(0, 'troll', 100), enemy(1, 'goblin', 500), enemy(2, 'goblin', 510), enemy(3, 'goblin', 520)]);
    expect(policyChoice(s, undefined)).toEqual({ special: 'keg', x: 570, y: 240, hits: 3 });
  });

  it('a forbidden special is skipped: the other takes its turns, and no keg means waiting', () => {
    const crowd = () => [enemy(0, 'troll', 500), enemy(1, 'goblin', 510), enemy(2, 'goblin', 520)];
    expect(zoneTurn(7, 'fireArrows', { forbid: 'tarBarrel' })).toBe('fireArrows');
    expect(policyChoice(inWave(7, crowd()), undefined, { forbid: 'tarBarrel' })?.special).toBe('fireArrows');
    const small = inWave(7, [enemy(1, 'goblin', 510), enemy(2, 'goblin', 520), enemy(3, 'goblin', 530)]);
    expect(policyChoice(small, undefined, { forbid: 'keg' })).toBeUndefined();
    expect(zoneTurn(3, undefined)).toBeUndefined();
  });

  it('only opts into the wall while unlocked and absent, then resumes the usual zone turn', () => {
    const barricadePoint = { x: 560, y: 240 };
    const options = { barricadePoint };
    expect(policyChoice(inWave(2, []), undefined, options)).toBeUndefined();
    const state = inWave(7, [enemy(0, 'troll', 500), enemy(1, 'goblin', 510), enemy(2, 'goblin', 520)]);
    state.waveTick = 29;
    expect(policyChoice(state, 'tarBarrel')).toBeUndefined();
    expect(policyChoice(state, 'tarBarrel', options)).toEqual({ special: 'barricade', ...barricadePoint, hits: 0 });
    expect(useSpecial(state, 'barricade', barricadePoint).ok).toBe(true);
    expect(policyChoice(state, 'tarBarrel', options)).toBeUndefined();
    state.waveTick = 30;
    state.specialCharges = 1;
    expect(policyChoice(state, 'tarBarrel', options)?.special).toBe('fireArrows');
  });
});

describe('recording', () => {
  it("comboBuild's specials are recorded into its timed list, and the replay fires every one, accepted", () => {
    const script = comboBuild();
    const recorded = script.timed!.flat();
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded.every((a) => a.type === 'special' && a.atWaveTick % POLICY_CHECK_TICKS === 0)).toBe(true);
    const fired = playScripted(script).log.filter((l) => l.action === 'special');
    expect(fired.length).toBe(recorded.length);
    expect(fired.every((l) => l.action === 'special' && l.result.ok)).toBe(true);
  });

  it('forbidding a special records none of it', () => {
    const script = comboWithoutSpecial('tarBarrel');
    expect(script.timed!.flat().some((a) => a.type === 'special' && a.special === 'tarBarrel')).toBe(false);
  });
});

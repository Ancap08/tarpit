import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { continueEndless, startWave, tick } from './game';
import { buildableCells, cellKey } from './grid';
import { LEVELS } from './levels';
import { isMapId, MAP_IDS } from './map';
import { createKeep } from './oldKeep';
import { lastWave, nextWavePreview } from './waves';

describe('Old Keep exhibition', () => {
  it('has exactly its ten marked footprints and stays outside both public lists', () => {
    const { map } = createKeep();
    expect(isMapId(map.id)).toBe(false);
    expect(MAP_IDS).not.toContain(map.id);
    expect(LEVELS.some(level => level.map === map.id)).toBe(false);
    const sites = map.buildSites!.map(cellKey).sort((a, b) => a - b);
    expect(sites).toHaveLength(10);
    expect(buildableCells(map).flatMap((open, index) => open ? [index] : [])).toEqual(sites);
  });

  it('plays through its three fixed waves with ordinary towers and ends at the gate', () => {
    const state = createKeep();
    expect(state).toMatchObject({ lives: 20, gold: 240, wave: 0, phase: 'setup' });
    expect(lastWave(state)).toBe(3);
    expect(nextWavePreview(state)).toEqual([{ type: 'goblin', count: 12 }]);
    for (const [col, row] of [[15, 4], [22, 7], [26, 10], [22, 10]]) {
      expect(buildTower(state, { col, row }, 'musketeer').ok).toBe(true);
    }
    for (let wave = 1; wave <= 3; wave++) {
      expect(startWave(state)).toEqual({ ok: true, wave });
      for (let i = 0; i < 6000 && state.phase === 'wave'; i++) tick(state);
      expect(state.phase).toBe(wave === 3 ? 'won' : 'setup');
    }
    expect(continueEndless(state).ok).toBe(false);
    expect(nextWavePreview(state)).toEqual([]);
  });
});

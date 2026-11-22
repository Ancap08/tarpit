// The special search (milestone 28, specialSearch.ts) and the stored lists
// it wrote (specialLists.ts). The full search takes minutes per plan and
// map (`npm run sim:specials`), so the test reruns it for the first waves of
// one list (the greedy fixes waves in order, so a prefix of the search is a
// prefix of the list), and checks the whole of every stored list against
// "no special" wave by wave, which is the property the search guarantees.
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './difficulty';
import { createGame, startWave, tick } from './game';
import { cellCenter, distanceToPath, GRID_COLS, GRID_ROWS } from './grid';
import { applyAction, COMBO_PLANS, followPlan, HARD_PLANS, specialPolicy } from './headless';
import { MAP_IDS, MAPS } from './map';
import { better, choiceAction, searchSpecials, searchTargets, SEARCH_TARGET_REACH, SEARCH_TICK_STEP, waveOutcome } from './specialSearch';
import { SPECIAL_LISTS, type SpecialPlanId } from './specialLists';
import { unlockedSpecials } from './specials';
import type { GameState } from './types';

const PLANS = { combo: COMBO_PLANS, hard: HARD_PLANS } as const;

describe('the candidate set', () => {
  it('ticks every 60 (1 s); targets are the cells whose centre is within 16 px of the path, in cellKey order', () => {
    expect([SEARCH_TICK_STEP, SEARCH_TARGET_REACH]).toEqual([60, 16]);
    for (const id of MAP_IDS) {
      const targets = searchTargets(MAPS[id]);
      const keys = targets.map((c) => c.row * GRID_COLS + c.col);
      expect([...keys].sort((a, b) => a - b)).toEqual(keys);
      let n = 0;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) if (distanceToPath(cellCenter({ col, row }), MAPS[id]) <= 16) n += 1;
      }
      expect(targets, id).toHaveLength(n);
    }
    expect(MAP_IDS.map((id) => searchTargets(MAPS[id]).length)).toEqual([76, 100, 76]);
  });
});

describe('the stored lists', () => {
  it('every plan, level and map has a list of at most one special per wave, each unlocked on its wave and inside the map', () => {
    for (const plan of ['combo', 'hard'] as SpecialPlanId[]) {
      for (const level of DIFFICULTIES) {
        for (const id of MAP_IDS) {
          const list = SPECIAL_LISTS[plan][level][id];
          expect(list.length, `${plan} ${level} ${id}`).toBeLessThanOrEqual(10);
          list.forEach((choice, i) => {
            if (!choice) return;
            expect(unlockedSpecials(i + 1), `${plan} ${level} ${id} wave ${i + 1}`).toContain(choice.special);
            expect(choice.atWaveTick % SEARCH_TICK_STEP).toBe(0);
            expect(searchTargets(MAPS[id])).toContainEqual({ col: choice.col, row: choice.row });
          });
          expect(specialPolicy(plan, level, id).map((w) => w[0])).toEqual(list.map((c) => (c ? choiceAction(c) : undefined)));
        }
      }
    }
  });

  it('the search rerun gives the stored list for the combo plan on Meadow, Normal (waves 1 to 3)', () => {
    const got = searchSpecials(COMBO_PLANS.meadow, 'normal', 'meadow', { waves: 3 });
    expect(got).toEqual(SPECIAL_LISTS.combo.normal.meadow.slice(0, 3));
  });

  // The policy cannot hurt on its own wave: replaying each stored list, the
  // chosen special does no worse on its wave than no special (fewest lives
  // lost, then most kills, then earliest clear), given the earlier waves.
  for (const id of MAP_IDS) {
    it(`${id}: on every wave of every stored list the choice is no worse than no special`, () => {
      for (const plan of ['combo', 'hard'] as SpecialPlanId[]) {
        for (const level of DIFFICULTIES) {
          const list = SPECIAL_LISTS[plan][level][id];
          const s = createGame({ difficulty: level, map: id });
          const decide = followPlan(PLANS[plan][id]);
          for (let i = 0; i < list.length && s.phase === 'setup'; i++) {
            for (let a = decide(s); a; a = decide(s)) applyAction(s, a);
            startWave(s);
            const chosen = waveOutcome(s, list[i]);
            const none = waveOutcome(s, null);
            expect(better(none, chosen), `${plan} ${level} ${id} wave ${i + 1}: ${JSON.stringify({ chosen, none })}`).toBe(false);
            if (list[i]) expect(better(chosen, none), `${plan} ${level} ${id} wave ${i + 1} fires for nothing`).toBe(true);
            const fire = list[i] ? choiceAction(list[i]!) : undefined;
            while ((s.phase as GameState['phase']) === 'wave') {
              if (fire && s.waveTick === fire.atWaveTick) applyAction(s, fire);
              tick(s);
            }
          }
        }
      }
    });
  }
});

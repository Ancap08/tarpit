import { describe, expect, it } from 'vitest';
import { BOON_EFFECT_WITNESSES, createBoonScenarioMeasurer, evaluateBoonEffects } from './boonBalance';
import { BOONS } from './boons';
import { playWithStats } from './balanceRuns';
import { artilleryBuild, type RecordedOutcome } from './headless';
import type { MapId } from './map';

export function boonImpactSuite(map: MapId): void {
  describe(`boon impact on ${map}`, () => {
    const measure = createBoonScenarioMeasurer();
    for (const { scenario, best, changed } of BOON_EFFECT_WITNESSES) {
      if (scenario.map !== map) continue;
      it(`${scenario.build} ${scenario.difficulty}, wave ${scenario.wave}, picks ${scenario.picks.join('/')}`, () => {
        const result = measure(scenario);
        const report = evaluateBoonEffects([result]);
        for (const { actual, neutral } of result.outcomes) {
          expect(actual.wave).toBeGreaterThan(scenario.wave);
          expect(neutral.wave).toBeGreaterThan(scenario.wave);
          expect(actual.refused + neutral.refused).toBe(0);
        }
        if (best) expect(report.effects.find(({ boon }) => boon === best)?.best).toEqual([scenario]);
        for (const boonId of changed) {
          expect(report.effects.find(({ boon }) => boon === boonId)?.changed).toEqual([scenario]);
        }
      });
    }
    if (map === 'riverbend') {
      it('counts the same kills and outcome when replaying a recorded plan', () => {
        let outcome: RecordedOutcome | undefined;
        const script = artilleryBuild('hard', map, undefined, (recorded) => { outcome = recorded; });
        const { phase, lives, wave, kills, refused, specialHits } = playWithStats(script, 'hard');
        expect(specialHits.length).toBeGreaterThan(0);
        expect(refused).toBe(0);
        expect(outcome).toEqual({ phase, lives, wave, kills });
      });
    }
    if (map === 'meadow') {
      it('covers a strict best result and three distinct build/map pairs for each boon', () => {
        for (const { id } of Object.values(BOONS)) {
          expect(BOON_EFFECT_WITNESSES.some(({ best }) => best === id), id).toBe(true);
          const pairs = new Set(BOON_EFFECT_WITNESSES.filter(({ changed }) => changed.includes(id))
            .map(({ scenario }) => `${scenario.build}/${scenario.map}`));
          expect(pairs.size, id).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });
}

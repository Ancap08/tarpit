import { describe, expect, it } from 'vitest';
import { createGame, LEVELS, parseProgress, serializeProgress, type CampaignProgress } from '../../sim';
import { KEEP_LEVELS } from '../../sim/keepLevels';
import { distanceOnRoad } from '../../sim/roads';
import { createKeep } from '../../sim/oldKeep';
import { MAX_VOICES, Mixer } from '../audio/mixer';
import { recipeLength } from '../audio/recipes';
import { SiegeAudio } from '../audio/siegeAudio';
import { SIEGE_RECIPES, type SiegeSound } from '../audio/siegeRecipes';
import { siegeStance } from '../draw/siegeFormation';
import { campaignOpen, campaignStops } from './campaignMap';
import { campaignResultText } from './endText';

// Verifier (Claude Sonnet), milestone 52c: the switch, saved progress, the end
// text and the sound budget, tested without a browser.

const allThrough = (last: number): CampaignProgress =>
  Object.fromEntries(Array.from({ length: last }, (_, i) => [i + 1, 2 as const]));

function won(levelId: number) {
  const level = [...LEVELS, ...KEEP_LEVELS].find(l => l.id === levelId)!;
  const state = createGame({ level });
  state.phase = 'won';
  state.wave = level.waves.length;
  state.lives = 15;
  return state;
}

describe('the Act Three switch', () => {
  it('opens nothing past level 20 with the switch off, even for a full 25-level save', () => {
    expect(campaignOpen(allThrough(25), 21, false)).toBe(false);
    expect(campaignOpen(allThrough(25), 25, false)).toBe(false);
    expect(campaignOpen(allThrough(20), 21, true)).toBe(true);
    expect(campaignOpen(allThrough(19), 21, true)).toBe(false);
    expect(campaignOpen(allThrough(24), 25, true)).toBe(true);
    expect(campaignOpen(allThrough(24), 26, true)).toBe(false);
  });

  it('shows no Act Three stop and no new "next" with the switch off, whatever the save holds', () => {
    const save = allThrough(25);
    for (const portrait of [true, false]) {
      expect(campaignStops(portrait, save, 3, false)).toEqual([]);
      const ids = [1, 2].flatMap(act => campaignStops(portrait, save, act as 1 | 2, false)).map(s => s.id);
      expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect([1, 2].flatMap(act => campaignStops(portrait, save, act as 1 | 2, false)).some(s => s.next)).toBe(false);
    }
  });

  it('closes level 20 with the old ending when off and the new line when on', () => {
    const off = campaignResultText(won(20), allThrough(20), false)!;
    expect(off.nextId).toBeNull();
    expect(off.actClose).toBe('');
    expect(off.complete).not.toBe('');
    const on = campaignResultText(won(20), allThrough(20), true)!;
    expect(on.nextId).toBe(21);
    expect(on.actClose).toBe('He will be back, and he is bringing the army.');
    expect(on.complete).toBe('');
  });

  it('ends the campaign after level 25 only, and only with the switch on', () => {
    for (const id of [21, 22, 23, 24]) expect(campaignResultText(won(id), allThrough(id), true)!.complete).toBe('');
    const last = campaignResultText(won(25), allThrough(25), true)!;
    expect(last.complete).not.toBe('');
    expect(last.nextId).toBeNull();
  });

  it('keeps stars for levels 21 to 25 through a save, load and re-save', () => {
    const save: CampaignProgress = { ...allThrough(20), 21: 3, 22: 0, 23: 1, 24: 2, 25: 3 };
    expect(parseProgress(serializeProgress(save))).toEqual(save);
  });
});

describe('Act Three sound budget', () => {
  const lengthMs = Object.fromEntries(Object.entries(SIEGE_RECIPES).map(([k, r]) => [k, recipeLength(r) * 1000]));

  function run(minutes: number, drive: (audio: SiegeAudio, state: ReturnType<typeof createKeep>, ms: number) => void) {
    const state = createKeep(true);
    state.phase = 'wave';
    const mixer = new Mixer();
    const started: Record<string, number> = {};
    let emitted = 0;
    let peak = 0;
    let now = 0;
    const audio = new SiegeAudio(true, true, (cue: SiegeSound) => {
      emitted++;
      const r = SIEGE_RECIPES[cue];
      const d = mixer.request(cue, r.priority, lengthMs[cue], now, (r as { thin?: number }).thin);
      if (d.action === 'play') started[cue] = (started[cue] ?? 0) + 1;
      peak = Math.max(peak, mixer.live(now).length);
    });
    for (now = 0; now < minutes * 60_000; now += 1000 / 60) {
      drive(audio, state, now);
      audio.update(state, now);
    }
    return { emitted, started, peak };
  }

  it('ten minutes of an ever-breaking, ever-mended gate never exceeds the voice cap', () => {
    const result = run(10, (audio, state, ms) => {
      const gate = state.gate!;
      gate.fallen = false;
      gate.lastStandTicksLeft = 0;
      // Saw-tooth: health falls over 20 s, is repaired (three hammer strikes) and falls again.
      const phase = (ms % 20_000) / 20_000;
      gate.hp = gate.maxHp * (1 - phase * 0.95);
      if (ms % 20_000 < 17) audio.repair(ms);
      if (ms % 7000 < 17) audio.pillow(ms);
    });
    expect(result.peak).toBeLessThanOrEqual(MAX_VOICES);
    // The drum cannot be quicker than its near-breach interval (390 ms) however it is driven.
    expect(result.started['siege.drum']).toBeLessThanOrEqual(Math.ceil(600_000 / 390));
    expect(result.started['siege.hammer']).toBeLessThanOrEqual(3 * 31);
  });

  it('a hundred repair taps in one frame start no more voices than the cap and leave no sequence behind', () => {
    const state = createKeep(true);
    state.phase = 'setup';
    const mixer = new Mixer();
    let started = 0;
    let now = 0;
    const audio = new SiegeAudio(true, true, cue => {
      const r = SIEGE_RECIPES[cue];
      if (mixer.request(cue, r.priority, lengthMs[cue], now, (r as { thin?: number }).thin).action === 'play') started++;
    });
    for (let i = 0; i < 100; i++) audio.repair(0);
    for (now = 0; now < 2000; now += 1000 / 60) audio.update(state, now);
    expect(started).toBeLessThanOrEqual(MAX_VOICES);
    // Everything queued has played out: nothing more starts afterwards.
    const before = started;
    for (; now < 8000; now += 1000 / 60) audio.update(state, now);
    expect(started).toBe(before);
  });

  it('thirty rams at the sill, knocking and rolling in unison, cannot start more than the cap', () => {
    const result = run(1, (_audio, state) => {
      if (state.enemies.length) return;
      const distance = distanceOnRoad(state.map, 'west', state.gate!)!;
      state.enemies = Array.from({ length: 30 }, (_, id) => ({ id, type: 'ram' as const, road: 'west', distance, hp: 360, slow: 0, slowTicksLeft: 0 }));
    });
    expect(result.emitted).toBeGreaterThan(0);
    expect(result.peak).toBeLessThanOrEqual(MAX_VOICES);
  });
});

describe('the drawn crowd at the gate', () => {
  it('is a pure function of the enemy id and its distance, and never moves a flyer', () => {
    const state = createKeep(true);
    const gate = state.gate!;
    const sill = distanceOnRoad(state.map, 'west', gate)!;
    const enemy = { id: 7, type: 'goblin' as const, road: 'west', distance: sill, hp: 10, slow: 0, slowTicksLeft: 0 };
    expect(siegeStance(state, enemy)).toEqual(siegeStance(state, { ...enemy }));
    expect(siegeStance(state, { ...enemy, type: 'harpy' })).toBeUndefined();
    expect(siegeStance(state, { ...enemy, distance: sill - 200 })).toBeUndefined();
  });

  it('keeps all 35 slots distinct and within 40 px of the true contact point', () => {
    const state = createKeep(true);
    const sill = distanceOnRoad(state.map, 'west', state.gate!)!;
    const all = Array.from({ length: 35 }, (_, id) =>
      siegeStance(state, { id, type: 'goblin', road: 'west', distance: sill, hp: 10, slow: 0, slowTicksLeft: 0 })!);
    expect(new Set(all.map(({ x, y }) => `${x}:${y}`)).size).toBe(35);
    expect(Math.max(...all.map(({ x, y }) => Math.hypot(x, y)))).toBeLessThanOrEqual(40);
  });
});

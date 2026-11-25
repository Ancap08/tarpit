import { describe, expect, it } from 'vitest';
import { createKeep } from '../../sim/oldKeep';
import { distanceOnRoad } from '../../sim/roads';
import type { Enemy } from '../../sim/types';
import { SiegeAudio } from './siegeAudio';
import type { SiegeSound } from './siegeRecipes';

function battle(actThree = true, live = true) {
  const state = createKeep();
  const gate = state.gate!;
  state.phase = 'wave';
  const heard: SiegeSound[] = [];
  const audio = new SiegeAudio(actThree, live, cue => heard.push(cue));
  return { state, gate, heard, audio };
}

describe('siege sound cues', () => {
  it.each([[1, 980], [0.5, 685], [0.1, 449]])('drums at %s gate health with a %sms interval', (health, period) => {
    const { state, gate, heard, audio } = battle();
    gate.hp = gate.maxHp * health;
    audio.update(state, 0);
    audio.update(state, period - 1);
    expect(heard).toEqual(['siege.drum']);
    audio.update(state, period);
    expect(heard).toEqual(['siege.drum', 'siege.drum']);
  });

  it('shortens the interval in the same wave, creaks on downward steps and stops drumming at a breach', () => {
    const { state, gate, heard, audio } = battle();
    audio.update(state, 0);
    gate.hp = gate.maxHp * 0.5;
    audio.update(state, 685);
    gate.hp = gate.maxHp * 0.2;
    audio.update(state, 750);
    gate.hp = 0;
    gate.fallen = true;
    gate.lastStandTicksLeft = 360;
    audio.update(state, 1150);
    audio.update(state, 1850);
    audio.update(state, 2550);
    audio.update(state, 3550);
    expect(heard).toEqual([
      'siege.drum', 'siege.creak', 'siege.drum', 'siege.creak',
      'siege.creak', 'siege.bell', 'siege.bell', 'siege.bell',
    ]);
  });

  it('restarts the drum for the next wave without playing it in setup', () => {
    const { state, heard, audio } = battle();
    audio.update(state, 0);
    state.phase = 'setup';
    audio.update(state, 350);
    audio.update(state, 5000);
    state.phase = 'wave';
    audio.update(state, 5100);
    expect(heard).toEqual(['siege.drum', 'siege.drum']);
  });

  it('plays pillow and repair accents only at their pausable clock times', () => {
    const { state, heard, audio } = battle();
    state.phase = 'setup';
    audio.repair(0);
    audio.update(state, 0);
    audio.update(state, 249);
    audio.update(state, 249); // Two frames on the same clock give one strike.
    expect(heard).toEqual(['siege.hammer']);
    audio.update(state, 250);
    audio.update(state, 520);
    audio.pillow(1000);
    audio.update(state, 1199);
    expect(heard).toEqual(['siege.hammer', 'siege.hammer', 'siege.hammer']);
    audio.update(state, 1200);
    audio.update(state, 1390);
    expect(heard.slice(-2)).toEqual(['siege.pillowThump', 'siege.pillowFlutter']);
  });

  it('rumbles as the Ram travels and knocks in phase during gate contact', () => {
    const { state, gate, heard, audio } = battle();
    const distance = distanceOnRoad(state.map, 'west', gate)!;
    const ram: Enemy = { id: 1, type: 'ram', road: 'west', distance: distance - 50, hp: 360, slow: 0, slowTicksLeft: 0 };
    state.enemies = [ram];
    audio.update(state, 0);
    audio.update(state, 470);
    ram.distance = distance;
    audio.update(state, 600);
    audio.update(state, 949);
    expect(heard.filter(cue => cue.startsWith('siege.ram'))).toEqual(['siege.ramRoll', 'siege.ramRoll']);
    audio.update(state, 950);
    audio.update(state, 1849);
    audio.update(state, 1850);
    ram.runTicksLeft = 60;
    audio.update(state, 1880);
    expect(heard.filter(cue => cue.startsWith('siege.ram'))).toEqual([
      'siege.ramRoll', 'siege.ramRoll', 'siege.ramKnock', 'siege.ramKnock', 'siege.ramRoll',
    ]);
  });

  it.each([[false, true], [true, false]])('stays silent with act3=%s and live=%s', (actThree, live) => {
    const { state, gate, heard, audio } = battle(actThree, live);
    audio.update(state, 0);
    audio.pillow(0);
    audio.repair(0);
    gate.hp = gate.maxHp / 2;
    audio.update(state, 200);
    audio.update(state, 390);
    gate.hp = 0;
    gate.fallen = true;
    gate.lastStandTicksLeft = 360;
    audio.update(state, 700);
    audio.update(state, 1400);
    expect(heard).toEqual([]);
  });
});

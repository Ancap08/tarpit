import type { GameState, Gate } from '../../sim/types';
import { BELL_STRIKES_MS, gateDamageStage, ramAtGate, ramSlamIndex, REPAIR_STRIKES_MS } from '../keep/siegeTiming';
import { sound } from './engine';
import type { SiegeSound } from './siegeRecipes';

export const DRUM_FULL_GATE_MS = 980;
export const DRUM_NEAR_BREACH_MS = 390;
export const RAM_ROLL_MS = 470;

const HAMMER = REPAIR_STRIKES_MS.map(at => ({ at, sound: 'siege.hammer' as const }));
const BELL = BELL_STRIKES_MS.map(at => ({ at, sound: 'siege.bell' as const }));
const PILLOW = [{ at: 200, sound: 'siege.pillowThump' }, { at: 390, sound: 'siege.pillowFlutter' }] as const;

export function drumInterval(gate: Pick<Gate, 'hp' | 'maxHp'>): number {
  const health = Math.max(0, Math.min(1, gate.hp / gate.maxHp));
  return DRUM_NEAR_BREACH_MS + (DRUM_FULL_GATE_MS - DRUM_NEAR_BREACH_MS) * health;
}

interface Cue {
  at: number;
  sound: SiegeSound;
}

interface Sequence {
  from: number;
  cues: readonly Cue[];
  next: number;
}

type BattleSoundInput = Pick<GameState, 'phase' | 'gate' | 'map' | 'enemies'>;

/** Sound starts follow the same clock as the siege art. The shared engine
 * shapes each strike in real time and cancels active voices on pause. */
export class SiegeAudio {
  private readonly enabled: boolean;
  private readonly sequences: Sequence[] = [];
  private gateStage?: number;
  private lastDrumAt = -Infinity;
  private contactAt = 0;
  private lastSlam = -1;
  private lastRollAt = -Infinity;
  private contactRam?: number;

  constructor(
    actThree: boolean,
    live: boolean,
    private readonly emit: (cue: SiegeSound) => void = cue => sound.playSiege(cue, actThree),
  ) {
    this.enabled = actThree && live;
  }

  pillow(nowMs: number): void {
    this.queue(nowMs, PILLOW);
  }

  repair(nowMs: number): void {
    this.queue(nowMs, HAMMER);
  }

  update(state: BattleSoundInput, nowMs: number): void {
    if (!this.enabled || !state.gate) return;
    const gate = state.gate;
    const stage = gateDamageStage(gate);
    if (this.gateStage !== undefined && stage > this.gateStage) {
      this.emit('siege.creak');
      if (stage === 3 && gate.lastStandTicksLeft > 0) this.queue(nowMs, BELL);
    }
    this.gateStage = stage;

    if (state.phase !== 'wave' || stage === 3) this.lastDrumAt = -Infinity;
    else if (nowMs - this.lastDrumAt >= drumInterval(gate)) {
      this.emit('siege.drum');
      this.lastDrumAt = nowMs;
    }

    this.updateRam(state, gate, nowMs);
    this.advanceSequences(nowMs);
  }

  private updateRam(state: BattleSoundInput, gate: Gate, nowMs: number): void {
    const ram = state.phase === 'wave' ? state.enemies.find(e => e.type === 'ram') : undefined;
    if (ram && ramAtGate(ram, state.map, gate)) {
      if (this.contactRam !== ram.id) {
        this.contactRam = ram.id;
        this.contactAt = nowMs;
        this.lastSlam = -1;
      }
      const slam = ramSlamIndex(nowMs - this.contactAt);
      if (slam > this.lastSlam) {
        this.emit('siege.ramKnock');
        this.lastSlam = slam;
      }
      this.lastRollAt = -Infinity;
    } else {
      this.contactRam = undefined;
      if (ram && !ram.flinchTicksLeft && nowMs - this.lastRollAt >= RAM_ROLL_MS) {
        this.emit('siege.ramRoll');
        this.lastRollAt = nowMs;
      }
    }
  }

  private queue(nowMs: number, cues: readonly Cue[]): void {
    if (this.enabled) this.sequences.push({ from: nowMs, cues, next: 0 });
  }

  private advanceSequences(nowMs: number): void {
    for (let i = this.sequences.length - 1; i >= 0; i--) {
      const sequence = this.sequences[i];
      const age = nowMs - sequence.from;
      let latest: Cue | undefined;
      while (sequence.next < sequence.cues.length && age >= sequence.cues[sequence.next].at) {
        latest = sequence.cues[sequence.next++];
      }
      // A stalled frame can skip a strike without bunching several together.
      if (latest) this.emit(latest.sound);
      if (sequence.next === sequence.cues.length) this.sequences.splice(i, 1);
    }
  }
}

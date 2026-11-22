// Milestone 33 (sound): keeping a horde pleasant, with no Web Audio here so
// it is unit tested (mixer.test.ts). All times are real milliseconds
// (performance.now()), never game time, so thinning behaves the same at
// 1x, 2x and 3x.
//
// - Thinning: a sound started again within THIN_MS of its last start is
//   dropped. Each start's level falls as the same sound's starts in the last
//   RECENT_MS rise (repeatLevel).
// - Voice cap: at most MAX_VOICES sound at once. A new sound at the cap
//   pushes out the live voice that ranks lowest (lowest priority, then
//   quietest, then oldest) if that voice's priority is not above its own;
//   otherwise the new sound is dropped. Big moments (boss, specials,
//   jingles) therefore always get a voice, and hit ticks go first.

export const THIN_MS = 50;
export const RECENT_MS = 400;
export const MAX_VOICES = 16;
/** The quietest a repeated sound gets. */
export const MIN_REPEAT_LEVEL = 0.3;
/** Each recent start of the same sound lowers the level by this share (1 / (1 + k n)). */
export const REPEAT_FALLOFF = 0.25;

/** The level of a start when the same sound started `recent` times in the last RECENT_MS. */
export function repeatLevel(recent: number): number {
  return Math.max(MIN_REPEAT_LEVEL, 1 / (1 + REPEAT_FALLOFF * Math.max(0, recent)));
}

export interface VoiceInfo {
  id: number;
  name: string;
  priority: number;
  level: number;
  startMs: number;
  endMs: number;
}

/** Whether voice `a` should go before voice `b` at the cap: lower priority, then quieter, then older. */
export function dropsBefore(a: VoiceInfo, b: VoiceInfo): boolean {
  if (a.priority !== b.priority) return a.priority < b.priority;
  if (a.level !== b.level) return a.level < b.level;
  return a.startMs < b.startMs;
}

export type Decision =
  | { action: 'play'; id: number; level: number; evict: number | null }
  | { action: 'thin' }
  | { action: 'cap' };

export class Mixer {
  private readonly starts = new Map<string, number[]>();
  private voices: VoiceInfo[] = [];
  private nextId = 1;

  constructor(private readonly maxVoices = MAX_VOICES) {}

  /** Voices still sounding at `nowMs`. */
  live(nowMs: number): VoiceInfo[] {
    this.voices = this.voices.filter((v) => v.endMs > nowMs);
    return this.voices;
  }

  /** A sound `name` of `priority` and `lengthMs` wants to start at `nowMs`: play it (maybe pushing a voice out), thin it, or drop it at the cap. */
  request(name: string, priority: number, lengthMs: number, nowMs: number): Decision {
    const recent = (this.starts.get(name) ?? []).filter((t) => nowMs - t < RECENT_MS);
    this.starts.set(name, recent);
    const last = recent[recent.length - 1];
    if (last !== undefined && nowMs - last < THIN_MS) return { action: 'thin' };
    const level = repeatLevel(recent.length);
    const live = this.live(nowMs);
    const voice: VoiceInfo = { id: this.nextId, name, priority, level, startMs: nowMs, endMs: nowMs + lengthMs };
    let evict: number | null = null;
    if (live.length >= this.maxVoices) {
      let victim = live[0];
      for (const v of live) if (dropsBefore(v, victim)) victim = v;
      if (victim.priority > priority) return { action: 'cap' };
      evict = victim.id;
      this.voices = live.filter((v) => v.id !== victim.id);
    }
    this.nextId += 1;
    recent.push(nowMs);
    this.voices.push(voice);
    return { action: 'play', id: voice.id, level, evict };
  }

  /** Forget every voice (the context was closed or suspended). */
  clear(): void {
    this.voices = [];
    this.starts.clear();
  }
}

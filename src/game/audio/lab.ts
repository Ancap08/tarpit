// Milestone 33 (sound): offline rendering with OfflineAudioContext, for the
// tests (e2e/sound-render.spec.ts) and the owner's listening file
// (scripts/render-sounds.ts). Reached through window.__tarpit.audioLab.
// Nothing here runs during play.

import { TRAVEL_MS } from '../fx/fxMath';
import { Mixer } from './mixer';
import { deathSound, RECIPES, recipeLength, SOUND_NAMES, type SoundName } from './recipes';
import { masterChain, schedule } from './synth';

export interface RenderStats {
  name: string;
  /** The recipe's stated length (s) and the rendered buffer's length (s). */
  length: number;
  rendered: number;
  peak: number;
  /** RMS over the stated length. */
  rms: number;
  /** Largest sample in the last 5 ms of the stated length (the cut). */
  tailMax: number;
  /** Largest sample after the stated length plus 20 ms. */
  afterMax: number;
}

const PAD_S = 0.1;

function stats(name: string, data: Float32Array, rate: number, length: number): RenderStats {
  const n = Math.min(data.length, Math.round(length * rate));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let i = 0; i < n; i++) sum += data[i] * data[i];
  let tailMax = 0;
  for (let i = Math.max(0, n - Math.round(0.005 * rate)); i < n; i++) tailMax = Math.max(tailMax, Math.abs(data[i]));
  let afterMax = 0;
  for (let i = n + Math.round(0.02 * rate); i < data.length; i++) afterMax = Math.max(afterMax, Math.abs(data[i]));
  return { name, length, rendered: data.length / rate, peak, rms: Math.sqrt(sum / Math.max(1, n)), tailMax, afterMax };
}

/** Render one recipe alone (no master chain: the peak before the limiter). */
export async function renderOne(name: SoundName, rate = 44100): Promise<RenderStats> {
  const recipe = RECIPES[name];
  const length = recipeLength(recipe);
  const ctx = new OfflineAudioContext(1, Math.ceil((length + PAD_S) * rate), rate);
  schedule(ctx, recipe, ctx.destination, 0);
  const buf = await ctx.startRendering();
  return stats(name, buf.getChannelData(0), rate, length);
}

/** A cue in a scripted mix: a sound at a time (s). */
interface Cue {
  t: number;
  name: SoundName;
}

/** Schedule `cues` through the mixer (thinned and capped as in play, by their times) into `dest`. */
function scheduleCues(ctx: BaseAudioContext, cues: Cue[], dest: AudioNode, offset: number, thin: boolean): { played: number; thinned: number; capped: number; maxVoices: number } {
  const mixer = new Mixer();
  const out = { played: 0, thinned: 0, capped: 0, maxVoices: 0 };
  for (const c of [...cues].sort((a, b) => a.t - b.t)) {
    const recipe = RECIPES[c.name];
    if (!thin) {
      schedule(ctx, recipe, dest, offset + c.t);
      out.played += 1;
      continue;
    }
    const d = mixer.request(c.name, recipe.priority, recipeLength(recipe) * 1000, c.t * 1000);
    if (d.action === 'thin') out.thinned += 1;
    else if (d.action === 'cap') out.capped += 1;
    else {
      // An evicted voice is cut short in play; offline it rings on, which only overstates the load.
      schedule(ctx, recipe, dest, offset + c.t, d.level);
      out.played += 1;
      out.maxVoices = Math.max(out.maxVoices, mixer.live(c.t * 1000).length);
    }
  }
  return out;
}

/** A small fixed pseudo-random sequence (no Math.random, so every render is the same). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TOWERS = ['musketeer', 'longbow', 'cannon', 'mortar', 'tarpit', 'firepot'] as const;

/** The worst case: 40 shots, 40 impacts and 40 deaths in half a second. */
function worstCues(): Cue[] {
  const r = lcg(33);
  const cues: Cue[] = [];
  for (let i = 0; i < 40; i++) {
    const tower = TOWERS[i % TOWERS.length];
    cues.push({ t: r() * 0.5, name: `shot.${tower}` as SoundName });
    cues.push({ t: r() * 0.5, name: `impact.${tower}` as SoundName });
    cues.push({ t: r() * 0.5, name: deathSound(['goblin', 'wolf', 'troll'][i % 3]) });
  }
  return cues;
}

/** Render the worst case through the master chain; `thin` false skips the mixer (the limiter alone). */
export async function renderWorstCase(thin = true, rate = 44100): Promise<RenderStats & { played: number; thinned: number; capped: number; maxVoices: number }> {
  const ctx = new OfflineAudioContext(1, Math.ceil(1.2 * rate), rate);
  const bus = masterChain(ctx);
  const counts = scheduleCues(ctx, worstCues(), bus.input, 0, thin);
  const buf = await ctx.startRendering();
  return { ...stats(thin ? 'worst case' : 'worst case, no thinning', buf.getChannelData(0), rate, 1.2), ...counts };
}

/** A 10 s busy wave: six towers firing, impacts on arrival, hits, deaths, an exit, a keg, the charge and the clear. */
export function busyWaveCues(): Cue[] {
  const r = lcg(7);
  const cues: Cue[] = [{ t: 0, name: 'waveStart' }];
  const every: Record<(typeof TOWERS)[number], number> = { musketeer: 0.42, longbow: 0.7, cannon: 1.1, mortar: 2.0, tarpit: 1.3, firepot: 0.9 };
  let impacts = 0;
  for (const tower of TOWERS) {
    for (let t = 0.8 + r() * 0.5; t < 9.0; t += every[tower] * (0.9 + r() * 0.2)) {
      cues.push({ t, name: `shot.${tower}` as SoundName });
      const land = t + TRAVEL_MS[tower] / 1000;
      cues.push({ t: land, name: `impact.${tower}` as SoundName });
      cues.push({ t: land, name: 'hit' });
      impacts += 1;
      if (impacts % 4 === 0) cues.push({ t: land, name: deathSound(['goblin', 'wolf', 'goblin', 'troll', 'shieldbearer'][impacts % 5]) });
    }
  }
  cues.push({ t: 4.2, name: 'exit' }, { t: 5.5, name: 'special.keg' }, { t: 5.5, name: 'death.small' }, { t: 5.52, name: 'death.medium' });
  cues.push({ t: 8.2, name: 'chargeReady' }, { t: 9.5, name: 'waveClear' });
  return cues;
}

/** The owner's listening reel: each sound in turn with a gap, then the busy wave. */
export const REEL_GAP_S = 0.4;
export const BUSY_WAVE_S = 10.5;

export async function renderReel(rate = 22050): Promise<{ rate: number; pcm16: string; order: { name: string; at: number; length: number }[]; peak: number; busyAt: number }> {
  const order: { name: string; at: number; length: number }[] = [];
  let t = 0.3;
  for (const name of SOUND_NAMES) {
    const length = recipeLength(RECIPES[name]);
    order.push({ name, at: t, length });
    t += length + REEL_GAP_S;
  }
  const busyAt = t + 0.6;
  const total = busyAt + BUSY_WAVE_S;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * rate), rate);
  const bus = masterChain(ctx);
  for (const o of order) schedule(ctx, RECIPES[o.name as SoundName], bus.input, o.at);
  scheduleCues(ctx, busyWaveCues(), bus.input, busyAt, true);
  const data = (await ctx.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(data.length * 2);
  const view = new DataView(bytes.buffer);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    peak = Math.max(peak, Math.abs(data[i]));
    view.setInt16(i * 2, Math.round(v * 32767), true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { rate, pcm16: btoa(bin), order, peak, busyAt };
}

export const audioLab = {
  names: (): string[] => [...SOUND_NAMES],
  render: (name: string) => renderOne(name as SoundName),
  worstCase: (thin = true) => renderWorstCase(thin),
  reel: () => renderReel(),
};

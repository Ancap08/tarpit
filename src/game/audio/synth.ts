// Milestone 33 (sound): the synth. schedule() builds one recipe
// (recipes.ts) as Web Audio nodes on any BaseAudioContext, so the same code
// plays live (engine.ts) and renders offline for the tests and the owner's
// listening file (lab.ts). masterChain() is the mix bus every voice goes
// through: a level, then a DynamicsCompressorNode set as a limiter.

import { layerEnd, recipeLength, type Layer, type Recipe } from './recipes';

/** The mix bus level before the limiter. */
export const MASTER_LEVEL = 0.6;
/** The limiter: a fast, hard compressor just under full scale. */
export const LIMITER = { threshold: -6, knee: 0, ratio: 20, attack: 0.002, release: 0.12 } as const;
/** Exponential decays end at this gain (-80 dB), then the gain is set to 0. */
const FLOOR = 0.0001;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per context, from a fixed seed so every render is the same. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6b1d3;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0x100000000) * 2 - 1;
  }
  noiseBuffers.set(ctx, buf);
  return buf;
}

/** A sound being played: its output gain (for an early stop) and its sources. */
export interface Scheduled {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  /** Context time when it ends. */
  end: number;
}

function buildLayer(ctx: BaseAudioContext, layer: Layer, when: number, out: AudioNode): AudioScheduledSourceNode {
  const t0 = when + (layer.at ?? 0);
  const { a, h = 0 } = layer.env;
  const peakAt = t0 + a;
  const end = when + layerEnd(layer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(layer.gain, peakAt);
  if (h > 0) g.gain.setValueAtTime(layer.gain, peakAt + h);
  g.gain.exponentialRampToValueAtTime(FLOOR * layer.gain, end);
  g.gain.setValueAtTime(0, end);

  let src: AudioScheduledSourceNode;
  if (layer.kind === 'tone') {
    const o = ctx.createOscillator();
    o.type = layer.wave;
    o.frequency.setValueAtTime(layer.f0, t0);
    if (layer.f1 !== undefined) o.frequency.exponentialRampToValueAtTime(layer.f1, end);
    src = o;
  } else {
    const b = ctx.createBufferSource();
    b.buffer = noiseBuffer(ctx);
    b.loop = true;
    src = b;
  }
  let node: AudioNode = src;
  if (layer.filter) {
    const f = ctx.createBiquadFilter();
    f.type = layer.filter.type;
    f.Q.value = layer.filter.q ?? 0.707;
    f.frequency.setValueAtTime(layer.filter.f0, t0);
    if (layer.filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(layer.filter.f1, end);
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(end + 0.01);
  return src;
}

/** Schedule `recipe` at context time `when` into `dest`, at `level` (0..1, from the mixer). */
export function schedule(ctx: BaseAudioContext, recipe: Recipe, dest: AudioNode, when: number, level = 1): Scheduled {
  const out = ctx.createGain();
  out.gain.value = recipe.gain * level;
  out.connect(dest);
  const sources = recipe.layers.map((layer) => buildLayer(ctx, layer, when, out));
  const end = when + recipeLength(recipe);
  // Free the nodes once the last source ends.
  const last = sources[recipe.layers.reduce((best, l, i, all) => (layerEnd(l) > layerEnd(all[best]) ? i : best), 0)];
  last.onended = () => out.disconnect();
  return { out, sources, end };
}

/** Stop a sound early with a 5 ms fade, so the cut does not click. */
export function fadeOut(ctx: BaseAudioContext, s: Scheduled): void {
  const now = ctx.currentTime;
  s.out.gain.cancelScheduledValues(now);
  s.out.gain.setValueAtTime(s.out.gain.value, now);
  s.out.gain.linearRampToValueAtTime(0, now + 0.005);
  for (const src of s.sources) {
    try {
      src.stop(now + 0.01);
    } catch {
      // Already stopped.
    }
  }
}

/** The mix bus: input -> level -> limiter -> mute gain -> destination. Voices connect to `input`. */
export function masterChain(ctx: BaseAudioContext): { input: GainNode; mute: GainNode; limiter: DynamicsCompressorNode } {
  const input = ctx.createGain();
  input.gain.value = MASTER_LEVEL;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  const mute = ctx.createGain();
  input.connect(limiter);
  limiter.connect(mute);
  mute.connect(ctx.destination);
  return { input, mute, limiter };
}

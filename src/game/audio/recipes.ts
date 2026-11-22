// Milestone 33 (sound): every sound in the game as data, synthesized with
// the Web Audio API by synth.ts. No samples and no audio files.
//
// A recipe is a list of layers, each an oscillator ("tone") or a burst of
// noise, with an envelope (attack, hold, then an exponential decay to
// silence), an optional pitch slide, and an optional filter with its own
// sweep. `gain` scales the whole recipe; `priority` decides which voices
// the voice cap drops first (mixer.ts). No Web Audio and no Phaser here, so
// the lengths and the headroom rule are unit tested.
//
// Headroom rule: the peak gains of the layers sounding at once, times the
// recipe gain, add up to at most HEADROOM (a filter with Q at most 1.2 does not raise the peak), so
// no sound on its own can reach 1.0 before the limiter. Offline rendering
// (e2e/sound-render.spec.ts) checks the real peaks.

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type FilterKind = 'lowpass' | 'highpass' | 'bandpass';

export interface Filter {
  type: FilterKind;
  /** Cut-off (Hz) at the layer's start, and where it sweeps to over the layer (exponential). */
  f0: number;
  f1?: number;
  q?: number;
}

/** Attack (linear rise), hold at the peak, decay (exponential, to silence), in seconds. */
export interface Envelope {
  a: number;
  h?: number;
  d: number;
}

interface LayerBase {
  /** Start, in seconds from the sound's start. */
  at?: number;
  env: Envelope;
  /** Peak gain, before the recipe gain. */
  gain: number;
  filter?: Filter;
}

export interface ToneLayer extends LayerBase {
  kind: 'tone';
  wave: Wave;
  /** Pitch at the start (Hz), and where it slides to over the whole layer (exponential). */
  f0: number;
  f1?: number;
}

export interface NoiseLayer extends LayerBase {
  kind: 'noise';
}

export type Layer = ToneLayer | NoiseLayer;

/** Voice priorities (mixer.ts): a higher one may push a lower one out at the voice cap. */
export const PRIORITY = {
  tick: 0,
  shot: 1,
  impact: 2,
  death: 2,
  ui: 3,
  moment: 4,
  big: 5,
} as const;

export interface Recipe {
  gain: number;
  priority: number;
  layers: Layer[];
}

/** The sum of a recipe's layer peaks times its gain stays at or under this. */
export const HEADROOM = 0.9;

export const SOUND_NAMES = [
  'shot.musketeer',
  'impact.musketeer',
  'shot.longbow',
  'impact.longbow',
  'shot.cannon',
  'impact.cannon',
  'shot.mortar',
  'impact.mortar',
  'shot.tarpit',
  'impact.tarpit',
  'shot.firepot',
  'impact.firepot',
  'hit',
  'death.small',
  'death.medium',
  'death.large',
  'exit',
  'build',
  'upgrade',
  'sell',
  'refuse',
  'tap',
  'select',
  'special.keg',
  'special.tarBarrel',
  'special.fireArrows',
  'chargeReady',
  'waveStart',
  'waveClear',
  'callNext',
  'bossArrive',
  'bossFall',
  'win',
  'lose',
  'coin',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

const tone = (wave: Wave, f0: number, f1: number | undefined, env: Envelope, gain: number, extra: Partial<ToneLayer> = {}): ToneLayer => ({
  kind: 'tone',
  wave,
  f0,
  ...(f1 === undefined ? {} : { f1 }),
  env,
  gain,
  ...extra,
});

const noise = (filter: Filter, env: Envelope, gain: number, at = 0): NoiseLayer => ({ kind: 'noise', filter, env, gain, at });

/** A note of a tune: a triangle with a quiet square an octave down for body. */
function note(freq: number, at: number, h: number, d: number, gain: number): Layer[] {
  return [
    tone('triangle', freq, undefined, { a: 0.008, h, d }, gain, { at }),
    tone('square', freq / 2, undefined, { a: 0.008, h, d: d * 0.8 }, gain * 0.25, { at, filter: { type: 'lowpass', f0: 1800 } }),
  ];
}

// Note frequencies (Hz).
const C3 = 130.81;
const C4 = 261.63;
const E4 = 329.63;
const G4 = 392.0;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const C6 = 1046.5;
const D6 = 1174.66;
const E6 = 1318.51;
const G6 = 1567.98;

export const RECIPES: Readonly<Record<SoundName, Recipe>> = {
  // Towers: a shot when fired, an impact when the drawn projectile lands.
  'shot.musketeer': {
    gain: 0.48,
    priority: PRIORITY.shot,
    layers: [noise({ type: 'highpass', f0: 2400, f1: 1200 }, { a: 0.001, d: 0.08 }, 0.6), tone('square', 900, 260, { a: 0.001, d: 0.04 }, 0.18)],
  },
  'impact.musketeer': {
    gain: 0.39,
    priority: PRIORITY.impact,
    layers: [tone('triangle', 1900, 1300, { a: 0.001, d: 0.03 }, 0.4), noise({ type: 'bandpass', f0: 3200, q: 1 }, { a: 0.001, d: 0.02 }, 0.25)],
  },
  'shot.longbow': {
    gain: 0.48,
    priority: PRIORITY.shot,
    layers: [
      tone('triangle', 560, 330, { a: 0.002, d: 0.18 }, 0.5),
      tone('sawtooth', 280, 165, { a: 0.002, d: 0.12 }, 0.2, { filter: { type: 'lowpass', f0: 1400, f1: 500 } }),
    ],
  },
  'impact.longbow': {
    gain: 0.52,
    priority: PRIORITY.impact,
    layers: [tone('sine', 190, 70, { a: 0.002, d: 0.1 }, 0.6), noise({ type: 'lowpass', f0: 700 }, { a: 0.001, d: 0.05 }, 0.3)],
  },
  'shot.cannon': {
    gain: 0.51,
    priority: PRIORITY.shot,
    layers: [tone('sine', 140, 48, { a: 0.003, d: 0.22 }, 0.65), noise({ type: 'lowpass', f0: 500, f1: 150 }, { a: 0.002, d: 0.12 }, 0.4)],
  },
  'impact.cannon': {
    gain: 0.55,
    priority: PRIORITY.impact,
    layers: [tone('sine', 95, 35, { a: 0.004, d: 0.4 }, 0.6), noise({ type: 'lowpass', f0: 1400, f1: 180 }, { a: 0.003, d: 0.34 }, 0.45)],
  },
  // The Mortar's whistle falls during the 320 ms flight (fxMath TRAVEL_MS) at 1x and ends by 0.26 s.
  'shot.mortar': {
    gain: 0.51,
    priority: PRIORITY.shot,
    layers: [
      tone('sine', 320, 170, { a: 0.002, d: 0.07 }, 0.6),
      noise({ type: 'bandpass', f0: 600, q: 1 }, { a: 0.001, d: 0.04 }, 0.2),
      tone('sine', 1900, 750, { a: 0.03, h: 0.06, d: 0.13 }, 0.1, { at: 0.04 }),
    ],
  },
  'impact.mortar': {
    gain: 0.59,
    priority: PRIORITY.impact,
    layers: [tone('sine', 72, 28, { a: 0.005, d: 0.55 }, 0.55), noise({ type: 'lowpass', f0: 1000, f1: 120 }, { a: 0.003, d: 0.5 }, 0.45)],
  },
  'shot.tarpit': {
    gain: 0.48,
    priority: PRIORITY.shot,
    layers: [
      tone('sine', 210, 520, { a: 0.006, d: 0.12 }, 0.55, { filter: { type: 'lowpass', f0: 1200 } }),
      noise({ type: 'bandpass', f0: 800, q: 1 }, { a: 0.003, d: 0.06 }, 0.2),
    ],
  },
  'impact.tarpit': {
    gain: 0.52,
    priority: PRIORITY.impact,
    layers: [noise({ type: 'lowpass', f0: 1600, f1: 300 }, { a: 0.002, d: 0.15 }, 0.6), tone('sine', 170, 60, { a: 0.002, d: 0.1 }, 0.35)],
  },
  'shot.firepot': {
    gain: 0.95,
    priority: PRIORITY.shot,
    layers: [noise({ type: 'bandpass', f0: 400, f1: 1800, q: 1 }, { a: 0.04, d: 0.2 }, 0.85)],
  },
  'impact.firepot': {
    gain: 0.52,
    priority: PRIORITY.impact,
    layers: [
      noise({ type: 'highpass', f0: 2500 }, { a: 0.001, d: 0.04 }, 0.45),
      noise({ type: 'highpass', f0: 3000 }, { a: 0.001, d: 0.035 }, 0.3, 0.05),
      noise({ type: 'highpass', f0: 2200 }, { a: 0.001, d: 0.04 }, 0.25, 0.11),
      noise({ type: 'lowpass', f0: 900 }, { a: 0.01, d: 0.12 }, 0.25),
    ],
  },
  // Enemies.
  hit: {
    gain: 0.2,
    priority: PRIORITY.tick,
    layers: [tone('triangle', 1400, 1000, { a: 0.001, d: 0.02 }, 0.5)],
  },
  'death.small': {
    gain: 0.52,
    priority: PRIORITY.death,
    layers: [tone('sine', 950, 320, { a: 0.002, d: 0.09 }, 0.6), noise({ type: 'bandpass', f0: 1800, q: 1 }, { a: 0.001, d: 0.04 }, 0.25)],
  },
  'death.medium': {
    gain: 0.56,
    priority: PRIORITY.death,
    layers: [tone('sine', 600, 180, { a: 0.002, d: 0.14 }, 0.6), noise({ type: 'lowpass', f0: 1500 }, { a: 0.002, d: 0.07 }, 0.3)],
  },
  'death.large': {
    gain: 0.59,
    priority: PRIORITY.death,
    layers: [tone('sine', 300, 65, { a: 0.003, d: 0.3 }, 0.6), noise({ type: 'lowpass', f0: 800, f1: 200 }, { a: 0.003, d: 0.2 }, 0.4)],
  },
  exit: {
    gain: 0.8,
    priority: PRIORITY.moment,
    layers: [
      tone('square', 165, 160, { a: 0.01, h: 0.12, d: 0.1 }, 0.3, { filter: { type: 'lowpass', f0: 900 } }),
      tone('square', 123, 118, { a: 0.01, h: 0.13, d: 0.14 }, 0.3, { at: 0.17, filter: { type: 'lowpass', f0: 800 } }),
    ],
  },
  // Player actions.
  build: {
    gain: 0.75,
    priority: PRIORITY.ui,
    layers: [
      noise({ type: 'lowpass', f0: 800 }, { a: 0.002, d: 0.06 }, 0.3),
      tone('triangle', 440, undefined, { a: 0.004, d: 0.08 }, 0.35),
      tone('triangle', 660, undefined, { a: 0.004, d: 0.14 }, 0.35, { at: 0.07 }),
    ],
  },
  upgrade: {
    gain: 0.7,
    priority: PRIORITY.ui,
    layers: [C5, E5, G5, C6].map((f, i) => tone('triangle', f, undefined, { a: 0.004, d: 0.14 }, 0.32, { at: i * 0.06 })),
  },
  sell: {
    gain: 0.7,
    priority: PRIORITY.ui,
    layers: [tone('triangle', G5, undefined, { a: 0.004, d: 0.08 }, 0.4), tone('triangle', C5, undefined, { a: 0.004, d: 0.18 }, 0.4, { at: 0.07 })],
  },
  refuse: {
    gain: 0.75,
    priority: PRIORITY.ui,
    layers: [
      tone('square', 150, undefined, { a: 0.004, h: 0.07, d: 0.04 }, 0.3, { filter: { type: 'lowpass', f0: 900 } }),
      tone('square', 118, undefined, { a: 0.004, h: 0.07, d: 0.06 }, 0.3, { at: 0.11, filter: { type: 'lowpass', f0: 800 } }),
    ],
  },
  tap: {
    gain: 0.5,
    priority: PRIORITY.ui,
    layers: [tone('triangle', 1250, 900, { a: 0.001, d: 0.03 }, 0.6)],
  },
  select: {
    gain: 0.6,
    priority: PRIORITY.ui,
    layers: [tone('sine', 880, undefined, { a: 0.003, d: 0.08 }, 0.45), tone('sine', 1320, undefined, { a: 0.003, d: 0.09 }, 0.3, { at: 0.035 })],
  },
  // Specials.
  'special.keg': {
    gain: 0.9,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'highpass', f0: 1800 }, { a: 0.001, d: 0.05 }, 0.2),
      tone('sine', 85, 25, { a: 0.005, d: 0.75 }, 0.4),
      noise({ type: 'lowpass', f0: 2600, f1: 140 }, { a: 0.002, d: 0.7 }, 0.4),
    ],
  },
  'special.tarBarrel': {
    gain: 0.9,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'lowpass', f0: 1300, f1: 220 }, { a: 0.003, d: 0.35 }, 0.45),
      tone('sine', 125, 40, { a: 0.003, d: 0.3 }, 0.35),
      tone('sine', 300, 620, { a: 0.005, d: 0.08 }, 0.12, { at: 0.13, filter: { type: 'lowpass', f0: 1200 } }),
      tone('sine', 260, 560, { a: 0.005, d: 0.08 }, 0.08, { at: 0.24, filter: { type: 'lowpass', f0: 1200 } }),
    ],
  },
  'special.fireArrows': {
    gain: 0.85,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'bandpass', f0: 500, f1: 3000, q: 1 }, { a: 0.15, d: 0.22 }, 0.55),
      ...[0.3, 0.36, 0.44, 0.51].map((at, i) => noise({ type: 'highpass', f0: 2400 + i * 300 }, { a: 0.001, d: 0.04 }, 0.3, at)),
    ],
  },
  chargeReady: {
    gain: 0.66,
    priority: PRIORITY.moment,
    layers: [tone('sine', G6, undefined, { a: 0.005, d: 0.35 }, 0.5), tone('sine', 2349.3, undefined, { a: 0.005, d: 0.2 }, 0.15)],
  },
  // Moments.
  waveStart: {
    gain: 0.98,
    priority: PRIORITY.moment,
    layers: [
      tone('sawtooth', G4, undefined, { a: 0.03, h: 0.14, d: 0.1 }, 0.28, { filter: { type: 'lowpass', f0: 1500 } }),
      tone('triangle', G4 * 1.003, undefined, { a: 0.03, h: 0.14, d: 0.1 }, 0.2),
      tone('sawtooth', C5, undefined, { a: 0.03, h: 0.2, d: 0.2 }, 0.28, { at: 0.27, filter: { type: 'lowpass', f0: 1700 } }),
      tone('triangle', C5 * 1.003, undefined, { a: 0.03, h: 0.2, d: 0.2 }, 0.2, { at: 0.27 }),
    ],
  },
  waveClear: {
    gain: 0.65,
    priority: PRIORITY.moment,
    layers: [G5, B5, D6, G6].map((f, i) => tone('sine', f, undefined, { a: 0.004, d: 0.3 }, 0.32, { at: i * 0.07 })),
  },
  callNext: {
    gain: 0.98,
    priority: PRIORITY.moment,
    layers: [
      tone('sawtooth', C5, undefined, { a: 0.02, h: 0.05, d: 0.06 }, 0.3, { filter: { type: 'lowpass', f0: 1600 } }),
      tone('sawtooth', E5, undefined, { a: 0.02, h: 0.08, d: 0.12 }, 0.3, { at: 0.13, filter: { type: 'lowpass', f0: 1800 } }),
    ],
  },
  bossArrive: {
    gain: 0.9,
    priority: PRIORITY.big,
    layers: [
      tone('sawtooth', 55, 52, { a: 0.35, h: 0.55, d: 0.5 }, 0.25, { filter: { type: 'lowpass', f0: 260, f1: 420 } }),
      tone('sawtooth', 55.7, 52.6, { a: 0.35, h: 0.55, d: 0.5 }, 0.2, { filter: { type: 'lowpass', f0: 300 } }),
      tone('sine', 95, 30, { a: 0.004, d: 0.3 }, 0.25),
      noise({ type: 'lowpass', f0: 320 }, { a: 0.003, d: 0.2 }, 0.2),
      tone('sine', 95, 30, { a: 0.004, d: 0.35 }, 0.25, { at: 0.62 }),
    ],
  },
  bossFall: {
    gain: 0.95,
    priority: PRIORITY.big,
    layers: [
      tone('sine', 75, 20, { a: 0.005, d: 1.4 }, 0.38),
      noise({ type: 'lowpass', f0: 3200, f1: 90 }, { a: 0.002, d: 1.2 }, 0.35),
      tone('sawtooth', 210, 38, { a: 0.02, d: 1.1 }, 0.17, { at: 0.06, filter: { type: 'lowpass', f0: 900, f1: 200 } }),
    ],
  },
  win: {
    gain: 0.75,
    priority: PRIORITY.big,
    layers: [
      ...note(C5, 0, 0.08, 0.12, 0.35),
      ...note(E5, 0.15, 0.08, 0.12, 0.35),
      ...note(G5, 0.3, 0.08, 0.12, 0.35),
      ...note(C6, 0.45, 0.08, 0.12, 0.35),
      ...note(G5, 0.65, 0.35, 0.75, 0.22),
      ...note(C6, 0.65, 0.35, 0.75, 0.22),
      ...note(E6, 0.65, 0.35, 0.75, 0.18),
    ],
  },
  lose: {
    gain: 1.2,
    priority: PRIORITY.big,
    layers: [
      ...note(G4, 0, 0.16, 0.14, 0.4),
      ...note(E4, 0.32, 0.16, 0.14, 0.4),
      ...note(C4, 0.64, 0.16, 0.14, 0.4),
      tone('sawtooth', C3, C3 * 0.94, { a: 0.02, h: 0.3, d: 0.65 }, 0.3, { at: 0.96, filter: { type: 'lowpass', f0: 700, f1: 250 } }),
      tone('triangle', C3 / 2, undefined, { a: 0.02, h: 0.3, d: 0.65 }, 0.25, { at: 0.96 }),
    ],
  },
  coin: {
    gain: 0.6,
    priority: PRIORITY.ui,
    layers: [tone('square', B5, undefined, { a: 0.002, h: 0.05, d: 0.02 }, 0.25), tone('square', E6, undefined, { a: 0.002, d: 0.35 }, 0.25, { at: 0.07 })],
  },
};

/** When a layer ends (seconds from the sound's start). */
export function layerEnd(layer: Layer): number {
  return (layer.at ?? 0) + layer.env.a + (layer.env.h ?? 0) + layer.env.d;
}

/** A recipe's stated length: when its last layer ends (seconds). */
export function recipeLength(recipe: Recipe): number {
  return Math.max(...recipe.layers.map(layerEnd));
}

/**
 * The headroom bound: the most layer peaks sounding at once (a layer sounds
 * from its start to its end), times the recipe gain. An upper bound on the
 * sound's peak, since a decaying layer is below its peak.
 */
export function peakBound(recipe: Recipe): number {
  let most = 0;
  for (const t of recipe.layers.map((l) => l.at ?? 0)) {
    const sum = recipe.layers.filter((l) => (l.at ?? 0) <= t && t < layerEnd(l)).reduce((s, l) => s + l.gain, 0);
    most = Math.max(most, sum);
  }
  return recipe.gain * most;
}

/** The death pop for an enemy type: Goblin and Harpy high, Wolf and Shieldbearer middle, Troll low (the boss falls with bossFall). */
export function deathSound(type: string): SoundName {
  if (type === 'troll') return 'death.large';
  if (type === 'wolf' || type === 'shieldbearer') return 'death.medium';
  return 'death.small';
}

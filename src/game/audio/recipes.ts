// Milestone 33 (sound): every sound in the game as data, synthesized with
// the Web Audio API by synth.ts. No samples and no audio files.
//
// A recipe is a list of layers, each an oscillator ("tone") or a burst of
// noise, with an envelope (attack, hold, then an exponential decay to
// silence), an optional pitch slide, and an optional filter with its own
// sweep. `gain` scales the whole recipe; `priority` decides which voices
// the voice cap drops first (mixer.ts). No Web Audio and no Phaser here, so
// the lengths are unit tested.
//
// Headroom rule: every sound on its own peaks at or below HEADROOM (0.9)
// before the limiter, measured by offline rendering
// (e2e/sound-render.spec.ts).
// Levels (milestone 33 follow-up): each sound's short-term loudness (the
// RMS of its loudest 50 ms, before the master chain) sits in its tier's
// band (LEVEL_TIERS): hit ticks quietest, shots under impacts and deaths,
// player actions beside them, wave moments above, big moments on top.
// Small speakers: the low sounds (LOW_SOUNDS) carry a mid layer (200 to
// 900 Hz), so they keep their shape through a 200 Hz high-pass.

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
  /** Milestone 33 follow-up: the thinning window in ms for this sound (mixer.ts THIN_MS when left out). */
  thin?: number;
  layers: Layer[];
}

/** Thinning windows (ms): the smallest, most frequent sounds and the exit warning repeat less often. */
export const SMALL_THIN_MS = 120;
export const EXIT_THIN_MS = 400;

/** The most a sound alone may peak, before the limiter (measured offline). */
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
  'upgradePath',
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
  'boonOffer',
  'boonPick',
  'act2',
  'packCall',
  'grumblemawArrive',
  'grumblemawFall',
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
    gain: 0.518,
    priority: PRIORITY.shot,
    layers: [noise({ type: 'highpass', f0: 2400, f1: 1200 }, { a: 0.001, d: 0.08 }, 0.6), tone('square', 900, 260, { a: 0.001, d: 0.04 }, 0.18)],
  },
  'impact.musketeer': {
    gain: 0.948,
    priority: PRIORITY.impact,
    thin: SMALL_THIN_MS,
    layers: [
      tone('triangle', 1900, 1300, { a: 0.001, d: 0.03 }, 0.3),
      noise({ type: 'bandpass', f0: 3200, q: 1 }, { a: 0.001, d: 0.02 }, 0.2),
      // A little wooden body under the tick.
      tone('sine', 700, 420, { a: 0.002, d: 0.05 }, 0.35),
    ],
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
    gain: 0.6,
    priority: PRIORITY.impact,
    layers: [tone('sine', 190, 70, { a: 0.002, d: 0.1 }, 0.6), noise({ type: 'lowpass', f0: 700 }, { a: 0.001, d: 0.05 }, 0.3)],
  },
  'shot.cannon': {
    gain: 0.366,
    priority: PRIORITY.shot,
    layers: [
      tone('sine', 140, 48, { a: 0.003, d: 0.22 }, 0.3),
      noise({ type: 'lowpass', f0: 500, f1: 150 }, { a: 0.002, d: 0.12 }, 0.2),
      // Mid body and crack, so it carries on a phone speaker.
      tone('triangle', 320, 150, { a: 0.003, d: 0.16 }, 0.5),
      noise({ type: 'bandpass', f0: 900, f1: 400, q: 0.9 }, { a: 0.002, d: 0.08 }, 0.55),
    ],
  },
  'impact.cannon': {
    gain: 0.442,
    priority: PRIORITY.impact,
    layers: [
      tone('sine', 95, 35, { a: 0.004, d: 0.4 }, 0.28),
      noise({ type: 'lowpass', f0: 1400, f1: 180 }, { a: 0.003, d: 0.34 }, 0.22),
      tone('triangle', 280, 130, { a: 0.004, d: 0.26 }, 0.45),
      noise({ type: 'bandpass', f0: 750, f1: 300, q: 0.8 }, { a: 0.003, d: 0.3 }, 0.6),
    ],
  },
  // The Mortar's whistle falls during the 320 ms flight (fxMath TRAVEL_MS) at 1x and ends by 0.26 s.
  'shot.mortar': {
    gain: 0.464,
    priority: PRIORITY.shot,
    layers: [
      tone('sine', 320, 170, { a: 0.002, d: 0.07 }, 0.6),
      noise({ type: 'bandpass', f0: 600, q: 1 }, { a: 0.001, d: 0.04 }, 0.2),
      tone('sine', 1900, 750, { a: 0.03, h: 0.06, d: 0.13 }, 0.1, { at: 0.04 }),
    ],
  },
  'impact.mortar': {
    gain: 0.416,
    priority: PRIORITY.impact,
    layers: [
      tone('sine', 72, 28, { a: 0.005, d: 0.55 }, 0.26),
      noise({ type: 'lowpass', f0: 1000, f1: 120 }, { a: 0.003, d: 0.5 }, 0.22),
      tone('triangle', 300, 140, { a: 0.005, d: 0.34 }, 0.45),
      noise({ type: 'bandpass', f0: 650, f1: 260, q: 0.8 }, { a: 0.003, d: 0.42 }, 0.6),
    ],
  },
  'shot.tarpit': {
    gain: 0.365,
    priority: PRIORITY.shot,
    layers: [
      tone('sine', 210, 520, { a: 0.006, d: 0.12 }, 0.55, { filter: { type: 'lowpass', f0: 1200 } }),
      noise({ type: 'bandpass', f0: 800, q: 1 }, { a: 0.003, d: 0.06 }, 0.2),
    ],
  },
  'impact.tarpit': {
    gain: 0.91,
    priority: PRIORITY.impact,
    layers: [noise({ type: 'lowpass', f0: 1600, f1: 300 }, { a: 0.002, d: 0.15 }, 0.6), tone('sine', 170, 60, { a: 0.002, d: 0.1 }, 0.35)],
  },
  'shot.firepot': {
    gain: 0.966,
    priority: PRIORITY.shot,
    layers: [noise({ type: 'bandpass', f0: 400, f1: 1800, q: 1 }, { a: 0.04, d: 0.2 }, 0.85)],
  },
  'impact.firepot': {
    gain: 1.387,
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
    gain: 0.241,
    priority: PRIORITY.tick,
    thin: SMALL_THIN_MS,
    layers: [tone('triangle', 1400, 1000, { a: 0.001, d: 0.02 }, 0.5)],
  },
  'death.small': {
    gain: 0.569,
    priority: PRIORITY.death,
    thin: SMALL_THIN_MS,
    layers: [tone('sine', 950, 320, { a: 0.002, d: 0.09 }, 0.6), noise({ type: 'bandpass', f0: 1800, q: 1 }, { a: 0.001, d: 0.04 }, 0.25)],
  },
  'death.medium': {
    gain: 0.514,
    priority: PRIORITY.death,
    layers: [tone('sine', 600, 180, { a: 0.002, d: 0.14 }, 0.6), noise({ type: 'lowpass', f0: 1500 }, { a: 0.002, d: 0.07 }, 0.3)],
  },
  'death.large': {
    gain: 0.492,
    priority: PRIORITY.death,
    layers: [
      tone('sine', 300, 65, { a: 0.003, d: 0.3 }, 0.5),
      noise({ type: 'lowpass', f0: 800, f1: 200 }, { a: 0.003, d: 0.2 }, 0.3),
      tone('triangle', 420, 160, { a: 0.003, d: 0.2 }, 0.2),
    ],
  },
  exit: {
    gain: 0.469,
    priority: PRIORITY.moment,
    thin: EXIT_THIN_MS,
    layers: [
      tone('square', 165, 160, { a: 0.01, h: 0.12, d: 0.1 }, 0.2, { filter: { type: 'lowpass', f0: 900 } }),
      tone('triangle', 330, 320, { a: 0.01, h: 0.12, d: 0.1 }, 0.32),
      tone('square', 123, 118, { a: 0.01, h: 0.13, d: 0.14 }, 0.2, { at: 0.17, filter: { type: 'lowpass', f0: 800 } }),
      tone('triangle', 246, 236, { a: 0.01, h: 0.13, d: 0.14 }, 0.32, { at: 0.17 }),
    ],
  },
  // Player actions.
  build: {
    gain: 0.938,
    priority: PRIORITY.ui,
    layers: [
      noise({ type: 'lowpass', f0: 800 }, { a: 0.002, d: 0.06 }, 0.3),
      tone('triangle', 440, undefined, { a: 0.004, d: 0.08 }, 0.35),
      tone('triangle', 660, undefined, { a: 0.004, d: 0.14 }, 0.35, { at: 0.07 }),
    ],
  },
  upgrade: {
    gain: 1.018,
    priority: PRIORITY.ui,
    layers: [C5, E5, G5, C6].map((f, i) => tone('triangle', f, undefined, { a: 0.004, d: 0.14 }, 0.32, { at: i * 0.06 })),
  },
  upgradePath: {
    gain: 0.9,
    priority: PRIORITY.ui,
    layers: [
      tone('triangle', G5, undefined, { a: 0.004, d: 0.10 }, 0.35),
      tone('triangle', E6, undefined, { a: 0.004, d: 0.14 }, 0.37, { at: 0.075 }),
    ],
  },
  sell: {
    gain: 0.737,
    priority: PRIORITY.ui,
    layers: [tone('triangle', G5, undefined, { a: 0.004, d: 0.08 }, 0.4), tone('triangle', C5, undefined, { a: 0.004, d: 0.18 }, 0.4, { at: 0.07 })],
  },
  refuse: {
    gain: 0.283,
    priority: PRIORITY.ui,
    layers: [
      // Two low, round "bonk" notes falling; a little filtered buzz keeps it a "no", not a melody.
      tone('triangle', 311, 294, { a: 0.006, h: 0.06, d: 0.06 }, 0.45),
      tone('sawtooth', 155, undefined, { a: 0.006, h: 0.06, d: 0.05 }, 0.1, { filter: { type: 'lowpass', f0: 600 } }),
      tone('triangle', 233, 220, { a: 0.006, h: 0.06, d: 0.08 }, 0.45, { at: 0.12 }),
      tone('sawtooth', 116, undefined, { a: 0.006, h: 0.06, d: 0.07 }, 0.1, { at: 0.12, filter: { type: 'lowpass', f0: 500 } }),
    ],
  },
  tap: {
    gain: 0.721,
    priority: PRIORITY.ui,
    layers: [tone('triangle', 1250, 900, { a: 0.001, d: 0.03 }, 0.6)],
  },
  select: {
    gain: 0.56,
    priority: PRIORITY.ui,
    layers: [tone('sine', 880, undefined, { a: 0.003, d: 0.08 }, 0.45), tone('sine', 1320, undefined, { a: 0.003, d: 0.09 }, 0.3, { at: 0.035 })],
  },
  // Specials.
  'special.keg': {
    gain: 1.024,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'highpass', f0: 1800 }, { a: 0.001, d: 0.05 }, 0.2),
      tone('sine', 85, 25, { a: 0.005, d: 0.75 }, 0.22),
      noise({ type: 'lowpass', f0: 2600, f1: 140 }, { a: 0.002, d: 0.7 }, 0.24),
      tone('triangle', 260, 110, { a: 0.005, d: 0.5 }, 0.35),
      noise({ type: 'bandpass', f0: 900, f1: 300, q: 0.8 }, { a: 0.002, d: 0.6 }, 0.6),
    ],
  },
  'special.tarBarrel': {
    gain: 1.904,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'lowpass', f0: 1300, f1: 220 }, { a: 0.003, d: 0.35 }, 0.28),
      tone('sine', 125, 40, { a: 0.003, d: 0.3 }, 0.2),
      noise({ type: 'bandpass', f0: 700, f1: 300, q: 0.8 }, { a: 0.003, d: 0.32 }, 0.5),
      tone('sine', 300, 620, { a: 0.005, d: 0.08 }, 0.12, { at: 0.13, filter: { type: 'lowpass', f0: 1200 } }),
      tone('sine', 260, 560, { a: 0.005, d: 0.08 }, 0.08, { at: 0.24, filter: { type: 'lowpass', f0: 1200 } }),
    ],
  },
  'special.fireArrows': {
    gain: 2.626,
    priority: PRIORITY.big,
    layers: [
      noise({ type: 'bandpass', f0: 500, f1: 3000, q: 1 }, { a: 0.15, d: 0.22 }, 0.55),
      ...[0.3, 0.36, 0.44, 0.51].map((at, i) => noise({ type: 'highpass', f0: 2400 + i * 300 }, { a: 0.001, d: 0.04 }, 0.3, at)),
    ],
  },
  chargeReady: {
    gain: 0.535,
    priority: PRIORITY.moment,
    layers: [tone('sine', G6, undefined, { a: 0.005, d: 0.35 }, 0.5), tone('sine', 2349.3, undefined, { a: 0.005, d: 0.2 }, 0.15)],
  },
  // Moments.
  waveStart: {
    gain: 0.712,
    priority: PRIORITY.moment,
    layers: [
      tone('sawtooth', G4, undefined, { a: 0.03, h: 0.14, d: 0.1 }, 0.28, { filter: { type: 'lowpass', f0: 1500 } }),
      tone('triangle', G4 * 1.003, undefined, { a: 0.03, h: 0.14, d: 0.1 }, 0.2),
      tone('sawtooth', C5, undefined, { a: 0.03, h: 0.2, d: 0.2 }, 0.28, { at: 0.27, filter: { type: 'lowpass', f0: 1700 } }),
      tone('triangle', C5 * 1.003, undefined, { a: 0.03, h: 0.2, d: 0.2 }, 0.2, { at: 0.27 }),
    ],
  },
  waveClear: {
    gain: 1.058,
    priority: PRIORITY.moment,
    layers: [G5, B5, D6, G6].map((f, i) => tone('sine', f, undefined, { a: 0.004, d: 0.3 }, 0.32, { at: i * 0.07 })),
  },
  callNext: {
    gain: 0.94,
    priority: PRIORITY.moment,
    layers: [
      tone('sawtooth', C5, undefined, { a: 0.02, h: 0.05, d: 0.06 }, 0.3, { filter: { type: 'lowpass', f0: 1600 } }),
      tone('sawtooth', E5, undefined, { a: 0.02, h: 0.08, d: 0.12 }, 0.3, { at: 0.13, filter: { type: 'lowpass', f0: 1800 } }),
    ],
  },
  // A soft descending chime opens the cards; a brighter rising pair confirms the pick.
  boonOffer: {
    gain: 0.44,
    priority: PRIORITY.ui,
    layers: [...note(E6, 0, 0.06, 0.14, 0.3), ...note(C6, 0.12, 0.09, 0.25, 0.3)],
  },
  boonPick: {
    gain: 0.44,
    priority: PRIORITY.ui,
    layers: [...note(C5, 0, 0.05, 0.04, 0.3), ...note(G5, 0.095, 0.12, 0.14, 0.3)],
  },
  // Three measured brass notes mark the new act.
  act2: {
    gain: 0.75,
    priority: PRIORITY.moment,
    layers: [C4, G4, C5].flatMap((freq, i) => [
      tone('sawtooth', freq, undefined, { a: 0.025, h: 0.11, d: 0.12 }, 0.23, { at: i * 0.18, filter: { type: 'lowpass', f0: 1400 } }),
      tone('triangle', freq, undefined, { a: 0.025, h: 0.11, d: 0.12 }, 0.19, { at: i * 0.18 }),
    ]),
  },
  // An upturned howl and a shorter answer announce the Wolves.
  packCall: {
    gain: 0.8,
    priority: PRIORITY.moment,
    layers: [
      tone('triangle', 430, 710, { a: 0.045, h: 0.15, d: 0.22 }, 0.32),
      tone('triangle', 570, 390, { a: 0.03, h: 0.1, d: 0.13 }, 0.26, { at: 0.25 }),
    ],
  },
  grumblemawArrive: {
    gain: 0.955,
    priority: PRIORITY.big,
    layers: [
      tone('sawtooth', 84, 112, { a: 0.16, h: 0.46, d: 0.6 }, 0.17, { filter: { type: 'lowpass', f0: 420, f1: 1100 } }),
      tone('triangle', 260, 335, { a: 0.16, h: 0.46, d: 0.6 }, 0.33),
      tone('triangle', 390, 490, { a: 0.15, h: 0.36, d: 0.5 }, 0.17, { at: 0.12 }),
      noise({ type: 'bandpass', f0: 670, f1: 310, q: 0.8 }, { a: 0.018, h: 0.13, d: 0.6 }, 0.35, 0.55),
    ],
  },
  grumblemawFall: {
    gain: 1.23,
    priority: PRIORITY.big,
    layers: [
      tone('triangle', 360, 118, { a: 0.012, h: 0.12, d: 0.8 }, 0.34),
      tone('sine', 63, 22, { a: 0.012, h: 0.09, d: 0.85 }, 0.13, { at: 0.18 }),
      noise({ type: 'bandpass', f0: 830, f1: 410, q: 0.8 }, { a: 0.008, h: 0.07, d: 0.5 }, 0.47, 0.18),
      noise({ type: 'bandpass', f0: 550, f1: 300, q: 0.9 }, { a: 0.014, d: 0.85 }, 0.36, 0.58),
    ],
  },
  bossArrive: {
    gain: 1.41,
    priority: PRIORITY.big,
    layers: [
      tone('sawtooth', 55, 52, { a: 0.35, h: 0.55, d: 0.5 }, 0.09, { filter: { type: 'lowpass', f0: 260, f1: 420 } }),
      tone('sawtooth', 55.7, 52.6, { a: 0.35, h: 0.55, d: 0.5 }, 0.07, { filter: { type: 'lowpass', f0: 300 } }),
      // The drone an octave and two up with their harmonics, and each stomp's thud in the mids.
      tone('sawtooth', 110, 104, { a: 0.35, h: 0.55, d: 0.5 }, 0.24, { filter: { type: 'lowpass', f0: 900, f1: 1200 } }),
      tone('triangle', 220, 208, { a: 0.35, h: 0.55, d: 0.5 }, 0.18),
      tone('sine', 95, 30, { a: 0.004, d: 0.3 }, 0.14),
      noise({ type: 'bandpass', f0: 420, q: 0.9 }, { a: 0.003, d: 0.2 }, 0.45),
      tone('sine', 95, 30, { a: 0.004, d: 0.35 }, 0.14, { at: 0.62 }),
      noise({ type: 'bandpass', f0: 380, q: 0.9 }, { a: 0.003, d: 0.22 }, 0.45, 0.62),
    ],
  },
  bossFall: {
    gain: 1.006,
    priority: PRIORITY.big,
    layers: [
      tone('sine', 75, 20, { a: 0.005, d: 1.4 }, 0.22),
      noise({ type: 'lowpass', f0: 3200, f1: 90 }, { a: 0.002, d: 1.2 }, 0.24),
      tone('sawtooth', 210, 38, { a: 0.02, d: 1.1 }, 0.17, { at: 0.06, filter: { type: 'lowpass', f0: 900, f1: 200 } }),
      noise({ type: 'bandpass', f0: 800, f1: 260, q: 0.8 }, { a: 0.002, d: 1.0 }, 0.55),
      tone('triangle', 320, 110, { a: 0.005, d: 1.0 }, 0.28),
    ],
  },
  win: {
    gain: 0.882,
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
    gain: 0.8,
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
    gain: 0.345,
    priority: PRIORITY.ui,
    // Triangles with a soft square edge (low-passed) instead of bare squares: still a coin, not a buzz.
    layers: [
      tone('triangle', B5, undefined, { a: 0.002, h: 0.05, d: 0.02 }, 0.4),
      tone('triangle', E6, undefined, { a: 0.002, d: 0.35 }, 0.4, { at: 0.07 }),
      tone('square', E6, undefined, { a: 0.002, d: 0.2 }, 0.08, { at: 0.07, filter: { type: 'lowpass', f0: 2400 } }),
    ],
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

/** The death pop for an enemy type: Goblin and Harpy high, Wolf and Shieldbearer middle, Troll low (the boss falls with bossFall). */
export function deathSound(type: string): SoundName {
  if (type === 'troll') return 'death.large';
  if (type === 'wolf' || type === 'shieldbearer') return 'death.medium';
  return 'death.small';
}

export type LevelTier = 'tick' | 'shot' | 'impact' | 'action' | 'moment' | 'big';

/** Short-term loudness bands (RMS of the loudest 50 ms, before the master chain), quietest first. */
export const LEVEL_TIERS: Readonly<Record<LevelTier, readonly [number, number]>> = {
  tick: [0.008, 0.02],
  shot: [0.05, 0.065],
  impact: [0.068, 0.11],
  action: [0.045, 0.1],
  moment: [0.11, 0.17],
  big: [0.17, 0.26],
};

/** A sound's level tier: hit ticks, shots, impacts and deaths, player actions, wave moments (with the exit and the charge), big moments. */
export function levelTier(name: SoundName): LevelTier {
  if (name === 'hit') return 'tick';
  if (name.startsWith('shot.')) return 'shot';
  if (name.startsWith('impact.') || name.startsWith('death.')) return 'impact';
  if (['build', 'upgrade', 'upgradePath', 'sell', 'refuse', 'tap', 'select', 'coin', 'boonOffer', 'boonPick'].includes(name)) return 'action';
  if (['exit', 'chargeReady', 'waveStart', 'waveClear', 'callNext', 'act2', 'packCall'].includes(name)) return 'moment';
  return 'big';
}

/** The sounds that rest on low frequencies and carry a mid layer for small speakers. */
export const LOW_SOUNDS: readonly SoundName[] = [
  'shot.cannon',
  'impact.cannon',
  'impact.mortar',
  'death.large',
  'exit',
  'special.keg',
  'special.tarBarrel',
  'bossArrive',
  'bossFall',
  'grumblemawArrive',
  'grumblemawFall',
];

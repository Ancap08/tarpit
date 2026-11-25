import { noise, PRIORITY, tone, type Recipe } from './recipes';

/** The private siege uses the same synth and mix bus as the public cues. */
export const SIEGE_RECIPES = {
  'siege.drum': {
    gain: 0.34, priority: PRIORITY.ui,
    layers: [
      tone('sine', 165, 94, { a: 0.006, d: 0.17 }, 0.44),
      tone('triangle', 285, 196, { a: 0.003, d: 0.14 }, 0.68),
      noise({ type: 'bandpass', f0: 420, f1: 255, q: 0.9 }, { a: 0.002, d: 0.06 }, 0.35),
    ],
  },
  'siege.creak': {
    gain: 0.41, priority: PRIORITY.moment,
    layers: [
      tone('triangle', 390, 175, { a: 0.045, h: 0.045, d: 0.32 }, 0.32),
      tone('sawtooth', 262, 118, { a: 0.035, h: 0.03, d: 0.34 }, 0.46,
        { filter: { type: 'lowpass', f0: 760, f1: 410 } }),
      noise({ type: 'bandpass', f0: 690, f1: 275, q: 1 }, { a: 0.018, h: 0.025, d: 0.34 }, 0.65, 0.06),
    ],
  },
  'siege.bell': {
    gain: 0.47, priority: PRIORITY.big,
    layers: [
      tone('triangle', 349.23, undefined, { a: 0.007, h: 0.11, d: 0.75 }, 0.74),
      tone('sine', 522.5, undefined, { a: 0.008, h: 0.06, d: 0.54 }, 0.29),
      tone('sine', 711, undefined, { a: 0.004, d: 0.31 }, 0.41),
      noise({ type: 'bandpass', f0: 800, f1: 610, q: 1 }, { a: 0.002, d: 0.065 }, 0.39),
    ],
  },
  'siege.pillowThump': {
    gain: 0.37, priority: PRIORITY.ui,
    layers: [
      tone('triangle', 330, 167, { a: 0.013, d: 0.15 }, 0.52),
      noise({ type: 'bandpass', f0: 440, f1: 270, q: 0.9 }, { a: 0.018, d: 0.15 }, 0.55),
    ],
  },
  'siege.pillowFlutter': {
    gain: 0.62, priority: PRIORITY.ui,
    layers: [
      noise({ type: 'bandpass', f0: 860, f1: 500, q: 1 }, { a: 0.018, d: 0.1 }, 0.73),
      noise({ type: 'bandpass', f0: 750, f1: 560, q: 1 }, { a: 0.018, d: 0.11 }, 0.63, 0.088),
      noise({ type: 'bandpass', f0: 730, f1: 425, q: 1 }, { a: 0.023, d: 0.18 }, 0.51, 0.17),
      tone('triangle', 480, 376, { a: 0.016, d: 0.17 }, 0.18, { at: 0.075 }),
    ],
  },
  'siege.ramRoll': {
    gain: 0.26, priority: PRIORITY.ui,
    layers: [
      tone('triangle', 237, 181, { a: 0.018, h: 0.070, d: 0.23 }, 0.50),
      noise({ type: 'bandpass', f0: 377, f1: 230, q: 0.8 }, { a: 0.022, h: 0.065, d: 0.32 }, 0.81),
      noise({ type: 'bandpass', f0: 530, f1: 380, q: 0.9 }, { a: 0.013, d: 0.24 }, 0.55, 0.115),
    ],
  },
  'siege.ramKnock': {
    gain: 0.49, priority: PRIORITY.moment,
    layers: [
      tone('sine', 187, 106, { a: 0.004, d: 0.19 }, 0.48),
      tone('triangle', 414, 241, { a: 0.006, d: 0.17 }, 0.55),
      noise({ type: 'bandpass', f0: 590, f1: 275, q: 0.9 }, { a: 0.002, d: 0.205 }, 0.52),
    ],
  },
  'siege.hammer': {
    gain: 0.41, priority: PRIORITY.ui,
    layers: [
      tone('triangle', 648, 470, { a: 0.004, d: 0.090 }, 0.51),
      tone('triangle', 312, 264, { a: 0.006, d: 0.102 }, 0.37),
      noise({ type: 'bandpass', f0: 850, f1: 475, q: 1.1 }, { a: 0.002, d: 0.09 }, 0.55),
    ],
  },
  'siege.ending': {
    gain: 0.56, priority: PRIORITY.big,
    layers: [
      tone('triangle', 261.63, undefined, { a: 0.016, h: 0.07, d: 0.14 }, 0.70),
      tone('triangle', 329.63, undefined, { a: 0.016, h: 0.07, d: 0.13 }, 0.68, { at: 0.19 }),
      tone('triangle', 392, undefined, { a: 0.016, h: 0.085, d: 0.14 }, 0.70, { at: 0.37 }),
      tone('triangle', 523.25, 446, { a: 0.013, h: 0.10, d: 0.29 }, 0.70, { at: 0.58 }),
      tone('triangle', 369.99, 291, { a: 0.025, h: 0.11, d: 0.32 }, 0.52, { at: 0.71 }),
      tone('sawtooth', 245, 157, { a: 0.025, h: 0.09, d: 0.35 }, 0.39,
        { at: 0.76, filter: { type: 'lowpass', f0: 685, f1: 405 } }),
    ],
  },
} satisfies Record<string, Recipe>;

export type SiegeSound = keyof typeof SIEGE_RECIPES;

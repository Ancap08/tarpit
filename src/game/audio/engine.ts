// Milestone 33 (sound): the live sound engine, one per page.
//
// Starting: no AudioContext exists until the player's first tap, click or
// key press (a capture listener on window for pointerdown, pointerup,
// touchend, click and keydown creates it, or resumes it later, as phones
// require). Hiding the page or pausing a run stops every voice and suspends
// the context. It can resume once the page is visible and play resumes. Without Web
// Audio, or if creating the context fails, the game runs silent and play()
// does nothing. Test mode (?test=1): install() is called disabled, so no
// context is ever created and nothing plays; the mute setting and the M key
// still work.
//
// play(name) asks the mixer (mixer.ts) to thin or cap the sound, then
// schedules its recipe (recipes.ts, synth.ts) at the context's current
// time, so game speed never changes a sound's pitch or length. Every voice
// goes through the master chain (synth.ts masterChain): level, limiter,
// then the mute gain. Muting sets that gain to 0 at once and stops every
// voice; the choice is stored (muteSetting.ts) and M toggles it anywhere.

import { MUTE_TEXT } from '../names';
import { Mixer } from './mixer';
import { MuteStore } from './muteSetting';
import { RECIPES, recipeLength, type SoundName } from './recipes';
import { fadeOut, masterChain, schedule, type Scheduled } from './synth';

/** What window.__tarpit.audio() reports. */
export interface AudioState {
  /** Sound can play here: Web Audio exists and this is not test mode. */
  enabled: boolean;
  muted: boolean;
  /** The mute button's words: "Sound on" or "Sound off" (names.ts). */
  label: string;
  /** The key hint (names.ts MUTE_TEXT.hint). */
  hint: string;
  /** The AudioContext's state, or 'none' before the first gesture (and always in test mode). */
  context: 'none' | AudioContextState;
  /** Voices sounding now. */
  voices: number;
  /** Counts by sound name since the page loaded. */
  requested: Record<string, number>;
  played: Record<string, number>;
  thinned: Record<string, number>;
  capped: Record<string, number>;
}

type Counts = Record<string, number>;

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export class SoundEngine {
  private enabled = false;
  private installed = false;
  private failed = false;
  private paused = false;
  private muted: boolean;
  /** A hidden exhibition keeps mute changes in this visit. */
  sessionMute = false;
  private ctx: AudioContext | null = null;
  private bus: ReturnType<typeof masterChain> | null = null;
  private readonly mixer = new Mixer();
  private readonly playing = new Map<number, Scheduled>();
  private readonly listeners = new Set<() => void>();
  private readonly counts = { requested: {} as Counts, played: {} as Counts, thinned: {} as Counts, capped: {} as Counts };

  constructor(
    private readonly store: MuteStore,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.muted = store.get();
  }

  /** Once, at boot (main.ts): the gesture, visibility and M key listeners. `enabled` is false in test mode. */
  install(options: { enabled: boolean }): void {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) this.toggleMute();
    });
    this.enabled = options.enabled && audioContextClass() !== undefined;
    if (!this.enabled) return;
    const unlock = () => this.unlock();
    for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.syncContext());
  }

  /** A gesture: create the context, or resume it. Any failure leaves the game silent. */
  private unlock(): void {
    if (!this.enabled || this.failed || this.paused || document.hidden) return;
    try {
      if (this.ctx === null) {
        const Ctor = audioContextClass()!;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.bus = masterChain(this.ctx);
        this.bus.mute.gain.value = this.muted ? 0 : 1;
        this.ctx.onstatechange = () => this.notify();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.ctx = null;
      this.bus = null;
    }
  }

  /** An explicit pause survives visibility changes and unlock gestures. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.syncContext();
  }

  private syncContext(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (this.paused || document.hidden) {
      this.stopAll(true);
      ctx.suspend().catch(() => undefined);
    } else {
      ctx.resume().catch(() => undefined);
    }
  }

  /** Stop every voice: with a short fade, or at once (before a suspend, when time stops). */
  private stopAll(now = false): void {
    const ctx = this.ctx;
    if (ctx !== null) {
      for (const s of this.playing.values()) {
        if (now) {
          s.out.gain.value = 0;
          for (const src of s.sources) {
            try {
              src.stop();
            } catch {
              // Already stopped.
            }
          }
        } else fadeOut(ctx, s);
      }
    }
    this.playing.clear();
    this.mixer.clear();
  }

  private bump(table: Counts, name: string): void {
    table[name] = (table[name] ?? 0) + 1;
  }

  /** Play a sound now, unless muted, silent, hidden, thinned or capped. */
  play(name: SoundName): void {
    if (!this.enabled || this.paused) return;
    this.bump(this.counts.requested, name);
    const ctx = this.ctx;
    if (this.muted || ctx === null || this.bus === null || ctx.state !== 'running' || document.hidden) return;
    const recipe = RECIPES[name];
    const decision = this.mixer.request(name, recipe.priority, recipeLength(recipe) * 1000, this.now(), recipe.thin);
    if (decision.action === 'thin') {
      this.bump(this.counts.thinned, name);
      return;
    }
    if (decision.action === 'cap') {
      this.bump(this.counts.capped, name);
      return;
    }
    if (decision.evict !== null) {
      const old = this.playing.get(decision.evict);
      if (old) fadeOut(ctx, old);
      this.playing.delete(decision.evict);
    }
    for (const [id, s] of this.playing) if (s.end < ctx.currentTime) this.playing.delete(id);
    try {
      this.playing.set(decision.id, schedule(ctx, recipe, this.bus.input, ctx.currentTime + 0.005, decision.level));
      this.bump(this.counts.played, name);
    } catch {
      // A node failed: this sound is skipped, the game goes on.
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Mute or unmute at once and store the choice; unmuting plays the tap sound. */
  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    if (!this.sessionMute) this.store.set(muted);
    const ctx = this.ctx;
    if (ctx !== null && this.bus !== null) {
      if (muted) this.stopAll();
      this.bus.mute.gain.cancelScheduledValues(ctx.currentTime);
      this.bus.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.005);
    }
    this.notify();
    if (!muted) this.play('tap');
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  /** Call `listener` when the mute state or the context's state changes; returns the unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  snapshot(): AudioState {
    const copy = (t: Counts) => ({ ...t });
    return {
      enabled: this.enabled,
      muted: this.muted,
      label: this.muted ? MUTE_TEXT.off : MUTE_TEXT.on,
      hint: MUTE_TEXT.hint,
      context: this.ctx === null ? 'none' : this.ctx.state,
      voices: this.mixer.live(this.now()).length,
      requested: copy(this.counts.requested),
      played: copy(this.counts.played),
      thinned: copy(this.counts.thinned),
      capped: copy(this.counts.capped),
    };
  }
}


/** The page's sound engine. */
export const sound = new SoundEngine(new MuteStore(() => (typeof window === 'undefined' ? undefined : window.localStorage)));

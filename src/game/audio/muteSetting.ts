// Milestone 33 (sound): the mute choice, kept in localStorage under
// MUTE_KEY as "1" (muted) or "0" (sound on). Default: sound on. As the
// best scores (highScore.ts): reads and writes that fail (private mode,
// blocked storage, a full quota) are ignored and the choice still holds
// in memory for the page session. No Phaser and no Web Audio: unit tested.

import type { StorageLike } from '../highScore';

export const MUTE_KEY = 'tarpit.muted';

/** The stored value: "1" is muted, anything else (missing, "0", junk) is sound on. */
export function parseMuted(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && raw.trim() === '1';
}

export function serializeMuted(muted: boolean): string {
  return muted ? '1' : '0';
}

export class MuteStore {
  private memory: boolean | null = null;

  constructor(private readonly getStorage: () => StorageLike | undefined | null) {}

  /** The choice made this session, else the stored one, else false. Never throws. */
  get(): boolean {
    if (this.memory !== null) return this.memory;
    try {
      return parseMuted(this.getStorage()?.getItem(MUTE_KEY));
    } catch {
      return false;
    }
  }

  /** Keep the choice in memory and try to store it. Never throws. */
  set(muted: boolean): void {
    this.memory = muted;
    try {
      this.getStorage()?.setItem(MUTE_KEY, serializeMuted(muted));
    } catch {
      // Storage blocked or full: the choice holds for this page session.
    }
  }
}

// The title's Look choice. A valid URL value applies for this visit, and
// only an explicit choice on the title writes the stored preference.
import type { StorageLike } from '../highScore';

export const LOOK_KEY = 'tarpit.look';
export const LOOKS = ['classic', 'painted'] as const;
export type Look = (typeof LOOKS)[number];

function parseLook(value: string | null | undefined): Look | undefined {
  return value === 'classic' || value === 'painted' ? value : undefined;
}

export class LookStore {
  private choice: Look | undefined;

  constructor(
    private readonly getStorage: () => StorageLike | undefined | null,
    search: string,
  ) {
    this.choice = parseLook(new URLSearchParams(search).get('look'));
  }

  get(): Look {
    if (this.choice) return this.choice;
    try {
      return parseLook(this.getStorage()?.getItem(LOOK_KEY)) ?? 'classic';
    } catch {
      return 'classic';
    }
  }

  set(look: Look): void {
    this.choice = look;
    try {
      this.getStorage()?.setItem(LOOK_KEY, look);
    } catch {
      // The choice holds for this page session when storage is unavailable.
    }
  }
}

export type PaintedDensity = 1 | 2;

export function paintedDensity(canvasScale: number, devicePixelRatio: number): PaintedDensity {
  return canvasScale * devicePixelRatio >= 1.5 ? 2 : 1;
}

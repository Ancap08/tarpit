import { LEVELS } from '../sim';
import type { StorageLike } from './highScore';

export const SEEN_TIPS_KEY = 'tarpit.seenTips';

export class SeenTipsStore {
  private unsaved = new Set<number>();

  constructor(private readonly getStorage: () => StorageLike | undefined) {}

  private read(): Set<number> {
    const seen = new Set(this.unsaved);
    try {
      const ids: unknown = JSON.parse(this.getStorage()?.getItem(SEEN_TIPS_KEY) ?? '[]');
      if (Array.isArray(ids)) {
        for (const level of LEVELS) if (ids.includes(level.id)) seen.add(level.id);
      }
    } catch {
      // A damaged record or blocked storage still permits play.
    }
    return seen;
  }

  has(id: number): boolean {
    return this.read().has(id);
  }

  mark(id: number): void {
    const seen = this.read();
    seen.add(id);
    this.unsaved.add(id);
    try {
      const storage = this.getStorage();
      if (storage) {
        storage.setItem(SEEN_TIPS_KEY, JSON.stringify([...seen]));
        this.unsaved.clear();
      }
    } catch {
      // Remember the acknowledgement for this session.
    }
  }
}

export const seenTips = new SeenTipsStore(() => window.localStorage);

import { LEVELS } from '../sim';
import type { StorageLike } from './highScore';

export const SEEN_TIPS_KEY = 'tarpit.seenTips';

export const SEEN_BROADSIDES_KEY = 'tarpit.seenBroadsides';
export type Broadside = 'opening' | 'ending';

class SeenStore<T extends number | string> {
  private unsaved = new Set<T>();

  constructor(
    private readonly key: string, private readonly allowed: readonly T[],
    private readonly getStorage: () => StorageLike | undefined,
  ) {}

  private read(): Set<T> {
    const seen = new Set(this.unsaved);
    try {
      const ids: unknown = JSON.parse(this.getStorage()?.getItem(this.key) ?? '[]');
      if (Array.isArray(ids)) {
        for (const id of this.allowed) if (ids.includes(id)) seen.add(id);
      }
    } catch {
      // A damaged record or blocked storage still permits play.
    }
    return seen;
  }

  has(id: T): boolean {
    return this.read().has(id);
  }

  mark(id: T): void {
    const seen = this.read();
    seen.add(id);
    this.unsaved.add(id);
    try {
      const storage = this.getStorage();
      if (storage) {
        storage.setItem(this.key, JSON.stringify([...seen]));
        this.unsaved.clear();
      }
    } catch {
      // Keep the record for this session.
    }
  }
}

export class SeenTipsStore extends SeenStore<number> {
  constructor(storage: () => StorageLike | undefined) {
    super(SEEN_TIPS_KEY, LEVELS.map(level => level.id), storage);
  }
}

export class SeenBroadsidesStore extends SeenStore<Broadside> {
  constructor(storage: () => StorageLike | undefined) {
    super(SEEN_BROADSIDES_KEY, ['opening', 'ending'], storage);
  }
}

export const seenBroadsides = new SeenBroadsidesStore(() => window.localStorage);
export const seenTips = new SeenTipsStore(() => window.localStorage);

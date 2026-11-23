import { mergeProgress, parseProgress, serializeProgress, type CampaignProgress } from '../sim';
import type { StorageLike } from './highScore';

export const CAMPAIGN_PROGRESS_KEY = 'tarpit.campaign';

export class CampaignProgressStore {
  private memory: CampaignProgress = {};

  constructor(private readonly getStorage: () => StorageLike | undefined | null) {}

  table(): CampaignProgress {
    let stored: CampaignProgress = {};
    try {
      stored = parseProgress(this.getStorage()?.getItem(CAMPAIGN_PROGRESS_KEY));
    } catch {
      // Storage may be disabled for this browser session.
    }
    for (const [id, stars] of Object.entries(this.memory)) {
      if (stars !== undefined) stored = mergeProgress(stored, Number(id), stars);
    }
    return stored;
  }

  replaceForTest(table: CampaignProgress): void {
    this.save(parseProgress(serializeProgress(table)));
  }

  record(id: number, stars: number): boolean {
    const progress = this.table();
    const next = mergeProgress(progress, id, stars);
    if (next === progress) return false;
    this.save(next);
    return true;
  }

  private save(next: CampaignProgress): void {
    this.memory = next;
    try {
      this.getStorage()?.setItem(CAMPAIGN_PROGRESS_KEY, serializeProgress(next));
    } catch {
      // Keep the best stars for this page session when storage is unavailable.
    }
  }
}

export const campaignProgress = new CampaignProgressStore(
  () => typeof window === 'undefined' ? undefined : window.localStorage,
);

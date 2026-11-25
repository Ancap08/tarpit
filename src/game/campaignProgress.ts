import { mergeProgress, parseProgress, serializeProgress, type CampaignProgress } from '../sim';
import type { StorageLike } from './highScore';

export const CAMPAIGN_PROGRESS_KEY = 'tarpit.campaign';

function bests(progress: CampaignProgress, additions: CampaignProgress, includeUnwon = true): CampaignProgress {
  for (const [key, stars] of Object.entries(additions)) {
    const id = Number(key);
    if (stars !== undefined && (includeUnwon || progress[id] !== undefined)) progress = mergeProgress(progress, id, stars);
  }
  return progress;
}

export class CampaignProgressStore {
  private memory: CampaignProgress = {};
  private ownerMemory: CampaignProgress = {};

  constructor(private readonly getStorage: () => StorageLike | undefined | null) {}

  private read() {
    let raw: string | null | undefined;
    let ownerStars: CampaignProgress = {};
    try {
      raw = this.getStorage()?.getItem(CAMPAIGN_PROGRESS_KEY);
      const data = JSON.parse(raw ?? 'null');
      if (data?.v === 2 && data.ownerStars !== undefined) {
        ownerStars = parseProgress(JSON.stringify({ v: data.v, stars: data.ownerStars }));
      }
    } catch {
      // Storage may be unreadable or disabled for this browser session.
    }
    return {
      progress: bests(parseProgress(raw), this.memory),
      ownerStars: bests(ownerStars, this.ownerMemory),
    };
  }

  /** Owner stars count toward displayed bests once the level has a regular pass. */
  table(owner = false): CampaignProgress {
    const { progress, ownerStars } = this.read();
    return bests(progress, ownerStars, owner);
  }

  replaceForTest(table: CampaignProgress): void {
    this.save(parseProgress(serializeProgress(table)), {});
  }

  record(id: number, stars: number, owner = false): boolean {
    const { progress, ownerStars } = this.read();
    if (owner && stars <= (progress[id] ?? -1)) return false;
    const current = owner ? ownerStars : progress;
    const next = mergeProgress(current, id, stars);
    if (next === current) return false;
    this.save(owner ? progress : next, owner ? next : ownerStars);
    return true;
  }

  private save(progress: CampaignProgress, ownerStars: CampaignProgress): void {
    this.memory = progress;
    this.ownerMemory = ownerStars;
    try {
      const regular = serializeProgress(progress);
      const saved = Object.keys(ownerStars).length ? JSON.stringify({ ...JSON.parse(regular), ownerStars }) : regular;
      this.getStorage()?.setItem(CAMPAIGN_PROGRESS_KEY, saved);
    } catch {
      // Keep the best stars for this page session when storage is unavailable.
    }
  }
}

export const campaignProgress = new CampaignProgressStore(
  () => typeof window === 'undefined' ? undefined : window.localStorage,
);

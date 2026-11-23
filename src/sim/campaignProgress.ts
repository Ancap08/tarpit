import { THREE_STAR_LIVES, TWO_STAR_LIVES } from './levelTypes';
import type { GameState } from './types';

export type Stars = 0 | 1 | 2 | 3;
type WinStars = Exclude<Stars, 0>;
export type CampaignProgress = Partial<Record<number, WinStars>>;

const PROGRESS_VERSION = 1;

export function levelStars(state: Pick<GameState, 'level' | 'lives' | 'phase'>): Stars {
  if (!state.level || state.phase !== 'won' || state.lives <= 0) return 0;
  if (state.lives >= THREE_STAR_LIVES) return 3;
  return state.lives >= TWO_STAR_LIVES ? 2 : 1;
}

function isWinStars(value: unknown): value is WinStars {
  return value === 1 || value === 2 || value === 3;
}

function isLevelId(id: number): boolean {
  return Number.isSafeInteger(id) && id >= 1;
}

export function unlockedLevel(progress: CampaignProgress, id: number): boolean {
  return isLevelId(id) && (id === 1 || isWinStars(progress[id - 1]));
}

export function mergeProgress(progress: CampaignProgress, id: number, stars: number): CampaignProgress {
  if (!isLevelId(id) || !isWinStars(stars) || stars <= (progress[id] ?? 0)) return progress;
  return { ...progress, [id]: stars };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProgress(raw: string | null | undefined): CampaignProgress {
  if (typeof raw !== 'string') return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(data) || data.v !== PROGRESS_VERSION || !isRecord(data.stars)) return {};
  const progress: CampaignProgress = {};
  for (const [key, stars] of Object.entries(data.stars)) {
    const id = Number(key);
    if (String(id) === key && isLevelId(id) && isWinStars(stars)) progress[id] = stars;
  }
  return progress;
}

export function serializeProgress(progress: CampaignProgress): string {
  return JSON.stringify({ v: PROGRESS_VERSION, stars: progress });
}

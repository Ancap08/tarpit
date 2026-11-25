import { THREE_STAR_LIVES, TWO_STAR_LIVES, type LevelFeat } from './levelTypes';
import { LEVELS } from './levels';
import type { GameState } from './types';

export type Stars = 0 | 1 | 2 | 3;
/** Each entry is a win; a cheated win can have zero stars. */
export type CampaignProgress = Partial<Record<number, Stars>>;

const PROGRESS_VERSION = 2;

type LevelResult = Pick<GameState, 'level' | 'lives' | 'phase' | 'cheated' | 'towersBuilt' | 'leaks' | 'lastSpecialTick' | 'gate' | 'boughtRepair'>;

export function levelStars(state: LevelResult): Stars {
  if (!state.level || state.cheated || state.phase !== 'won' || state.lives <= 0) return 0;
  if (state.lives < TWO_STAR_LIVES) return 1;
  const feat = state.level.feat;
  if (!feat) return state.lives >= THREE_STAR_LIVES ? 3 : 2;
  return earnedFeat(state, feat) ? 3 : 2;
}

export function earnedFeat(state: LevelResult, feat: LevelFeat): boolean {
  switch (feat.kind) {
    case 'noLeaks': return state.leaks === 0;
    case 'noSpecials': return state.lastSpecialTick === undefined;
    case 'noRepairs': return !state.boughtRepair;
    case 'unbroken': return !!state.gate && state.gate.hp > 0 && !state.gate.fallen;
    case 'maxTowers': return state.towersBuilt !== undefined && state.towersBuilt <= feat.limit;
  }
}

function isStars(value: unknown): value is Stars {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isLevelId(id: number): boolean {
  return Number.isSafeInteger(id) && id >= 1;
}

export function unlockedLevel(progress: CampaignProgress, id: number, lastLevel = LEVELS.length): boolean {
  if (!isLevelId(id) || id > lastLevel) return false;
  for (let previous = 1; previous < id; previous++) {
    if (!isStars(progress[previous])) return false;
  }
  return true;
}

export function mergeProgress(progress: CampaignProgress, id: number, stars: number): CampaignProgress {
  if (!isLevelId(id) || !isStars(stars) || stars <= (progress[id] ?? -1)) return progress;
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
  if (!isRecord(data) || (data.v !== 1 && data.v !== PROGRESS_VERSION) || !isRecord(data.stars)) return {};
  const progress: CampaignProgress = {};
  for (const [key, stars] of Object.entries(data.stars)) {
    const id = Number(key);
    if (String(id) === key && isLevelId(id) && isStars(stars) && (data.v !== 1 || stars > 0)) progress[id] = stars;
  }
  return progress;
}

export function serializeProgress(progress: CampaignProgress): string {
  return JSON.stringify({ v: PROGRESS_VERSION, stars: progress });
}

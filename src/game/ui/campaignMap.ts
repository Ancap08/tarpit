import { LEVELS, unlockedLevel, type CampaignProgress } from '../../sim';
import type { Rect } from '../input';

export const ACT_ONE_LAST_LEVEL = 10;
export type CampaignAct = 1 | 2;

export function levelAct(id: number): CampaignAct {
  return id <= ACT_ONE_LAST_LEVEL ? 1 : 2;
}

function nextUnwon(progress: CampaignProgress) {
  return LEVELS.find(level => unlockedLevel(progress, level.id) && progress[level.id] === undefined);
}

/** After the last win, the completed road opens at its final act. */
export function openingAct(progress: CampaignProgress): CampaignAct {
  return levelAct((nextUnwon(progress) ?? LEVELS[LEVELS.length - 1]).id);
}

export interface CampaignStop {
  id: number;
  open: boolean;
  stars: number;
  feat: boolean;
  next: boolean;
  rect: Rect;
}

// Follow the trail across one row and back along the next. Offset the middle
// stops so each stretch bends even before the trail turns at the end.
export function campaignStops(portrait: boolean, progress: CampaignProgress, act: CampaignAct = openingAct(progress)): CampaignStop[] {
  const width = portrait ? 100 : 106;
  const height = portrait ? 86 : 72;
  const columns = portrait ? 2 : 5;
  const next = nextUnwon(progress);
  return LEVELS.filter(level => levelAct(level.id) === act).map(({ id, feat }, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    const column = row % 2 === 0 ? offset : columns - 1 - offset;
    const cx = portrait ? 130 + column * 220 + (row % 2) * 18 : 150 + column * 165;
    const cy = portrait ? 250 + row * 150 + column * 35 : 185 + row * 142 + (column % 2) * 27;
    return {
      id, open: unlockedLevel(progress, id), stars: progress[id] ?? 0, feat: !!feat, next: id === next?.id,
      rect: { x: cx - width / 2, y: cy - height / 2, width, height },
    };
  });
}

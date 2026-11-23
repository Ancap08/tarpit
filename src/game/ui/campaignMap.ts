import { LEVELS, unlockedLevel, type CampaignProgress } from '../../sim';
import type { Rect } from '../input';

export interface CampaignStop {
  id: number;
  open: boolean;
  stars: number;
  next: boolean;
  rect: Rect;
}

// Follow the trail across one row and back along the next. Offset the middle
// stops so each stretch bends even before the trail turns at the end.
export function campaignStops(portrait: boolean, progress: CampaignProgress): CampaignStop[] {
  const width = portrait ? 100 : 106;
  const height = portrait ? 86 : 72;
  const columns = portrait ? 2 : 5;
  const next = LEVELS.find(level => unlockedLevel(progress, level.id) && !progress[level.id]);
  return LEVELS.map(({ id }, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    const column = row % 2 === 0 ? offset : columns - 1 - offset;
    const cx = portrait ? 130 + column * 220 + (row % 2) * 18 : 150 + column * 165;
    const cy = portrait ? 250 + row * 150 + column * 35 : 185 + row * 142 + (column % 2) * 27;
    return {
      id, open: unlockedLevel(progress, id), stars: progress[id] ?? 0, next: id === next?.id,
      rect: { x: cx - width / 2, y: cy - height / 2, width, height },
    };
  });
}

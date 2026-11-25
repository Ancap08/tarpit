import { LEVELS, unlockedLevel, type CampaignProgress } from '../../sim';
import { KEEP_LEVELS } from '../../sim/keepLevels';
import type { Rect } from '../input';

export const ACT_ONE_LAST_LEVEL = 10;
export const ACT_TWO_LAST_LEVEL = LEVELS.length;
export const campaignLevels = (actThree: boolean) => actThree ? [...LEVELS, ...KEEP_LEVELS] : LEVELS;
export function campaignOpen(progress: CampaignProgress, id: number, actThree: boolean, owner = false): boolean {
  const last = actThree ? KEEP_LEVELS.at(-1)!.id : ACT_TWO_LAST_LEVEL;
  return owner ? Number.isInteger(id) && id >= 1 && id <= last : unlockedLevel(progress, id, last);
}
export type CampaignAct = 1 | 2 | 3;

export function levelAct(id: number): CampaignAct {
  return id <= ACT_ONE_LAST_LEVEL ? 1 : id <= ACT_TWO_LAST_LEVEL ? 2 : 3;
}

function nextUnwon(progress: CampaignProgress, actThree: boolean) {
  return campaignLevels(actThree).find(level => campaignOpen(progress, level.id, actThree) && progress[level.id] === undefined);
}

/** After the last win, the completed road opens at its final act. */
export function openingAct(progress: CampaignProgress, actThree = false): CampaignAct {
  return levelAct((nextUnwon(progress, actThree) ?? campaignLevels(actThree).at(-1)!).id);
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
export function campaignStops(portrait: boolean, progress: CampaignProgress, act: CampaignAct = openingAct(progress), actThree = false,
  ownerBests?: CampaignProgress): CampaignStop[] {
  const width = portrait ? 100 : 106;
  const height = portrait ? 86 : 72;
  const columns = portrait ? 2 : 5;
  const next = nextUnwon(progress, actThree);
  const crag = portrait
    ? [[113, 854], [324, 731], [167, 592], [330, 453], [240, 306]]
    : [[145, 371], [310, 322], [465, 275], [611, 214], [765, 158]];
  return campaignLevels(actThree).filter(level => levelAct(level.id) === act).map(({ id, feat }, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    const column = row % 2 === 0 ? offset : columns - 1 - offset;
    const cx = act === 3 ? crag[index][0] : portrait ? 130 + column * 220 + (row % 2) * 18 : 150 + column * 165;
    const cy = act === 3 ? crag[index][1] : portrait ? 250 + row * 150 + column * 35 : 185 + row * 142 + (column % 2) * 27;
    return {
      id, open: !!ownerBests || campaignOpen(progress, id, actThree), stars: (ownerBests ?? progress)[id] ?? 0, feat: !!feat, next: id === next?.id,
      rect: { x: cx - width / 2, y: cy - height / 2, width, height },
    };
  });
}

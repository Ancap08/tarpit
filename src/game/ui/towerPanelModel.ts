import { TOWER_PATHS, maxTowerLevel, towerLevel, type GameState, type Tower, type TowerLevel, type UpgradePath } from '../../sim';
import type { Layout } from '../layout';
import { PANEL_TEXT, PATH_NAMES, pathDescription } from '../names';
import { panelGeometry, STACK_GAP, STACK_PAD } from './geometry';

export const UPGRADE_PATHS: readonly UpgradePath[] = ['A', 'B'];

export interface PathChoice {
  path: UpgradePath;
  name: string;
  price: number;
  description: string;
  disabledReason: string | null;
}

export function getPathChoices(tower: Pick<Tower, 'type' | 'upgraded' | 'path'>, state: Pick<GameState, 'level' | 'gold'>): PathChoice[] {
  if (towerLevel(tower) !== 2 || maxTowerLevel(state) <= 2) return [];
  const price = TOWER_PATHS[tower.type].cost;
  return UPGRADE_PATHS.map((path) => ({
    path,
    name: PATH_NAMES[tower.type][path],
    price,
    description: pathDescription(tower.type, path),
    disabledReason: state.gold >= price ? null : PANEL_TEXT.notEnoughGold,
  }));
}

/** The expanded panel uses a column for the path cards and another for Close. */
export function towerPanelSize(layout: Layout, level: TowerLevel, count: number, pathCount: number, unitsPerCssPixel: number) {
  const portrait = layout.kind === 'portrait';
  const base = panelGeometry(layout);
  // A CSS pixel of headroom covers rounding.
  const touchSide = Math.ceil(45 * unitsPerCssPixel);
  const close = Math.max(base.size.close, touchSide);
  const rowHeight = Math.max(base.size.buttonH, touchSide);
  const idealButtonWidth = level > 1 ? (portrait ? 338 : 288) : base.size.buttonW;
  const pathHeight = Math.max(rowHeight, portrait ? 96 : 66);
  const header = level > 1 ? (portrait ? 58 : 44) : base.header;
  const width = Math.min(layout.map.width - 12, idealButtonWidth + 2 * STACK_PAD + STACK_GAP + close);
  if (level > 1) count -= 1; // Sell and targeting share a row.
  const height = 2 * STACK_PAD + header + (count - 1) * STACK_GAP
    + (count - pathCount) * rowHeight + pathCount * pathHeight;
  return { close, rowHeight, pathHeight, header, width, height, buttonWidth: width - close - 2 * STACK_PAD - STACK_GAP };
}

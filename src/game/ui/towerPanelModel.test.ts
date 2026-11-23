import { describe, expect, it } from 'vitest';
import { MAPS, MAP_IDS, TOWER_DEFS, TOWER_PATHS, buildableCells, cellFromKey, type TowerType } from '../../sim';
import { placeBeside } from '../input';
import { LANDSCAPE, PORTRAIT } from '../layout';
import { PANEL_TEXT, PATH_NAMES, towerPanelTitle } from '../names';
import { getPathChoices, towerPanelSize } from './towerPanelModel';

describe('tower upgrade choices', () => {
  it('offers both paths at level two and explains unaffordability for each', () => {
    for (const type of Object.keys(TOWER_DEFS) as TowerType[]) {
      const price = TOWER_PATHS[type].cost;
      expect(getPathChoices({ type, upgraded: false }, price)).toEqual([]);
      expect(getPathChoices({ type, upgraded: true, path: 'A' }, price)).toEqual([]);
      const tower = { type, upgraded: true };
      const choices = getPathChoices(tower, price);
      expect(choices.map(({ name }) => name)).toEqual([PATH_NAMES[type].A, PATH_NAMES[type].B]);
      expect(new Set(choices.map(({ description }) => description)).size).toBe(2);
      for (const choice of choices) {
        expect(choice.price).toBe(price);
        expect(choice.disabledReason).toBeNull();
        expect(choice.description).toMatch(/\d+%/);
        expect(towerPanelTitle(type, 3, choice.path)).toBe(`${choice.name} · Level 3`);
      }
      expect(getPathChoices(tower, price - 1).map(({ disabledReason }) => disabledReason))
        .toEqual([PANEL_TEXT.notEnoughGold, PANEL_TEXT.notEnoughGold]);
    }
  });

  it('fits both paths and undo inside each map with touch targets at least 44 CSS pixels', () => {
    const cases = [
      { layout: LANDSCAPE, scale: 580 / 390 },
      { layout: PORTRAIT, scale: 1194 / 664 },
    ];
    for (const { layout, scale } of cases) {
      const size = towerPanelSize(layout, 2, 5, scale);
      for (const side of [size.buttonWidth, size.close, size.rowHeight, size.pathHeight]) {
        expect(side / scale).toBeGreaterThanOrEqual(44);
      }
      for (const id of MAP_IDS) {
        const map = MAPS[id];
        for (const [key, buildable] of buildableCells(map).entries()) {
          if (!buildable) continue;
          const cell = cellFromKey(key);
          const centre = layout.cellCenter(cell);
          const { x, y } = placeBeside(centre, size.width, size.height, map, layout);
          expect(layout.onMap(x, y)).toBe(true);
          expect(layout.onMap(x + size.width, y + size.height)).toBe(true);
          const own = layout.cellRect(cell);
          expect(x + size.width <= own.x || own.x + own.width <= x
            || y + size.height <= own.y || own.y + own.height <= y, JSON.stringify({ layout: layout.kind, size, cell, x, y, own })).toBe(true);
        }
      }
    }
  });
});

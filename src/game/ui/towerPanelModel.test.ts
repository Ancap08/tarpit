import { describe, expect, it } from 'vitest';
import { LEVELS, MAPS, MAP_IDS, TOWER_DEFS, TOWER_PATHS, buildableCells, cellFromKey, type TowerLevelStats, type TowerType, type UpgradePath } from '../../sim';
import { placeBeside } from '../input';
import { LANDSCAPE, PORTRAIT } from '../layout';
import { PANEL_TEXT, PATH_NAMES, pathDescription, towerPanelTitle } from '../names';
import { getPathChoices, towerPanelSize } from './towerPanelModel';

const comparisonBands = {
  more: [1, Infinity],
  shorter: [0, 1],
  much: [1.5, Infinity],
  twice: [1.8, 2.2],
  'almost twice': [1.6, 1.95],
} as const;
type ComparisonBand = keyof typeof comparisonBands;

const descriptionStats = {
  musketeer: { A: { range: 'more', damage: 'more' }, B: { fireRate: 'much' } },
  cannon: { A: { splashRadius: 'much' }, B: { fireRate: 'twice' } },
  tarpit: { A: { slow: 'more' }, B: { range: 'more' } },
  longbow: { A: { damage: 'almost twice' }, B: { fireRate: 'almost twice' } },
  mortar: { A: { damage: 'much' }, B: { splashRadius: 'twice' } },
  firepot: { A: { burnDps: 'more', burnDuration: 'shorter' }, B: { burnDuration: 'twice' } },
} satisfies Record<TowerType, Record<UpgradePath, Partial<Record<keyof TowerLevelStats, ComparisonBand>>>>;

describe('tower upgrade choices', () => {
  it('offers both paths at level two and explains unaffordability for each', () => {
    for (const type of Object.keys(TOWER_DEFS) as TowerType[]) {
      const price = TOWER_PATHS[type].cost;
      expect(getPathChoices({ type, upgraded: false }, { gold: price })).toEqual([]);
      expect(getPathChoices({ type, upgraded: true, path: 'A' }, { gold: price })).toEqual([]);
      const tower = { type, upgraded: true };
      const choices = getPathChoices(tower, { gold: price });
      expect(choices.map(({ name }) => name)).toEqual([PATH_NAMES[type].A, PATH_NAMES[type].B]);
      expect(new Set(choices.map(({ description }) => description)).size).toBe(2);
      for (const choice of choices) {
        expect(choice.price).toBe(price);
        expect(choice.disabledReason).toBeNull();
        expect(choice.description).not.toMatch(/[%\n]/);
        expect(towerPanelTitle(type, 3, choice.path)).toBe(`${choice.name} · Level 3`);
      }
      expect(getPathChoices(tower, { gold: price - 1 }).map(({ disabledReason }) => disabledReason))
        .toEqual([PANEL_TEXT.notEnoughGold, PANEL_TEXT.notEnoughGold]);
    }
  });

  it('offers paths only when the campaign allows another upgrade', () => {
    const tower = { type: 'longbow', upgraded: true } as const;
    for (const level of LEVELS) {
      expect(getPathChoices(tower, { level, gold: 1000 })).toHaveLength(level.maxTowerLevel === 3 ? 2 : 0);
    }
  });

  it('describes real changes from level two and keeps comparisons within their stated bands', () => {
    for (const type of Object.keys(descriptionStats) as TowerType[]) {
      const before = TOWER_DEFS[type].upgraded;
      for (const path of ['A', 'B'] as const) {
        const after = TOWER_PATHS[type][path];
        const description = pathDescription(type, path);
        const comparisons = Object.entries(descriptionStats[type][path]) as [keyof TowerLevelStats, ComparisonBand][];
        const claimedBand = description.match(/\balmost twice\b|\btwice\b|\bmuch\b/)?.[0] ?? 'more';
        expect(comparisons.map(([, band]) => band)).toContain(claimedBand);
        for (const [stat, band] of comparisons) {
          const label = `${type} ${path}: ${description} (${stat})`;
          const ratio = after[stat]! / before[stat]!;
          const [min, max] = comparisonBands[band];
          if (band === 'shorter') expect(after[stat]!, label).toBeLessThan(before[stat]!);
          else expect(after[stat]!, label).toBeGreaterThan(before[stat]!);
          expect(ratio, label).toBeGreaterThanOrEqual(min);
          expect(ratio, label).toBeLessThanOrEqual(max);
        }
      }
    }
    // A crawl leaves the enemy moving at no more than a quarter of full speed.
    expect(TOWER_PATHS.tarpit.A.slow).toBeGreaterThanOrEqual(0.75);
  });

  it('fits both paths and undo inside each map with touch targets at least 44 CSS pixels', () => {
    const cases = [
      { layout: LANDSCAPE, scale: 580 / 390 },
      { layout: PORTRAIT, scale: 1194 / 664 },
    ];
    for (const { layout, scale } of cases) {
      const size = towerPanelSize(layout, 2, 5, 2, scale);
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

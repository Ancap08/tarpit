// Milestone 48 verifier: what the player reads is what the game does.
// Numbers here are computed by hand from the frozen tables, not from the code under test.
import { expect, test, type Page } from '@playwright/test';
import type { TitleScene } from '../src/game/TitleScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { LEVELS, MAPS, buildableCells, cellFromKey, positionAlongPath, type LevelDef, type TowerType } from '../src/sim';
import { api, mapPress, press } from './campaign';
import { waitForFirstScreen } from './title';

const TYPES: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
const BASE: Record<TowerType, number> = { musketeer: 50, cannon: 80, tarpit: 60, longbow: 40, mortar: 110, firepot: 70 };
const RANGE: Record<TowerType, number> = { musketeer: 110, cannon: 105, tarpit: 90, longbow: 150, mortar: 220, firepot: 100 };

async function open(page: Page, level: LevelDef) {
  await page.goto('/?test=1&look=painted');
  await waitForFirstScreen(page);
  await page.evaluate(level => {
    const t = window.__tarpit!;
    const game = t.game.scene.getScene('game');
    return new Promise<void>(resolve => {
      game.events.once('create', resolve);
      (t.game.scene.getScene('title') as TitleScene)['startGame']({ level, map: level.map, difficulty: 'normal' });
    });
  }, level);
}

/** The number printed on each build button, read from the text objects inside its rectangle. */
const plaques = (page: Page) => page.evaluate(types => {
  const t = window.__tarpit!;
  const scene = t.game.scene.getScene('game');
  const rects = t.uiRects();
  return Object.fromEntries(types.map(type => {
    const r = rects['bar:' + type];
    const found = scene.children.list.filter(c => c.type === 'Text' && (c as Phaser.GameObjects.Text).visible)
      .map(c => c as Phaser.GameObjects.Text)
      .filter(l => /^\d+$/.test(l.text) && l.getBounds().centerX >= r.x && l.getBounds().centerX <= r.x + r.width
        && l.getBounds().centerY >= r.y && l.getBounds().centerY <= r.y + r.height).map(l => Number(l.text));
    return [type, found];
  }));
}, TYPES) as Promise<Record<TowerType, number[]>>;

const cellsOf = (level: LevelDef) => buildableCells(MAPS[level.map]).flatMap((ok, key) => (ok ? [cellFromKey(key)] : []));

export function taxVerifierSuite(touch: boolean) {
  test('Window Tax: every plaque equals the hand price and the gold taken, for 8 builds with sells between', async ({ page }) => {
    test.setTimeout(90_000);
    const level = LEVELS[10]; // level 11, Window Tax 5%
    await open(page, level);
    const cells = cellsOf(level);
    await api(page, t => t.cheatGold());
    for (let n = 0; n < 8; n++) {
      const seen = await plaques(page);
      for (const type of TYPES) {
        const want = BASE[type] + Math.floor((BASE[type] * 5 * n + 50) / 100);
        expect(seen[type], `${type} plaque before build ${n + 1}`).toEqual([want]);
      }
      const type = TYPES[n % 6];
      const cell = cells[n];
      const before = await api(page, t => t.state().gold);
      const built = await page.evaluate(([c, r, ty]) => window.__tarpit!.buildAt!(c as number, r as number, ty as TowerType), [cell.col, cell.row, type] as const);
      expect(built.ok).toBe(true);
      const after = await api(page, t => t.state().gold);
      expect(before - after, `charged for ${type} #${n + 1}`).toBe(seen[type][0]);
      if (n % 2 === 1) await page.evaluate(([c, r]) => window.__tarpit!.sellAt!(c, r), [cell.col, cell.row] as const);
    }
  });

  test('Curfew: the placement ring, the selected ring and the real firing reach agree, for every tower', async ({ page }) => {
    test.setTimeout(120_000);
    const troll = { groups: [{ type: 'troll', count: 1, interval: 1, delay: 0 }] } as const;
    const level: LevelDef = { ...LEVELS[13], startGold: 1000, hpScale: 1, waves: [troll, troll], rewardWaves: [], taxes: { curfew: 0.15 } };
    const mid = positionAlongPath(MAPS[level.map], 400);
    const cell = cellsOf(level).map(c => ({ c, d: Math.hypot(c.col * 32 + 16 - mid.x, c.row * 32 + 16 - mid.y) })).sort((a, b) => a.d - b.d)[0].c;
    for (const type of TYPES) {
      await open(page, level);
      const want = RANGE[type] * 0.85;
      await press(page, 'bar:' + type, touch);
      if (touch) await mapPress(page, cell.col, cell.row, true);
      else {
        const at = await page.evaluate(([c, r]) => window.__tarpit!.cellToPage(c, r), [cell.col, cell.row] as const);
        await page.mouse.move(at.x, at.y);
      }
      const preview = await api(page, t => t.ui().rangeRadius);
      expect(preview, `${type} placement ring`).toBeCloseTo(want, 6);
      const built = await page.evaluate(([c, r, ty]) => window.__tarpit!.buildAt!(c as number, r as number, ty as TowerType), [cell.col, cell.row, type] as const);
      expect(built.ok, type).toBe(true);
      // fire for real: record the distance of every shot
      const shots = await page.evaluate(() => {
        const t = window.__tarpit as TarpitTestApi;
        t.startWave();
        const out: number[] = [];
        for (let i = 0; i < 3500 && t.state().phase === 'wave'; i++) {
          t.step(1);
          for (const s of t.state().shots) out.push(Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y));
        }
        return out;
      });
      expect(shots.length, `${type} fired`).toBeGreaterThan(0);
      expect(Math.max(...shots), `${type} furthest shot`).toBeLessThanOrEqual(want + 1e-6);
      expect(Math.max(...shots), `${type} furthest shot is near the ring, not far inside`).toBeGreaterThan(want - 3);
      if (type === 'mortar') expect(Math.min(...shots)).toBeGreaterThanOrEqual(70);
    }
  });

  test('No Loitering: the label counts the real ticks, the wave starts on the tick it reads zero, pause freezes it', async ({ page }) => {
    test.setTimeout(90_000);
    const one = { groups: [{ type: 'goblin', count: 1, interval: 1, delay: 0 }] } as const;
    const level: LevelDef = { ...LEVELS[12], startGold: 300, hpScale: 1, waves: [one, one, one, one], rewardWaves: [], taxes: { noLoitering: 8 } };
    await open(page, level);
    expect(await api(page, t => t.hudText().startWave)).toBe('Start Wave');
    await api(page, t => { t.step(2000); });
    expect(await api(page, t => [t.state().wave, t.hudText().startWave])).toEqual([0, 'Start Wave']);
    const run = await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.startWave();
      t.step(1);
      t.state().spawnedPerGroup.fill(99_999);
      t.state().enemies = [];
      t.step(1);
      if (t.state().phase !== 'setup') throw new Error('wave did not clear');
      const rows: [number | undefined, string][] = [];
      let startedAfter = -1;
      for (let i = 1; i <= 481; i++) {
        rows.push([t.state().autoWaveTicks, t.hudText().startWave]);
        if (i === 100) { // pause: nothing may move
          t.pause();
          if (!t.paused()) throw new Error('pause did not take');
          const a = [t.state().autoWaveTicks, t.hudText().startWave];
          t.step(300);
          const b = [t.state().autoWaveTicks, t.hudText().startWave];
          t.resume();
          if (t.paused()) throw new Error('resume did not take');
          rows.push([a[0] === b[0] && a[1] === b[1] ? -1 : -2, 'pause']);
        }
        const wave = t.state().wave;
        t.step(1);
        if (t.state().wave !== wave) { startedAfter = i; break; }
      }
      return { rows, startedAfter };
    });
    expect(run.startedAfter, JSON.stringify(run.rows.slice(-3))).toBe(480);
    expect(run.rows.find(r => r[1] === 'pause')![0]).toBe(-1);
    for (const [left, label] of run.rows.filter(r => r[1] !== 'pause')) {
      expect(label, `ticks left ${left}`).toBe(`Start in ${Math.ceil(left! / 60)}s`);
    }
    expect(await api(page, t => [t.state().wave, t.state().phase])).toEqual([2, 'wave']);
  });

  test('Rationing: the tally, the refusal at the cap and a freed place, on the real level 16', async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    await api(page, t => t.startLevel!(16));
    const cells = cellsOf(LEVELS[15]);
    const [a, b, c, d] = cells;
    const text = () => page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game');
      return scene.children.list.filter(x => x.type === 'Text' && (x as Phaser.GameObjects.Text).visible).map(x => (x as Phaser.GameObjects.Text).text)
        .filter(s => /towers/.test(s) || /Rationing/.test(s));
    });
    expect(await text()).toEqual(expect.arrayContaining(['0/3 towers', 'Rationing']));
    for (const cell of [a, b, c]) expect((await page.evaluate(([x, y]) => window.__tarpit!.buildAt!(x, y, 'longbow'), [cell.col, cell.row] as const)).ok).toBe(true);
    expect(await text()).toEqual(expect.arrayContaining(['3/3 towers', 'Rationing (full)']));
    await press(page, 'bar:musketeer', touch);
    expect(await api(page, t => t.ui().pick)).toBeNull();
    await mapPress(page, d.col, d.row, touch);
    expect(await api(page, t => t.state().towers.length)).toBe(3);
    expect((await page.evaluate(([x, y]) => window.__tarpit!.buildAt!(x, y, 'longbow'), [d.col, d.row] as const))).toMatchObject({ ok: false, reason: 'tower-cap' });
    await page.evaluate(([x, y]) => window.__tarpit!.sellAt!(x, y), [c.col, c.row] as const);
    expect(await text()).toEqual(expect.arrayContaining(['2/3 towers']));
    expect((await page.evaluate(([x, y]) => window.__tarpit!.buildAt!(x, y, 'longbow'), [d.col, d.row] as const)).ok).toBe(true);
  });

  test('Free play and levels 1 to 10 show no tax line, no tally and the printed base prices', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    const check = async (label: string) => {
      const found = await page.evaluate(() => {
        const scene = window.__tarpit!.game.scene.getScene('game');
        const tax = scene.children.getByName('active-taxes') as Phaser.GameObjects.Text;
        const count = scene.children.getByName('build-bar-count') as Phaser.GameObjects.Text;
        return { tax: tax.visible, count: count.visible, startWave: window.__tarpit!.hudText!().startWave };
      });
      expect(found, label).toEqual({ tax: false, count: false, startWave: 'Start Wave' });
      const seen = await plaques(page);
      for (const type of TYPES) if (seen[type].length) expect(seen[type], `${label} ${type}`).toEqual([BASE[type]]);
    };
    await api(page, t => t.startGame());
    await check('free play');
    for (const level of LEVELS.slice(0, 10)) {
      await page.evaluate(id => window.__tarpit!.startLevel!(id), level.id);
      await check('level ' + level.id);
    }
  });
}

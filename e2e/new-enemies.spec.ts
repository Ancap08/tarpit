import { expect, test, type Page } from '@playwright/test';
import { ENEMY_NAMES } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { MAPS, positionAlongPath } from '../src/sim/map';

// Milestone 22: the Harpy (flying) and the Shieldbearer (shield) in the
// browser, test mode (?test=1: frozen, time driven by step()). Tick numbers
// below come from headless scans of the same setups (Node, src/sim).

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

const CANNON = { x: 240, y: 240, range: 90 }; // cell (7,7)
const MUSKET = { x: 240, y: 176, range: 110 }; // cell (7,5)
const inRange = (d: number, t: { x: number; y: number; range: number }) => {
  const p = positionAlongPath(MAPS.meadow, d);
  return Math.hypot(p.x - t.x, p.y - t.y) <= t.range;
};

// Wave 4 with a Cannon at (7,7) and a Musketeer at (7,5). The first Harpy
// (id 4) is inside both ranges from tick 222; the Cannon fires at Wolf 8 on
// tick 316 while Harpy 7 is inside its range; the Musketeer first hits a
// Harpy (id 7) on tick 497. The test steps one tick at a time to tick 500
// and reads events() and the Harpies' path distances after each step.
// Milestone 25c (wave 4 sends its 10 Harpies first, Wolves from 3 s;
// headless scan): a Harpy is inside both ranges from tick 102, where the
// Musketeer first hits one; the Cannon fires with a Harpy in its range on
// ticks 256 and 496; all 10 Harpies spawn within the 500 ticks. Second pass
// (10 Harpies 1.5 s apart, then Goblins): the window grows to 1200 ticks;
// the Cannon fires with a Harpy in range on ticks 571 and 931.
test('wave 4: a Cannon never hits a Harpy, a Musketeer does; the HUD names the Harpy', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.gold = 1000; // test setup: afford both towers
    s.wave = 3; // test setup: the next Start Wave plays wave 4
    t.buildAt(7, 7, 'cannon');
    t.buildAt(7, 5, 'musketeer');
    const next = t.hudText().next;
    t.startWave();
    const harpies = new Set<number>();
    const ticks: { harpyDistances: number[]; cannonHarpy: number; musketHarpy: number; cannonShots: number }[] = [];
    const textures = new Set<string | null>();
    for (let i = 1; i <= 1200; i++) {
      t.step(1);
      let cannonHarpy = 0;
      let musketHarpy = 0;
      let cannonShots = 0;
      for (const e of t.events()) {
        if (e.kind === 'spawn' && e.enemyType === 'harpy') harpies.add(e.enemyId);
        if (e.kind !== 'hit') continue;
        if (e.tower === 'cannon') cannonShots += 1;
        if (!harpies.has(e.enemyId)) continue;
        if (e.tower === 'cannon') cannonHarpy += 1;
        if (e.tower === 'musketeer') musketHarpy += 1;
      }
      const flyers = t.state().enemies.filter((e) => e.type === 'harpy');
      for (const f of flyers) textures.add(t.animState(f.id)?.texture ?? null);
      ticks.push({ harpyDistances: flyers.map((f) => f.distance), cannonHarpy, musketHarpy, cannonShots });
    }
    return { next, ticks, textures: [...textures], harpies: harpies.size };
  });
  expect(r.next).toBe(`Next: 10 ${ENEMY_NAMES.harpy}, 30 ${ENEMY_NAMES.goblin}`);
  const tickOf = (i: number) => i + 1;
  const firstInBoth = r.ticks.findIndex((x) => x.harpyDistances.some((d) => inRange(d, CANNON) && inRange(d, MUSKET)));
  expect(tickOf(firstInBoth)).toBe(102);
  // No Cannon hit on any Harpy over all 500 ticks, though it fires while one is in its range.
  expect(r.ticks.filter((x) => x.cannonHarpy > 0)).toEqual([]);
  const cannonWithHarpyInRange = r.ticks.flatMap((x, i) => (x.cannonShots > 0 && x.harpyDistances.some((d) => inRange(d, CANNON)) ? [tickOf(i)] : []));
  expect(cannonWithHarpyInRange).toEqual([571, 931]);
  const musketOnHarpy = r.ticks.flatMap((x, i) => (x.musketHarpy > 0 ? [tickOf(i)] : []));
  expect(musketOnHarpy.length).toBeGreaterThanOrEqual(1);
  expect(musketOnHarpy[0]).toBe(102);
  expect(r.harpies).toBe(10);
  expect(r.textures).toEqual(['harpy']);
});

// Wave 5 has Goblins and Harpies together; at tick 361 Harpy 11 and 9
// Goblins are out (milestone 25c second pass: Harpies come from 8 s, so
// tick 481: Harpy 9 and 6 Goblins). The Harpy's sprite sits in the air layer, which the scene
// adds after the walkers' layer and the tower labels, so it draws above any
// Goblin. This reads the scene's private sprite map (a probe, not a
// supported hook).
test('a Harpy is drawn above Goblins and tower labels, with no tar or burn', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.gold = 1000; // test setup
    s.wave = 4; // test setup: the next Start Wave plays wave 5
    t.buildAt(7, 5, 'musketeer'); // a tower, so a label exists
    t.startWave();
    t.step(481);
    const harpy = t.state().enemies.find((e) => e.type === 'harpy');
    const goblin = t.state().enemies.find((e) => e.type === 'goblin');
    type Obj = { displayList: unknown; depth: number };
    const scene = t.game.scene.getScene('game') as unknown as {
      children: { list: unknown[] };
      enemySprites: { views: Map<number, { sprite: Obj }> };
      labels: { labels: Map<number, Obj> };
    };
    const rank = (o: Obj) => scene.children.list.indexOf(o.displayList);
    const views = scene.enemySprites.views;
    const label = [...scene.labels.labels.values()][0];
    return {
      harpy: harpy && { id: harpy.id, anim: t.animState(harpy.id) },
      goblin: goblin && t.animState(goblin.id)?.texture,
      harpyRank: harpy ? rank(views.get(harpy.id)!.sprite) : -1,
      goblinRank: goblin ? rank(views.get(goblin.id)!.sprite) : -1,
      labelRank: rank(label),
    };
  });
  expect(r.harpy?.id).toBe(9);
  expect(r.harpy?.anim).toMatchObject({ texture: 'harpy', scale: 2, flags: { burning: false, slowed: false } });
  expect(r.goblin).toBe('goblin');
  expect(r.goblinRank).toBeGreaterThanOrEqual(0);
  expect(r.labelRank).toBeGreaterThan(r.goblinRank);
  expect(r.harpyRank).toBeGreaterThan(r.labelRank);
});

// Wave 6, one tower at (7,5). A base Longbow first hits a Shieldbearer (id
// 7) on tick 850: 120 -> 118, half its 4. A base Musketeer first hits one
// (id 22) on tick 992: 120 -> 108, its full 12.
// Milestone 25c: Shieldbearers have 70 hp and lives are raised (test setup)
// so the horde's leaks do not end the game. The Longbow at (7,5) still
// first hits Shieldbearer 7 on tick 850 (70 -> 68). At (7,5) the Musketeer
// never reaches one (the horde ahead of them keeps it busy), so it stands
// at (1,5), found by a scan of every buildable cell: Shieldbearer 7 on tick
// 362, 70 -> 58. Second pass (Shieldbearers 70 hp, the first at 0.5 s, id 1):
// the Longbow at (7,5) first hits Shieldbearer 1 on tick 346 (70 -> 68),
// the Musketeer at (1,5) on tick 122 (70 -> 58).
for (const [tower, tick, id, dealt, col, row] of [
  ['longbow', 346, 1, 2, 7, 5],
  ['musketeer', 122, 1, 12, 1, 5],
] as const) {
  test(`wave 6: a base ${tower} takes ${dealt} hp off a Shieldbearer`, async ({ page }) => {
    await startGame(page);
    const r = await page.evaluate(
      ({ tower, tick, col, row }) => {
        const t = window.__tarpit as TarpitTestApi;
        const s = t.state();
        s.gold = 1000; // test setup
        s.lives = 1000; // test setup: leaks do not end the game
        s.wave = 5; // test setup: the next Start Wave plays wave 6
        t.buildAt(col, row, tower);
        t.startWave();
        t.step(tick - 1);
        const shield = new Set(t.state().enemies.filter((e) => e.type === 'shieldbearer').map((e) => e.id));
        const before = Object.fromEntries(t.state().enemies.map((e) => [e.id, e.hp]));
        t.step(1);
        const hit = t.events().find((e) => e.kind === 'hit' && shield.has(e.enemyId));
        const id = hit && hit.kind === 'hit' ? hit.enemyId : -1;
        const after = t.state().enemies.find((e) => e.id === id);
        return { id, hit, before: before[id], after: after?.hp, texture: t.animState(id)?.texture };
      },
      { tower, tick, col, row },
    );
    expect(r.id).toBe(id);
    expect(r.hit).toMatchObject({ kind: 'hit', tower, damage: dealt });
    expect(r.before).toBe(70);
    expect(r.after).toBe(70 - dealt);
    expect(r.texture).toBe('shieldbearer');
  });
}

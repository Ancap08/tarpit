import { expect, test, type Page } from '@playwright/test';
import { COLORS } from '../src/game/palette';
import { MAPS, positionAlongPath } from '../src/sim/map';

// From src/game/anim/sheets.ts (fourWay: right is column 3, up column 1) and
// src/game/anim/enemySprites.ts (SHIELD_DX, SHIELD_DY), both pinned by
// anim.test.ts; not imported here because sheets.ts imports PNGs with ?url.
const RIGHT_FRAME = 3;
const UP_FRAME = 1;
const SHIELD_DX = -11;
const SHIELD_DY = 3;
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier (milestone 22): renderer probes for the Harpy and Shieldbearer in
// test mode (?test=1, Canvas renderer, frozen animation). Reads private scene
// fields (enemySprites.views, labels, bars, shotFx): probes, not supported
// hooks, like new-enemies.spec.ts.

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

type Obj = { displayList: { type?: string } | null; depth: number; x: number; y: number; visible: boolean };
type View = { sprite: Obj & { frame: { name: string | number }; isTinted: boolean }; shield: Obj | null };
type SceneProbe = {
  children: { list: unknown[] };
  enemySprites: { views: Map<number, View>; layer: unknown; airLayer: unknown };
  labels: { labels: Map<number, Obj>; layer: unknown };
  bars: Obj;
  shotFx: Obj;
};

// (a) Depth. The enemies.png frame (wave 8, tick 1350, 4 Harpies among 20
// walkers; milestone 25c: tick 1560, 14 Harpies among 48 walkers). Every Harpy sprite sits in a display-list entry after every
// walker's layer, the labels' layer, the hp bars and the shot effects, and
// before the HUD's objects; walkers sit before the labels.
// Milestone 25c second pass: the enemies.png frame is tick 1680, 40 enemies.
test('(a) at tick 1680 of wave 8 every Harpy draws above every walker, the labels, the hp bars and the shots', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.gold = 1000; // test setup
    s.wave = 7; // test setup: the next Start Wave plays wave 8
    t.buildAt(7, 5, 'musketeer');
    t.buildAt(10, 5, 'cannon');
    t.buildAt(18, 9, 'tarpit');
    t.buildAt(23, 8, 'musketeer');
    t.startWave();
    t.step(1680);
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    const list = scene.children.list;
    // Rank: the index in the scene's list of the object, or of the Layer holding it.
    const rank = (o: Obj) => (o.displayList && o.displayList.type === 'Layer' ? list.indexOf(o.displayList) : list.indexOf(o));
    const enemies = t.state().enemies;
    const ranks = enemies.map((e) => ({ type: e.type, rank: rank(scene.enemySprites.views.get(e.id)!.sprite) }));
    return {
      total: list.length,
      enemies: enemies.length,
      harpyRanks: [...new Set(ranks.filter((x) => x.type === 'harpy').map((x) => x.rank))],
      walkerRanks: [...new Set(ranks.filter((x) => x.type !== 'harpy').map((x) => x.rank))],
      labelRanks: [...new Set([...scene.labels.labels.values()].map(rank))],
      bars: rank(scene.bars),
      shotFx: rank(scene.shotFx),
      airIsWalkerLayer: scene.enemySprites.airLayer === scene.enemySprites.layer,
    };
  });
  expect(r.enemies).toBe(40); // 11 Goblins, 7 Wolves, 5 Trolls, 4 Shieldbearers, 13 Harpies (enemies-frame.test.ts)
  expect(r.harpyRanks).toHaveLength(1);
  expect(r.walkerRanks).toHaveLength(1);
  expect(r.labelRanks).toHaveLength(1);
  expect(r.airIsWalkerLayer).toBe(false);
  const harpy = r.harpyRanks[0];
  expect(harpy).toBeGreaterThan(r.walkerRanks[0]);
  expect(harpy).toBeGreaterThan(r.labelRanks[0]);
  expect(harpy).toBeGreaterThan(r.bars);
  expect(harpy).toBeGreaterThan(r.shotFx);
  expect(r.walkerRanks[0]).toBeLessThan(r.labelRanks[0]);
  // The HUD, panel and end screen are added after the air layer: it is not the last entry.
  expect(harpy).toBeLessThan(r.total - 1);
});

// (b) Shadow. Wave 4 with no towers at tick 600: the Harpies trail the
// Wolves on the top run, well apart from them. Milestone 25c: wave 4 sends
// its Harpies first, 72 px apart, and the Wolves catch up; at tick 300
// Harpy 0 leads on the top run at x 305, 72 px of path from the next enemy. The shadow is
// drawn in the dynamic Graphics (not an object), so it is read from the
// canvas: the path colour under the Harpy's path point, 3 px below, is
// darkened by both ellipses (x 0.85 x 0.8 = 0.68: path (194,164,118) reads
// (132,111,80)); 10 px to the side only the outer ellipse covers it (x 0.85);
// 28 px to either side is plain path. Read one animation frame after step(),
// when Phaser has painted the new display list.
test('(b) a Harpy has a two-ellipse ground shadow on the path under it', async ({ page }) => {
  await startGame(page);
  const enemies = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = 3; // test setup: the next Start Wave plays wave 4
    t.startWave();
    t.step(300);
    return t.state().enemies.map((e) => ({ id: e.id, type: e.type, distance: e.distance }));
  });
  // The Harpy on the top run (y 96, x 200..400) furthest from every other enemy.
  const at = (d: number) => positionAlongPath(MAPS.meadow, d);
  const harpies = enemies.filter((e) => e.type === 'harpy' && at(e.distance).y === 96 && at(e.distance).x > 200 && at(e.distance).x < 400);
  const gap = (h: { id: number; distance: number }) => Math.min(...enemies.filter((e) => e.id !== h.id).map((e) => Math.abs(e.distance - h.distance)));
  const harpy = harpies.sort((a, b) => gap(b) - gap(a))[0];
  expect(harpy, JSON.stringify(enemies)).toBeDefined();
  expect(gap(harpy)).toBeGreaterThanOrEqual(60);
  const pos = { x: Math.round(at(harpy.distance).x), y: 96 };
  const r = await page.evaluate(async (pos) => {
    const t = window.__tarpit as TarpitTestApi;
    // step() updates the display list; Phaser paints it on the next animation frame.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const ctx = t.game.canvas.getContext('2d')!;
    const px = (dx: number, dy: number) => [...ctx.getImageData(pos.x + dx, pos.y + dy, 1, 1).data].slice(0, 3);
    return { centre: px(0, 3), outerOnly: px(10, 3), left: px(-28, 3), right: px(28, 3) };
  }, pos);
  const path = [(COLORS.path >> 16) & 255, (COLORS.path >> 8) & 255, COLORS.path & 255];
  expect(r.left).toEqual(path);
  expect(r.right).toEqual(path);
  const near = (got: number[], want: number[]) => got.every((c, i) => Math.abs(c - want[i]) <= 4);
  expect(near(r.centre, path.map((c) => c * 0.85 * 0.8)), `centre ${r.centre} at ${JSON.stringify(pos)}`).toBe(true);
  expect(near(r.outerOnly, path.map((c) => c * 0.85)), `outer ${r.outerOnly} at ${JSON.stringify(pos)}`).toBe(true);
});

// (c) No tar or burn on a Harpy, ever. Wave 4 with a Tar Pit at (14,6) and a
// Fire Pot at (14,8) on the vertical run (new-towers-verifier (f)), stepped
// one tick at a time for 900 ticks: no Harpy is ever slowed or burning in
// the simulation or in its sprite flags, and its sprite is never tinted
// outside a hit flash, while the Fire Pot does hit Harpies and Wolves do get
// slowed.
test('(c) over wave 4 with a Tar Pit and a Fire Pot no Harpy is ever slowed, burning or tinted', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.gold = 1000; // test setup
    s.wave = 3; // test setup: the next Start Wave plays wave 4
    const built = [t.buildAt(14, 6, 'tarpit').ok, t.buildAt(14, 8, 'firepot').ok];
    t.startWave();
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    const harpies = new Set<number>();
    let firepotHitsOnHarpies = 0;
    let harpyFlagged = 0;
    let harpyTintedUnhit = 0;
    let wolfSlowedTicks = 0;
    let harpyTicks = 0;
    for (let i = 1; i <= 900; i++) {
      t.step(1);
      const hitNow = new Set<number>();
      for (const e of t.events()) {
        if (e.kind === 'spawn' && e.enemyType === 'harpy') harpies.add(e.enemyId);
        if (e.kind === 'hit') {
          hitNow.add(e.enemyId);
          if (e.tower === 'firepot' && harpies.has(e.enemyId)) firepotHitsOnHarpies += 1;
        }
      }
      for (const e of t.state().enemies) {
        // Milestone 25c second pass: wave 4's walkers are Goblins (the counter keeps its name).
        if (e.type === 'goblin' && e.slowTicksLeft > 0) wolfSlowedTicks += 1;
        if (e.type !== 'harpy') continue;
        harpyTicks += 1;
        const a = t.animState(e.id);
        if (e.slowTicksLeft > 0 || (e.burnTicksLeft ?? 0) > 0 || !a || a.flags.slowed || a.flags.burning) harpyFlagged += 1;
        const v = scene.enemySprites.views.get(e.id);
        if (v && v.sprite.isTinted && !hitNow.has(e.id)) harpyTintedUnhit += 1;
      }
    }
    return { built, harpies: harpies.size, firepotHitsOnHarpies, harpyFlagged, harpyTintedUnhit, wolfSlowedTicks, harpyTicks };
  });
  expect(r.built).toEqual([true, true]);
  expect(r.harpies).toBe(10); // milestone 25c: 10 Harpies in wave 4
  expect(r.harpyTicks).toBeGreaterThan(500);
  expect(r.firepotHitsOnHarpies).toBeGreaterThan(0);
  expect(r.wolfSlowedTicks).toBeGreaterThan(0);
  expect(r.harpyFlagged).toBe(0);
  expect(r.harpyTintedUnhit).toBe(0);
});

// (d) Shieldbearer facing at the first corner, and its shield mark. Wave 6
// with no towers: the first Shieldbearer (spawn delay 3 s) walks right to
// (160,240) then up. Each tick its sprite faces right (column 3, frame 3)
// before path distance 160 and up (column 1, frame 1) from 160 to 304;
// the shield mark is a visible object 11 px left and 3 px below the sprite,
// just in front of it (depth + 0.5), in the walkers' layer.
test('(d) a Shieldbearer faces right, then up at the first corner, and carries its shield mark', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = 5; // test setup: the next Start Wave plays wave 6
    t.startWave();
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    let id = -1;
    const samples: { d: number; facing: string; anim: string; frame: string | number; flipX: boolean }[] = [];
    let shield: Record<string, unknown> | null = null;
    for (let i = 1; i <= 700; i++) {
      t.step(1);
      if (id < 0) {
        const sp = t.events().find((e) => e.kind === 'spawn' && e.enemyType === 'shieldbearer');
        if (sp && sp.kind === 'spawn') id = sp.enemyId;
        continue;
      }
      const e = t.state().enemies.find((x) => x.id === id);
      if (!e) break;
      const a = t.animState(id)!;
      const v = scene.enemySprites.views.get(id)!;
      samples.push({ d: e.distance, facing: a.facing, anim: a.anim, frame: v.sprite.frame.name, flipX: a.flipX });
      if (e.distance > 200 && !shield) {
        shield = v.shield && {
          visible: v.shield.visible,
          dx: v.shield.x - v.sprite.x,
          dy: v.shield.y - v.sprite.y,
          depthGap: v.shield.depth - v.sprite.depth,
          sameLayer: v.shield.displayList === v.sprite.displayList,
          texture: a.texture,
        };
      }
    }
    const harpyHasShield = [...scene.enemySprites.views.values()].some((v) => v.shield !== null && (v.sprite as unknown as { texture: { key: string } }).texture.key === 'harpy');
    return { id, samples, shield, harpyHasShield };
  });
  expect(r.id).toBe(1); // milestone 25c second pass: spawn delay 0.5 s, right after Goblin 0 (was 7: delay 3 s)
  const before = r.samples.filter((x) => x.d > 0 && x.d < 160);
  const after = r.samples.filter((x) => x.d > 160 && x.d < 304);
  expect(before.length).toBeGreaterThan(100);
  expect(after.length).toBeGreaterThan(100);
  expect(new Set(before.map((x) => `${x.facing} ${x.anim} ${x.frame} ${x.flipX}`))).toEqual(
    new Set([`right shieldbearer-walk-right ${RIGHT_FRAME} false`]),
  );
  expect(new Set(after.map((x) => `${x.facing} ${x.anim} ${x.frame} ${x.flipX}`))).toEqual(
    new Set([`up shieldbearer-walk-up ${UP_FRAME} false`]),
  );
  expect(r.shield).toEqual({ visible: true, dx: SHIELD_DX, dy: SHIELD_DY, depthGap: 0.5, sameLayer: true, texture: 'shieldbearer' });
  expect(r.harpyHasShield).toBe(false);
});

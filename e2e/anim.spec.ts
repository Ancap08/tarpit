import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 16: enemy sprites driven by simulation events, in test mode
// (?test=1: Canvas renderer, frozen animations, time driven by step()).
// animState(id) reports what the renderer shows for an enemy; events() is
// the simulation's state.events.

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

test('test mode renders with Canvas', async ({ page }) => {
  await startGame(page);
  // Phaser.CANVAS is 1 and Phaser.WEBGL is 2 (the bundle exposes no Phaser global).
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).game.renderer.type)).toBe(1);
});

test('a spawned Goblin is a goblin sprite facing right on frame 0', async ({ page }) => {
  await startGame(page);
  const a = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(1);
    return { anim: t.animState(0), events: t.events(), none: t.animState(1) };
  });
  expect(a.events).toEqual([{ kind: 'spawn', enemyId: 0, enemyType: 'goblin' }]);
  expect(a.anim).toEqual({
    texture: 'goblin',
    anim: 'goblin-walk-right',
    frame: 0,
    facing: 'right',
    flipX: false,
    scale: 2,
    flags: { hit: false, burning: false, slowed: false, dying: false },
  });
  expect(a.none).toBeNull();
});

test('a Musketeer hit flags the sprite for that tick; a kill removes it', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.buildAt(7, 5, 'musketeer');
    t.startWave();
    let hitTick = -1;
    let hitId = -1;
    for (let i = 1; i <= 2000 && hitTick < 0; i++) {
      t.step(1);
      const hit = t.events().find((e) => e.kind === 'hit');
      if (hit && hit.kind === 'hit') {
        hitTick = i;
        hitId = hit.enemyId;
      }
    }
    const onHit = t.animState(hitId);
    t.step(1);
    const after = t.animState(hitId);
    let kill = null;
    let killState: unknown = 'unset';
    for (let i = 0; i < 2000 && !kill; i++) {
      t.step(1);
      const k = t.events().find((e) => e.kind === 'kill');
      if (k && k.kind === 'kill') {
        kill = k;
        killState = t.animState(k.enemyId);
      }
    }
    return { hitTick, hitId, onHit, after, kill, killState };
  });
  // The Musketeer's first shot: tick 152 of wave 1, on Goblin 0 (found by this loop).
  expect({ hitTick: r.hitTick, hitId: r.hitId }).toEqual({ hitTick: 152, hitId: 0 });
  expect(r.onHit?.flags.hit).toBe(true);
  expect(r.after?.flags.hit).toBe(false);
  expect(r.kill).toMatchObject({ kind: 'kill', enemyType: 'goblin', bounty: 4, cause: 'shot' });
  expect(r.killState).toBeNull();
});

// Milestone 11's verified cells and tick (e2e/new-towers.spec.ts): a Tar Pit
// at (14,6) and a Fire Pot at (14,8) leave Goblin 0 slowed and burning at
// tick 687 of wave 1, and no enemy at 686.
test('a tarred, burning Goblin shows both flags at tick 687', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().gold = 1000; // test setup
    t.buildAt(14, 6, 'tarpit');
    t.buildAt(14, 8, 'firepot');
    t.startWave();
    t.step(686);
    const before = t.state().enemies.map((e) => t.animState(e.id)?.flags);
    t.step(1);
    return { before, at687: t.animState(0) };
  });
  expect(r.before.some((f) => f?.burning && f?.slowed)).toBe(false);
  expect(r.at687?.flags).toMatchObject({ burning: true, slowed: true, dying: false });
  expect(r.at687?.facing).toBe('down'); // on the long downhill run at x 420
});

test('facing turns up at the first corner (x 160)', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    const seen: string[] = [];
    for (let i = 0; i < 400; i++) {
      t.step(1);
      const f = t.animState(0)?.facing;
      if (f && seen.at(-1) !== f) seen.push(f);
      const e = t.state().enemies.find((x) => x.id === 0);
      if (e && e.distance > 200) break; // 40 px up the first climb
    }
    return { seen, anim: t.animState(0) };
  });
  expect(r.seen).toEqual(['right', 'up']);
  expect(r.anim).toMatchObject({ texture: 'goblin', anim: 'goblin-walk-up', facing: 'up', frame: 0 });
});

test('a Wolf is not mirrored while moving right (the Hyena frames face right)', async ({ page }) => {
  await startGame(page);
  const a = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().wave = 3; // test setup: the next Start Wave plays wave 4 (Wolves only)
    t.startWave();
    t.step(30);
    return t.animState(0);
  });
  expect(a).toMatchObject({ texture: 'wolf', anim: 'wolf-walk', facing: 'right', flipX: false, frame: 0, scale: 2 });
});

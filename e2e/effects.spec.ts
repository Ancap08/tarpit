import { expect, test, type Page } from '@playwright/test';
import type { FxState } from '../src/game/fx/effects';
import { BOSS_NAME, waveStartBanner } from '../src/game/names';
import { waitForTitle } from './title';

// Milestone 31 (effects), in play (not ?test=1): ?perf=1 runs the live loop
// and lets spawnHorde add Goblins. The scene's own actions (build,
// startWave, callNextWave, advance) drive the game; window.__tarpit.fx()
// reports the effects' counts and towerAngle() a tower's drawn barrel.
// Canvas renderer, as live.spec.ts and perf.spec.ts.

type Rect = { x: number; y: number; width: number; height: number };
type Sample = FxState & { now: number; angle: number | null };

async function startPlay(page: Page): Promise<void> {
  await page.goto('/?renderer=canvas&perf=1');
  await waitForTitle(page);
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.fx() !== null);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { gold: number; lives: number } };
    scene.state.gold = 1e5;
    scene.state.lives = 1e5;
  });
}

/** Build `type` on the first buildable cell near the spawn (Meadow's trail starts at the left edge, y 240). */
async function buildNearSpawn(page: Page, type: string): Promise<{ col: number; row: number }> {
  const cell = await page.evaluate((type) => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
      build(c: { col: number; row: number }, t: string): { ok: boolean };
    };
    for (const [col, row] of [
      [2, 5],
      [1, 5],
      [3, 5],
      [2, 9],
      [1, 9],
      [3, 9],
      [4, 5],
      [4, 9],
    ]) {
      if (scene.build({ col, row }, type).ok) return { col, row };
    }
    return null;
  }, type);
  expect(cell, `a buildable cell near the spawn for ${type}`).not.toBeNull();
  return cell!;
}

/** Sample fx() (and one tower's angle) on every frame for `ms` of real time. */
async function sample(
  page: Page,
  ms: number,
  cell?: { col: number; row: number },
  kick?: { n: number; span: number; hp: number },
): Promise<Sample[]> {
  return page.evaluate(
    ({ ms, cell, kick }) =>
      new Promise<Sample[]>((resolve) => {
        const out: Sample[] = [];
        const end = performance.now() + ms;
        const frame = (now: number) => {
          const t = window.__tarpit!;
          // `kick`: spawn after the first sample, so the samples see the first shot leave.
          if (kick && out.length === 1) {
            const scene = t.game.scene.getScene('game') as unknown as {
              spawnHorde(n: number, span?: number): boolean;
              state: { enemies: { hp: number }[] };
            };
            scene.spawnHorde(kick.n, kick.span);
            for (const e of scene.state.enemies) e.hp = kick.hp;
          }
          out.push({ ...t.fx()!, now, angle: cell ? t.towerAngle(cell.col, cell.row) : null });
          if (now < end) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
    { ms, cell: cell ?? null, kick: kick ?? null },
  );
}

const spawn = (page: Page, n: number, span?: number, hp?: number) =>
  page.evaluate(
    ({ n, span, hp }) => {
      const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
        spawnHorde(n: number, span?: number): boolean;
        state: { enemies: { hp: number }[] };
      };
      scene.spawnHorde(n, span ?? undefined);
      if (hp !== null) for (const e of scene.state.enemies) e.hp = hp;
    },
    { n, span: span ?? null, hp: hp ?? null },
  );

test('test mode has no effects: fx() is null', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => window.__tarpit!.startGame!());
  expect(await page.evaluate(() => window.__tarpit!.fx())).toBeNull();
});

test('a shot is a projectile that lands after its travel time (110 ms for the musket)', async ({ page }) => {
  await startPlay(page);
  await buildNearSpawn(page, 'musketeer');
  const s = await sample(page, 2500, undefined, { n: 1, span: 30, hp: 1 });
  const first = s.findIndex((x) => x.projectiles > 0);
  expect(first, 'a projectile appears after the spawn').toBeGreaterThan(0);
  const gone = s.findIndex((x, i) => i > first && x.projectiles === 0);
  expect(gone).toBeGreaterThan(first);
  // It flew for about its travel time on the game clock (frames are ~17 ms).
  const flew = s[gone].gameMs - s[first].gameMs;
  expect(flew).toBeGreaterThanOrEqual(110 - 20);
  expect(flew).toBeLessThanOrEqual(110 + 40);
  // The kill waited for it: a pending kill while it flew, then a gold label.
  expect(s.slice(first, gone).some((x) => x.pendingKills > 0)).toBe(true);
  expect(s.slice(gone).some((x) => x.goldLabels.includes('+2'))).toBe(true);
});

test('travel follows game speed: at 3x a mortar shell lands in about a third of its 400 ms', async ({ page }) => {
  await startPlay(page);
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { setSpeed(s: number): void }).setSpeed(3));
  // The mortar's minimum range is 70 px, so it sits further from the trail.
  const cell = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { build(c: { col: number; row: number }, t: string): { ok: boolean } };
    for (const [col, row] of [
      [4, 3],
      [5, 3],
      [4, 11],
      [5, 11],
    ])
      if (scene.build({ col, row }, 'mortar').ok) return { col, row };
    return null;
  });
  expect(cell).not.toBeNull();
  const s = await sample(page, 3000, undefined, { n: 1, span: 30, hp: 1000 });
  const first = s.findIndex((x) => x.projectiles > 0);
  expect(first).toBeGreaterThan(0);
  const gone = s.findIndex((x, i) => i > first && x.projectiles === 0);
  expect(gone).toBeGreaterThan(first);
  expect(s[gone].gameMs - s[first].gameMs).toBeGreaterThanOrEqual(380);
  expect(s[gone].now - s[first].now).toBeLessThanOrEqual(400 / 3 + 60);
});

test('a barrel turns toward its target over several frames, never faster than 10 rad/s of game time', async ({ page }) => {
  await startPlay(page);
  const cell = await buildNearSpawn(page, 'cannon');
  await spawn(page, 12, 120, 5000);
  const s = await sample(page, 2000, cell);
  const angles = s.map((x) => x.angle!);
  expect(new Set(angles.map((a) => a.toFixed(3))).size, 'the angle changes over several frames').toBeGreaterThan(3);
  for (let i = 1; i < s.length; i++) {
    let d = Math.abs(angles[i] - angles[i - 1]);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const allowed = (10 * (s[i].gameMs - s[i - 1].gameMs)) / 1000 + 1e-6;
    expect(d, `frame ${i}`).toBeLessThanOrEqual(allowed);
  }
});

test('one splash killing several Goblins together shows one grouped gold label', async ({ page }) => {
  await startPlay(page);
  await buildNearSpawn(page, 'cannon');
  await spawn(page, 6, 12, 1);
  const s = await sample(page, 2500);
  const grouped = s.flatMap((x) => x.goldLabels).filter((l) => Number(l.slice(1)) > 2);
  expect(grouped.length, 'a label worth more than one Goblin').toBeGreaterThan(0);
  expect(Math.max(...s.map((x) => x.goldLabels.length))).toBeLessThan(6);
});

test('an enemy getting through flashes the cottage and the Lives number', async ({ page }) => {
  await startPlay(page);
  await spawn(page, 1);
  // spawnHorde put it halfway along the trail: move it to the exit.
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { enemies: { distance: number }[] } };
    const e = scene.state.enemies[scene.state.enemies.length - 1];
    e.distance = e.distance * 2 - 1;
  });
  await page.waitForFunction(() => window.__tarpit!.fx()!.exitFlashes >= 1);
  expect((await page.evaluate(() => window.__tarpit!.fx()))!.livesFlashing).toBe(true);
  await page.waitForFunction(() => !window.__tarpit!.fx()!.livesFlashing, undefined, { timeout: 3000 });
});

test('wave banners come and go, and early calls do not stack them', async ({ page }) => {
  await startPlay(page);
  for (const t of ['musketeer', 'cannon', 'musketeer']) await buildNearSpawn(page, t);
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { startWave(): unknown }).startWave());
  expect((await page.evaluate(() => window.__tarpit!.fx()))!.banner).toBe(waveStartBanner(1));
  await page.waitForFunction(() => window.__tarpit!.fx()!.banner === null, undefined, { timeout: 4000 });
  // Waves 2, 3 and 4 in a row, each called early as soon as the sim allows
  // (started normally if the towers cleared the wave first).
  const calls = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
      state: { wave: number; phase: string };
      advance(n: number, redraw?: boolean): void;
      callNextWave(): { ok: boolean };
      startWave(): unknown;
    };
    let early = 0;
    for (let i = 0; i < 20000 && scene.state.wave < 4; i++) {
      if (scene.callNextWave().ok) early++;
      else if (scene.state.phase === 'setup') scene.startWave();
      else scene.advance(1, false);
    }
    return { early, wave: scene.state.wave };
  });
  expect(calls.wave).toBe(4);
  expect(calls.early).toBeGreaterThanOrEqual(1);
  const s = await sample(page, 2600);
  expect(Math.max(...s.map((x) => x.bannerPending))).toBeLessThanOrEqual(1);
  expect(s.some((x) => x.banner === waveStartBanner(4))).toBe(true);
  // No backlog: the last banner is gone within one banner's time plus its cut.
  expect(s.at(-1)!.banner).toBeNull();
});

/** Jump to wave 10, start it and run ticks until the boss is on the map. */
async function bossArrives(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
      state: { wave: number; events: { kind: string }[] };
      startWave(): { ok: boolean };
      advance(n: number, redraw?: boolean): void;
    };
    scene.state.wave = 9;
    scene.startWave();
    for (let i = 0; i < 20000 && window.__tarpit!.fx()!.bossEntrances === 0; i++) scene.advance(1, false);
  });
  expect((await page.evaluate(() => window.__tarpit!.fx()))!.bossEntrances).toBe(1);
}

test('the boss arrives once with his name, a darkening and a shake, and dies once with a burst', async ({ page }) => {
  await startPlay(page);
  for (const t of ['musketeer', 'musketeer', 'cannon']) await buildNearSpawn(page, t);
  await bossArrives(page);
  const on = (await page.evaluate(() => window.__tarpit!.fx()))!;
  expect(on).toMatchObject({ reducedMotion: false, bossEntrances: 1, darkenings: 1, shakes: 1 });
  expect(on.darken).toBeGreaterThanOrEqual(0);
  const s = await sample(page, 600);
  expect(s.some((x) => x.banner === BOSS_NAME)).toBe(true);
  expect(Math.max(...s.map((x) => x.darken))).toBeGreaterThan(0.3);
  // Bring him down: 1 hp, next shot kills.
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { enemies: { type: string; hp: number }[] } };
    for (const e of scene.state.enemies) if (e.type === 'boss') e.hp = 1;
  });
  await page.waitForFunction(() => window.__tarpit!.fx()!.bossDeaths === 1, undefined, { timeout: 10_000 });
  await page.waitForTimeout(800);
  expect((await page.evaluate(() => window.__tarpit!.fx()))!).toMatchObject({ bossEntrances: 1, bossDeaths: 1, screenFlashes: 1, shakes: 2 });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no shake, darkening or flash; the banner, the burst and the Lives flash stay', async ({ page }) => {
    await startPlay(page);
    for (const t of ['musketeer', 'musketeer', 'cannon']) await buildNearSpawn(page, t);
    await bossArrives(page);
    const s = await sample(page, 600);
    expect(s.some((x) => x.banner === BOSS_NAME)).toBe(true);
    expect(Math.max(...s.map((x) => x.darken))).toBe(0);
    await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { enemies: { type: string; hp: number }[] } };
      for (const e of scene.state.enemies) if (e.type === 'boss') e.hp = 1;
    });
    await page.waitForFunction(() => window.__tarpit!.fx()!.bossDeaths === 1, undefined, { timeout: 10_000 });
    expect((await page.evaluate(() => window.__tarpit!.fx()))!).toMatchObject({
      reducedMotion: true,
      shakes: 0,
      darkenings: 0,
      screenFlashes: 0,
      bossDeaths: 1,
    });
  });
});

test('caps hold under the perf horde: 120 Goblins and 25 towers', async ({ page }) => {
  test.setTimeout(60_000);
  await startPlay(page);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { build(c: { col: number; row: number }, t: string): { ok: boolean } };
    const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
    let built = 0;
    for (let row = 1; row < 15 && built < 25; row += 2) for (let col = 1; col < 30 && built < 25; col += 2) if (scene.build({ col, row }, types[built % 6]).ok) built++;
  });
  const s = await page.evaluate(
    () =>
      new Promise<{ p: number; i: number; g: number; parts: number }[]>((resolve) => {
        type Emitter = { getAliveParticleCount(): number };
        const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
          state: { enemies: unknown[] };
          spawnHorde(n: number): boolean;
          fx: Record<string, Emitter>;
        };
        const out: { p: number; i: number; g: number; parts: number }[] = [];
        const end = performance.now() + 4000;
        const frame = (now: number) => {
          if (scene.state.enemies.length < 120) scene.spawnHorde(120 - scene.state.enemies.length);
          const f = window.__tarpit!.fx()!;
          const parts = Math.max(...['smoke', 'dust', 'sparks'].map((k) => scene.fx[k].getAliveParticleCount()));
          out.push({ p: f.projectiles, i: f.impacts, g: f.goldLabels.length, parts });
          if (now < end) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
  );
  const max = (k: 'p' | 'i' | 'g' | 'parts') => Math.max(...s.map((x) => x[k]));
  expect(max('p')).toBeGreaterThan(5);
  expect(max('p')).toBeLessThanOrEqual(96);
  expect(max('i')).toBeLessThanOrEqual(48);
  expect(max('g')).toBeLessThanOrEqual(10);
  expect(max('g')).toBeGreaterThan(0);
  expect(max('parts')).toBeLessThanOrEqual(120);
});

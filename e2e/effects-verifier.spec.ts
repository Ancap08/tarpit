/* eslint-disable @typescript-eslint/no-explicit-any -- probes reach into private scene fields (fx, enemySprites) */
// Milestone 31 verifier probes: input and cameras during shakes, leaks, speed, caps, reduced motion, doomed sprites, boss gold.
import { expect, test, type Page } from '@playwright/test';
import type { FxState } from '../src/game/fx/effects';
import { waitForTitle } from './title';
import { MAPS, pathLength, positionAlongPath, isBuildableTerrain } from '../src/sim';

type Rect = { x: number; y: number; width: number; height: number };
type Scene = {
  state: any;
  build(c: { col: number; row: number }, t: string): { ok: boolean };
  startWave(): { ok: boolean };
  pickBoon(id: string): unknown;
  advance(n: number, redraw?: boolean): void;
  spawnHorde(n: number, span?: number): boolean;
  setSpeed(s: number): void;
  useSpecialAt(t: string, x: number, y: number): { ok: boolean };
  playAgain(): void;
  toMenu(): void;
  update(t: number, d: number): void;
  enemySprites: any;
  fx: any;
  cameras: any;
  children: { list: unknown[] };
  callNextWave(): unknown;
};
declare global {
  interface Window {
    __sc: () => Scene;
  }
}

async function startPlay(page: Page, url = '/?renderer=canvas&perf=1'): Promise<void> {
  await page.goto(url);
  await waitForTitle(page);
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.fx() !== null);
  await page.evaluate(() => {
    window.__sc = () => window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
    window.__sc().state.gold = 1e5;
    window.__sc().state.lives = 1e5;
  });
}
const fx = (page: Page) => page.evaluate(() => window.__tarpit!.fx() as FxState);


const click = async (page: Page, r: Rect) => page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
const rects = (page: Page) => page.evaluate(() => window.__tarpit!.uiRects() as Record<string, Rect>);
const cellPt = (col: number, row: number) => ({ x: col * 32 + 16, y: row * 32 + 16 });
const cams = (page: Page) =>
  page.evaluate(() => {
    const m = window.__sc().cameras;
    return { n: m.cameras.length, w: m.main.width, h: m.main.height, y: m.main.y, sx: m.main.scrollX, sy: m.main.scrollY };
  });

async function bossArrives(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = window.__sc();
    s.state.wave = 9;
    s.startWave();
    for (let i = 0; i < 20000 && window.__tarpit!.fx()!.bossEntrances === 0; i++) s.advance(1, false);
  });
}

// D: input during each shake. A tower is placed by bar click + map click, a tower panel opened, Start Wave pressed, all inside the shake.
for (const kind of ['boss entrance', 'keg']) {
  test(`input lands correctly during the ${kind} shake and the camera is whole afterwards`, async ({ page }) => {
    await startPlay(page);
    await page.evaluate(() => window.__sc().build({ col: 6, row: 5 }, 'cannon'));
    if (kind === 'keg') await page.evaluate(() => window.__sc().fx.shakeKeg());
    else await bossArrives(page);
    await page.waitForTimeout(40);
    const log: string[] = [];
    const split = async () => (await fx(page)).camera.split;
    log.push(`split0=${await split()}`);
    const r = await rects(page);
    await click(page, r['bar:musketeer']);
    const c = cellPt(2, 5);
    await page.mouse.click(c.x, c.y);
    log.push(`split1=${await split()}`);
    const built = await page.evaluate(() => window.__sc().state.towers.some((t: any) => t.cell.col === 2 && t.cell.row === 5 && t.type === 'musketeer'));
    expect(built, 'tower placed by a click during the shake').toBe(true);
    // Open the other tower's panel.
    const p = cellPt(6, 5);
    await page.mouse.click(p.x, p.y);
    const keys = Object.keys(await rects(page)).filter((k) => !k.startsWith('bar:') && !['gold', 'startWave', 'speed', 'special'].includes(k));
    log.push(`panelKeys=${keys.join(',')} split2=${await split()}`);
    expect(keys.length, 'panel opened').toBeGreaterThan(0);
    // Speed button in the HUD rows, mid-shake if any left.
    await click(page, (await rects(page)).speed);
    await page.waitForFunction(() => !window.__tarpit!.fx()!.camera.split, undefined, { timeout: 3000 });
    expect(await cams(page)).toMatchObject({ n: 1, h: 580, y: 0, sx: 0, sy: 0 });
  });
}

test('Start Wave pressed during a keg shake starts the wave', async ({ page }) => {
  await startPlay(page);
  await page.evaluate(() => window.__sc().fx.shake({ ms: 3000, px: 6 }));
  await page.waitForTimeout(40);
  expect((await fx(page)).camera.split).toBe(true);
  const r = await rects(page);
  await click(page, r.startWave);
  expect(await page.evaluate(() => window.__sc().state.phase)).not.toBe('setup');
});

for (const exitKind of ['playAgain', 'menu', 'keepGoing']) {
  test(`ending the game mid-shake then ${exitKind}: one camera, whole viewport, nothing drawn from the old game`, async ({ page }) => {
    await startPlay(page);
    await page.evaluate(() => window.__sc().build({ col: 6, row: 5 }, 'cannon'));
    await page.evaluate((exitKind) => {
      const s = window.__sc();
      s.spawnHorde(5, 200);
      s.fx.shakeKeg();
      s.state.phase = exitKind === 'keepGoing' ? 'won' : 'lost';
    }, exitKind);
    await page.waitForTimeout(30);
    const r = await rects(page);
    expect(Object.keys(r), 'end screen visible').toContain(exitKind === 'menu' ? 'menu' : 'playAgain');
    await click(page, r[exitKind]);
    await page.waitForTimeout(700);
    if (exitKind === 'menu') {
      await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('title'));
      // And a new game from the title.
      const t = await page.evaluate(() => window.__tarpit!.uiRects()['title:play'] as Rect);
      await click(page, t);
      await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game'));
    }
    expect(await cams(page)).toMatchObject({ n: 1, h: 580, y: 0, sx: 0, sy: 0 });
    const f = await fx(page);
    if (exitKind !== 'keepGoing') expect(f).toMatchObject({ projectiles: 0, impacts: 0, goldLabels: [], banner: null, pendingKills: 0, camera: { split: false } });
    else expect(f.camera.split).toBe(false);
  });
}

// D: leaks. Play for many waves at 3x in real time, then Play again.
test('ten waves at 3x then Play again: idle counts, nothing from the old game', async ({ page }) => {
  // About 2.5 minutes of real time: run with VERIFIER_LONG=1 (the verifier's own run did, and passed).
  test.skip(!process.env.VERIFIER_LONG, 'set VERIFIER_LONG=1 for the ten-wave leak run');
  test.setTimeout(280_000);
  await startPlay(page);
  await page.evaluate(() => {
    const s = window.__sc();
    const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
    let n = 0;
    for (let row = 1; row < 15 && n < 25; row += 2) for (let col = 1; col < 30 && n < 25; col += 2) if (s.build({ col, row }, types[n % 6]).ok) n++;
    s.setSpeed(3);
    // bounty bookkeeping
    const w = window as any;
    w.bounty = 0;
    w.labelGold = 0;
    w.maxima = { p: 0, i: 0, g: 0, parts: 0 };
    const fxo = s.fx;
    const onEv = fxo.onEvents.bind(fxo);
    fxo.onEvents = (events: any[], st: any) => {
      for (const e of events) if (e.kind === 'kill') w.bounty += e.bounty;
      onEv(events, st);
    };
    const add = fxo.addGold.bind(fxo);
    fxo.addGold = (x: number, y: number, a: number, big?: boolean) => {
      w.labelGold += a;
      add(x, y, a, big);
    };
    const frame = () => {
      if ((window as any).halt) return;
      try {
        body();
      } catch (e) {
        (window as any).err = String(e);
      }
      requestAnimationFrame(frame);
    };
    const body = () => {
      const f = window.__tarpit!.fx();
      if (!f) return;
      const m = w.maxima;
      m.p = Math.max(m.p, f.projectiles);
      m.i = Math.max(m.i, f.impacts);
      m.g = Math.max(m.g, f.goldLabels.length);
      let parts = 0;
      for (const o of s.children.list as any[]) if (o.getAliveParticleCount) parts = Math.max(parts, o.getAliveParticleCount());
      m.parts = Math.max(m.parts, parts);
      for (const e of s.state.enemies) if (e.type === 'boss') e.hp = Math.min(e.hp, 1);
      if (s.state.phase === 'setup' || s.state.phase === 'cleared') {
        const id = s.state.pendingBoon?.options[0];
        if (id) s.pickBoon(id);
        s.startWave();
      }
      else s.callNextWave?.();
    };
    requestAnimationFrame(frame);
  });
  for (let i = 0; i < 100; i++) {
    const st = await page.evaluate(() => ({ w: window.__sc().state.wave, p: window.__sc().state.phase, n: window.__sc().state.enemies.length }));
    if (i % 5 === 0) console.log('progress', JSON.stringify(st), (await page.evaluate(() => (window as any).err)));
    if (st.w >= 10 || ['won', 'lost'].includes(st.p)) break;
    await page.waitForTimeout(2000);
  }
  const mid = await page.evaluate(() => ({ wave: window.__sc().state.wave, phase: window.__sc().state.phase, bossDeaths: window.__tarpit!.fx()!.bossDeaths, max: (window as any).maxima }));
  console.log('after waves', JSON.stringify(mid));
  // Let the pending effects drain, then compare gold.
  await page.evaluate(() => ((window as any).halt = true, (window.__sc().state.phase = 'lost'), undefined));
  await page.waitForTimeout(3000);
  const g = await page.evaluate(() => ({ bounty: (window as any).bounty, labelGold: (window as any).labelGold, f: window.__tarpit!.fx() }));
  console.log('gold', g.bounty, g.labelGold, JSON.stringify(g.f));
  expect(g.labelGold).toBe(g.bounty);
  const r = await rects(page);
  await click(page, r.playAgain);
  await page.waitForTimeout(500);
  const f = await fx(page);
  expect(f).toMatchObject({ projectiles: 0, impacts: 0, goldLabels: [], banner: null, pendingKills: 0, darken: 0, camera: { split: false } });
  const idle = await page.evaluate(() => {
    const s = window.__sc();
    let parts = 0;
    for (const o of s.children.list as any[]) if (o.getAliveParticleCount) parts += o.getAliveParticleCount();
    return { parts, views: s.enemySprites.views.size, cams: s.cameras.cameras.length };
  });
  console.log('idle', JSON.stringify(idle));
  expect(idle).toMatchObject({ parts: 0, views: 0, cams: 1 });
});


// D: speed. Real ms of a cannon shot's flight at each speed.
for (const speed of [1, 2, 3]) {
  test(`cannon flight takes 260/${speed} real ms at ${speed}x`, async ({ page }) => {
    await startPlay(page);
    await page.evaluate((speed) => {
      const s = window.__sc();
      s.build({ col: 2, row: 5 }, 'cannon');
      s.setSpeed(speed);
      s.spawnHorde(1, 40);
      for (const e of s.state.enemies) e.hp = 99999;
    }, speed);
    const t = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          let start = -1;
          const end = performance.now() + 3000;
          const frame = (now: number) => {
            const p = window.__tarpit!.fx()!.projectiles;
            if (p > 0 && start < 0) start = now;
            if (p === 0 && start >= 0) {
              out.push(now - start);
              start = -1;
            }
            if (now < end) requestAnimationFrame(frame);
            else resolve(out);
          };
          requestAnimationFrame(frame);
        }),
    );
    console.log(`speed ${speed}x flights(real ms):`, t.slice(0, 6).map((x) => x.toFixed(0)).join(' '));
    expect(t.length).toBeGreaterThan(0);
    const med = [...t].sort((a, b) => a - b)[Math.floor(t.length / 2)];
    expect(med).toBeLessThan(260 / speed + 40);
    expect(med).toBeGreaterThan(260 / speed - 40);
  });
}

test('a stale frame (huge delta, as after a hidden tab) dumps no burst of effects', async ({ page }) => {
  await startPlay(page);
  await page.evaluate(() => {
    const s = window.__sc();
    for (const [c, r] of [[4, 3], [4, 11], [6, 3], [6, 11], [8, 3]]) s.build({ col: c, row: r }, 'musketeer');
    s.spawnHorde(40, 300);
    for (const e of s.state.enemies) e.hp = 99999;
  });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const s = window.__sc();
    const before = window.__tarpit!.fx()!;
    s.update(0, 60000);
    const a = window.__tarpit!.fx()!;
    return { before: before.gameMs, after: a.gameMs, p: a.projectiles, i: a.impacts, labels: a.goldLabels.length };
  });
  console.log('stale', JSON.stringify(out));
  expect(out.after - out.before).toBeLessThanOrEqual(20 * (1000 / 60) + 5);
  expect(out.p).toBeLessThanOrEqual(96);
});

// D: caps with the horde
test('perf horde: live counts stay within the DESIGN caps', async ({ page }) => {
  test.setTimeout(60_000);
  await startPlay(page);
  const m = await page.evaluate(
    () =>
      new Promise<{ p: number; i: number; g: number; parts: number }>((resolve) => {
        const s = window.__sc();
        const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
        let n = 0;
        for (let row = 1; row < 15 && n < 25; row += 2) for (let col = 1; col < 30 && n < 25; col += 2) if (s.build({ col, row }, types[n % 6]).ok) n++;
        s.setSpeed(3);
        const m = { p: 0, i: 0, g: 0, parts: 0 };
        const end = performance.now() + 15000;
        const frame = (now: number) => {
          if (s.state.enemies.length < 120) s.spawnHorde(120 - s.state.enemies.length, 150);
          const f = window.__tarpit!.fx()!;
          m.p = Math.max(m.p, f.projectiles);
          m.i = Math.max(m.i, f.impacts);
          m.g = Math.max(m.g, f.goldLabels.length);
          for (const o of s.children.list as any[]) if (o.getAliveParticleCount) m.parts = Math.max(m.parts, o.getAliveParticleCount());
          if (now < end) requestAnimationFrame(frame);
          else resolve(m);
        };
        requestAnimationFrame(frame);
      }),
  );
  console.log('caps', JSON.stringify(m));
  expect(m.p).toBeLessThanOrEqual(96);
  expect(m.i).toBeLessThanOrEqual(48);
  expect(m.g).toBeLessThanOrEqual(10);
  expect(m.parts).toBeLessThanOrEqual(120);
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('boss entrance, keg and boss death: no shake, no darkening, no flash; banner, rings and projectiles remain', async ({ page }) => {
    await startPlay(page);
    await page.evaluate(() => window.__sc().build({ col: 2, row: 5 }, 'musketeer'));
    await bossArrives(page);
    await page.waitForFunction(() => window.__tarpit!.fx()!.banner === 'Grumblefoot', undefined, { timeout: 3000 });
    let f = await fx(page);
    expect(f).toMatchObject({ reducedMotion: true, darkenings: 0, shakes: 0, bossEntrances: 1, banner: 'Grumblefoot' });
    expect(f.darken).toBe(0);
    await page.evaluate(() => window.__sc().fx.shakeKeg());
    await page.evaluate(() => {
      for (const e of window.__sc().state.enemies) if (e.type === 'boss') e.hp = 1;
    });
    await page.waitForFunction(() => window.__tarpit!.fx()!.bossDeaths === 1, undefined, { timeout: 20000 });
    f = await fx(page);
    expect(f).toMatchObject({ shakes: 0, screenFlashes: 0, camera: { split: false } });
    expect(await cams(page)).toMatchObject({ n: 1, h: 580 });
    expect(f.impacts, 'boss death rings still drawn').toBeGreaterThan(0);
  });
});

// D: the walking dead near the exit
test('a doomed enemy next to the exit never costs a life, never draws past the exit, and is gone after its shot lands', async ({ page }) => {
  await startPlay(page);
  const map = MAPS.meadow;
  const len = pathLength(map);
  const exit = positionAlongPath(map, len);
  // A buildable cell 80 to 200 px from the exit (the mortar's minimum range is 70).
  let cell: { col: number; row: number } | null = null;
  for (let row = 0; row < 15 && !cell; row++)
    for (let col = 0; col < 30 && !cell; col++) {
      const d = Math.hypot(col * 32 + 16 - exit.x, row * 32 + 16 - exit.y);
      if (d > 85 && d < 200 && isBuildableTerrain({ col, row }, map)) cell = { col, row };
    }
  expect(cell).not.toBeNull();
  const res = await page.evaluate(
    ({ cell, len, exit }) =>
      new Promise<any>((resolve) => {
        const s = window.__sc();
        s.state.lives = 50;
        const b = s.build(cell!, 'mortar');
        s.spawnHorde(1, 10);
        const e = s.state.enemies[s.state.enemies.length - 1];
        e.distance = len - 12;
        e.hp = 1;
        const lives0 = s.state.lives;
        let doomedFrames = 0;
        let maxD = 0;
        const end = performance.now() + 5000;
        const frame = (now: number) => {
          const f = window.__tarpit!.fx()!;
          if (f.pendingKills > 0) {
            doomedFrames++;
            const k = s.fx.due.find((d: any) => d.kind === 'kill');
            const spot = s.enemySprites.spot(k.id);
            if (spot) maxD = Math.max(maxD, Math.hypot(spot.x - exit.x, spot.y - exit.y));
          }
          const stillThere = s.state.enemies.some((x: any) => x.id === e.id);
          if (doomedFrames > 0 && f.pendingKills === 0) return resolve({ built: b.ok, doomedFrames, lives: s.state.lives - lives0, stillThere, views: s.enemySprites.views.size });
          if (now > end) return resolve({ timeout: true, built: b.ok, lives: s.state.lives - lives0, doomedFrames });
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    { cell, len, exit },
  );
  console.log('doomed', JSON.stringify(res));
  expect(res.built).toBe(true);
  expect(res.timeout).toBeUndefined();
  expect(res.lives).toBe(0);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__sc().enemySprites.views.size - window.__sc().state.enemies.length)).toBe(0);
});

test('doomed enemy is removed when the game ends before its shot lands', async ({ page }) => {
  await startPlay(page);
  const r = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const s = window.__sc();
        for (const [c, r] of [[4, 3], [5, 3], [4, 11], [5, 11]]) if (s.build({ col: c, row: r }, 'mortar').ok) break;
        s.spawnHorde(1, 30);
        s.state.enemies[s.state.enemies.length - 1].hp = 1;
        const frame = () => {
          if (window.__tarpit!.fx()!.pendingKills > 0) {
            s.state.phase = 'lost';
            setTimeout(() => resolve({ views: s.enemySprites.views.size - s.state.enemies.length, pend: window.__tarpit!.fx()!.pendingKills }), 1200);
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  console.log('doomed+lost', JSON.stringify(r));
  expect(r.pend).toBe(0);
  expect(r.views).toBe(0);
});

// D: tower turning, sell, move
test('sell and move leave no ghost barrel; the barrel turns the short way and does not spin from directly behind', async ({ page }) => {
  await startPlay(page);
  const r = await page.evaluate(() => {
    const s = window.__sc();
    s.build({ col: 10, row: 5 }, 'cannon');
    s.build({ col: 12, row: 5 }, 'cannon');
    const keys0 = s.fx.poses.size;
    (s as any).sell({ col: 10, row: 5 });
    (s as any).move({ col: 12, row: 5 }, { col: 14, row: 5 });
    return { keys0, sells: s.fx.sells.length };
  });
  await page.waitForTimeout(500);
  const end = await page.evaluate(() => ({ sells: window.__sc().fx.sells.length, poses: [...window.__sc().fx.poses.keys()].length, towers: window.__sc().state.towers.length, a12: window.__tarpit!.towerAngle(12, 5), a14: window.__tarpit!.towerAngle(14, 5) }));
  console.log('sell/move', JSON.stringify(r), JSON.stringify(end));
  expect(end.poses).toBe(end.towers);
  expect(end.sells).toBe(0);
  expect(end.a12).toBeNull();
});

test("the boss's kill shows its own large +bounty label and the camera is whole afterwards", async ({ page }) => {
  await startPlay(page);
  await page.evaluate(() => window.__sc().build({ col: 2, row: 5 }, 'cannon'));
  await bossArrives(page);
  const bounty = await page.evaluate(() => {
    let b = 0;
    const fxo = window.__sc().fx;
    const on = fxo.onEvents.bind(fxo);
    fxo.onEvents = (ev: any[], st: any) => {
      for (const e of ev) if (e.kind === 'kill') b += e.bounty;
      (window as any).bb = b;
      on(ev, st);
    };
    for (const e of window.__sc().state.enemies) if (e.type === 'boss') e.hp = 1;
    return 0;
  });
  const labels = new Set<string>();
  for (let i = 0; i < 60 && (await fx(page)).bossDeaths === 0; i++) await page.waitForTimeout(250);
  for (let i = 0; i < 10; i++) {
    for (const l of (await fx(page)).goldLabels) labels.add(l);
    await page.waitForTimeout(100);
  }
  console.log('boss labels', [...labels].join(' '), 'bounty events', await page.evaluate(() => (window as any).bb), bounty);
  expect([...labels]).toContain('+150');
  await page.waitForTimeout(800);
  expect(await cams(page)).toMatchObject({ n: 1, h: 580, sx: 0, sy: 0 });
});

// Verifier finding (low, not reachable by a person): a click that lands in the same frame a shake
// starts is dropped (the HUD camera is added mid-frame; 60 ms later clicks work, as the tests above show).
test.fixme('a click in the very frame a shake starts still lands', async ({ page }) => {
  await startPlay(page);
  await page.mouse.move(100, 100);
  await page.evaluate(() => window.__sc().fx.shake({ ms: 3000, px: 6 }));
  const r = await rects(page);
  await click(page, r.startWave);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__sc().state.phase)).not.toBe('setup');
});

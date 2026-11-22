import { expect, test } from '@playwright/test';
import { MAX_VOICES } from '../src/game/audio/mixer';
import { TRAVEL_MS } from '../src/game/fx/fxMath';
import { MUTE_TEXT } from '../src/game/names';
import { audio, buildNearSpawn, contexts, count, countContexts, muteRoundTrip, onScene, rectCentre, startPlay } from './sound';
import { waitForTitle } from './title';

/** The horde measurement's length, and the most sound starts per second it may show (DESIGN.md, "Sound"). */
const HORDE_SECONDS = 4;
/** The budget (20 a second) plus a little room for moments and the beat floor; 90 a second at 3x before the follow-up. */
const HORDE_MAX_STARTS_PER_S = 40;

// Milestone 33 (sound), real mode in the desktop project. The engine's
// counts (window.__tarpit.audio()) show which sounds were requested and
// played; the scene's own actions drive the game, as effects.spec.ts does.

test('no AudioContext exists before the first gesture; one exists and runs after it', async ({ page }) => {
  await countContexts(page);
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  await page.waitForTimeout(300);
  expect(await contexts(page)).toBe(0);
  expect((await audio(page)).context).toBe('none');
  await page.mouse.click(480, 40);
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
  expect(await contexts(page)).toBe(1);
  // More gestures make no second context.
  await page.keyboard.press('ArrowLeft');
  await page.mouse.click(480, 40);
  expect(await contexts(page)).toBe(1);
});

test('test mode creates nothing and plays nothing', async ({ page }) => {
  await countContexts(page);
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.mouse.click(480, 40);
  await page.evaluate(() => window.__tarpit!.startGame!());
  await page.evaluate(() => {
    const t = window.__tarpit!;
    t.buildAt!(2, 5, 'cannon');
    t.startWave!();
    t.step!(600);
  });
  const a = await audio(page);
  expect(a).toMatchObject({ enabled: false, context: 'none', voices: 0, requested: {}, played: {} });
  expect(await contexts(page)).toBe(0);
});

test('a shot sounds when fired and its impact only when the drawn projectile lands; kills pop', async ({ page }) => {
  await startPlay(page);
  await buildNearSpawn(page, 'cannon');
  await onScene(page, (scene) => scene.startWave(), null);
  // Sample the counts every frame: when the first shot and the first impact were requested.
  const t = await page.evaluate(
    () =>
      new Promise<{ shot: number; impact: number; impactAtShot: number }>((resolve) => {
        let shot = -1;
        let impactAtShot = -1;
        const frame = (now: number) => {
          const a = window.__tarpit!.audio();
          const shots = a.requested['shot.cannon'] ?? 0;
          const impacts = a.requested['impact.cannon'] ?? 0;
          if (shot < 0 && shots > 0) {
            shot = now;
            impactAtShot = impacts;
          }
          if (shot >= 0 && impacts > 0) resolve({ shot, impact: now, impactAtShot });
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  expect(t.impactAtShot).toBe(0);
  // At 1x the projectile flies TRAVEL_MS of real time (frames are ~16.7 ms).
  expect(t.impact - t.shot).toBeGreaterThanOrEqual(TRAVEL_MS.cannon - 40);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested['death.small'] ?? 0) > 0, undefined, { timeout: 20_000 });
  expect(await count(page, 'requested', 'hit')).toBeGreaterThan(0);
  expect(await count(page, 'played', 'shot.cannon')).toBeGreaterThan(0);
});

test('every tower has its shot and impact', async ({ page }) => {
  await startPlay(page);
  for (const type of ['musketeer', 'longbow', 'cannon', 'mortar', 'tarpit', 'firepot']) await buildNearSpawn(page, type);
  await onScene(page, (scene) => {
    scene.startWave();
    scene.spawnHorde(40);
  }, null);
  for (const type of ['musketeer', 'longbow', 'cannon', 'mortar', 'tarpit', 'firepot']) {
    await page.waitForFunction((t) => (window.__tarpit!.audio().requested[`impact.${t}`] ?? 0) > 0, type, { timeout: 15_000 });
    expect(await count(page, 'requested', `shot.${type}`)).toBeGreaterThan(0);
  }
});

test('build, upgrade, sell, a refused action, a tap, a tower select, the cheat and Call next each sound', async ({ page }) => {
  await startPlay(page);
  const cell = await buildNearSpawn(page, 'musketeer');
  expect(await count(page, 'requested', 'build')).toBe(1);
  await onScene(page, (scene, c) => scene.upgrade(c), cell);
  expect(await count(page, 'requested', 'upgrade')).toBe(1);
  // Building on the same cell is refused.
  await onScene(page, (scene, c) => scene.build(c, 'cannon'), cell);
  expect(await count(page, 'requested', 'refuse')).toBeGreaterThan(0);
  // A click on the tower selects it.
  const tower = await page.evaluate(([c, r]) => window.__tarpit!.cellToPage(c, r), [cell.col, cell.row]);
  await page.mouse.click(tower.x, tower.y);
  expect(await count(page, 'requested', 'select')).toBe(1);
  // A HUD button (the speed toggle) taps.
  const taps = await count(page, 'requested', 'tap');
  const speed = await rectCentre(page, 'speed');
  await page.mouse.click(speed.x, speed.y);
  expect(await count(page, 'requested', 'tap')).toBe(taps + 1);
  await onScene(page, (scene, c) => scene.sell(c), cell);
  expect(await count(page, 'requested', 'sell')).toBe(1);
  await onScene(page, (scene) => scene.cheatGold(), null);
  expect(await count(page, 'requested', 'coin')).toBe(1);
  // Start Wave (the horn), then Call next once it is offered.
  const start = await rectCentre(page, 'startWave');
  await page.mouse.click(start.x, start.y);
  expect(await count(page, 'requested', 'waveStart')).toBe(1);
  await onScene(page, (scene) => {
    scene.state.spawnedPerGroup = scene.state.spawnedPerGroup.map(() => 1e6);
    scene.callNextWave();
  }, null);
  expect(await count(page, 'requested', 'callNext')).toBe(1);
  expect(await count(page, 'requested', 'waveStart')).toBe(1);
});

test('the specials and the charge becoming ready sound', async ({ page }) => {
  await startPlay(page);
  await onScene(page, (scene) => {
    scene.state.wave = 8;
    scene.startWave();
    for (const type of ['keg', 'tarBarrel', 'fireArrows']) {
      scene.state.specialCharges = 1;
      scene.state.specialRechargeTicks = 0;
      scene.useSpecialAt(type, 300, 240);
    }
    scene.state.specialCharges = 0;
    scene.state.specialRechargeTicks = 3;
  }, null);
  for (const n of ['special.keg', 'special.tarBarrel', 'special.fireArrows']) expect(await count(page, 'requested', n), n).toBe(1);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.chargeReady ?? 0) === 1);
});

test('wave clear, an exit, the boss arriving and falling, the win and the loss sound', async ({ page }) => {
  await startPlay(page);
  for (const t of ['musketeer', 'musketeer', 'cannon']) await buildNearSpawn(page, t);
  // Wave 1 clears at once when every group has spawned and the field is empty.
  await onScene(page, (scene) => {
    scene.startWave();
    scene.state.spawnedPerGroup = scene.state.spawnedPerGroup.map(() => 1e6);
    scene.state.enemies = [];
  }, null);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.waveClear ?? 0) === 1);
  // The boss: wave 10, run until he is on the map, then bring him down.
  await onScene(page, (scene) => {
    scene.state.wave = 9;
    scene.startWave();
    for (let i = 0; i < 20000 && window.__tarpit!.fx()!.bossEntrances === 0; i++) scene.advance(1, false);
  }, null);
  expect(await count(page, 'requested', 'bossArrive')).toBe(1);
  await onScene(page, (scene) => {
    for (const e of scene.state.enemies) if (e.type === 'boss') e.hp = 1;
  }, null);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.bossFall ?? 0) === 1, undefined, { timeout: 10_000 });
  // An exit: an enemy at the end of the path.
  await onScene(page, (scene) => {
    const e = scene.state.enemies.find((x) => x.type !== 'boss');
    if (e) e.distance = 1e5;
  }, null);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.exit ?? 0) > 0);
  // The win: the last wave's field cleared.
  await onScene(page, (scene) => {
    scene.state.spawnedPerGroup = scene.state.spawnedPerGroup.map(() => 1e6);
    scene.state.enemies = [];
  }, null);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.win ?? 0) === 1);
  expect(await count(page, 'requested', 'waveClear')).toBe(1);

  // The loss, in a new game: one life and an enemy through.
  await startPlay(page);
  await onScene(page, (scene) => {
    scene.startWave();
    scene.spawnHorde(1);
    scene.state.lives = 1;
    scene.state.enemies[0].distance = 1e5;
  }, null);
  await page.waitForFunction(() => (window.__tarpit!.audio().requested.lose ?? 0) === 1);
});

test('muting stops new sounds at once, survives a reload, and M toggles it', async ({ page }) => {
  await startPlay(page);
  const mute = await rectCentre(page, 'mute');
  await page.mouse.click(mute.x, mute.y);
  expect(await audio(page)).toMatchObject({ muted: true, label: MUTE_TEXT.off, voices: 0 });
  const played = await count(page, 'played', 'build');
  await buildNearSpawn(page, 'musketeer');
  expect(await count(page, 'requested', 'build')).toBe(1);
  expect(await count(page, 'played', 'build')).toBe(played);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.muted'))).toBe('1');

  await page.reload();
  await waitForTitle(page);
  expect((await audio(page)).muted).toBe(true);
  await page.keyboard.press('m');
  expect(await audio(page)).toMatchObject({ muted: false, label: MUTE_TEXT.on });
  expect(await page.evaluate(() => localStorage.getItem('tarpit.muted'))).toBe('0');
  await page.keyboard.press('M');
  expect((await audio(page)).muted).toBe(true);
  // The title's button unmutes, and unmuting plays a tap.
  const titleMute = await rectCentre(page, 'title:mute');
  await page.mouse.click(titleMute.x, titleMute.y);
  expect((await audio(page)).muted).toBe(false);
  await page.waitForFunction(() => (window.__tarpit!.audio().played.tap ?? 0) > 0);
});

test('blocked storage never throws: the mute holds for the session', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  await page.keyboard.press('m');
  expect((await audio(page)).muted).toBe(true);
  expect(errors).toEqual([]);
});

test('hiding the page suspends the context and showing it resumes', async ({ page }) => {
  await startPlay(page);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'suspended');
  expect((await audio(page)).voices).toBe(0);
  await setHidden(false);
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
});

for (const speed of [1, 3]) {
  test(`a 120-enemy horde at ${speed}x stays under the voice cap, is thinned and keeps its starts per second down`, async ({ page }) => {
    test.setTimeout(60_000);
    await startPlay(page);
    await onScene(page, (scene, speed) => {
      const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
      let built = 0;
      for (let row = 1; row < 15 && built < 25; row += 2) {
        for (let col = 1; col < 30 && built < 25; col += 2) if (scene.build({ col, row }, types[built % types.length]).ok) built += 1;
      }
      scene.spawnHorde(120);
      scene.setSpeed(speed);
    }, speed);
    // Let the horde reach the towers, then measure.
    await page.waitForTimeout(1500);
    const before = await audio(page);
    const voices = await page.evaluate(
      (seconds) =>
        new Promise<number[]>((resolve) => {
          type Scene = { state: { enemies: unknown[] }; spawnHorde(n: number): boolean };
          const scene = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
          const seen: number[] = [];
          const end = performance.now() + seconds * 1000;
          const frame = (now: number) => {
            if (scene.state.enemies.length < 120) scene.spawnHorde(120 - scene.state.enemies.length);
            seen.push(window.__tarpit!.audio().voices);
            if (now < end) requestAnimationFrame(frame);
            else resolve(seen);
          };
          requestAnimationFrame(frame);
        }),
      HORDE_SECONDS,
    );
    const a = await audio(page);
    const delta = (k: 'requested' | 'played' | 'thinned' | 'capped') =>
      Object.entries(a[k]).reduce((s, [n, v]) => s + v - (before[k][n] ?? 0), 0);
    const perS = delta('played') / HORDE_SECONDS;
    const names = Object.keys(a.played).filter((n) => (a.played[n] ?? 0) > (before.played[n] ?? 0));
    console.log(
      `horde ${speed}x: ${perS.toFixed(1)} starts/s, max voices ${Math.max(...voices)}, requested ${delta('requested')}, ` +
        `played ${delta('played')}, thinned ${delta('thinned')}, capped ${delta('capped')}; playing: ${names.sort().join(' ')}`,
    );
    expect(Math.max(...voices)).toBeLessThanOrEqual(MAX_VOICES);
    expect(delta('thinned')).toBeGreaterThan(0);
    expect(perS).toBeGreaterThan(0);
    expect(perS).toBeLessThanOrEqual(HORDE_MAX_STARTS_PER_S);
    // The texture keeps the busy sounds audible: hits, small deaths and Musketeer shots and ticks each still play at least once a second.
    for (const n of ['hit', 'death.small', 'shot.musketeer', 'impact.musketeer']) {
      expect((a.played[n] ?? 0) - (before.played[n] ?? 0), n).toBeGreaterThanOrEqual(HORDE_SECONDS);
    }
  });
}

test('the mute buttons (960 x 580, mouse): 42 px, overlapping nothing, on the title and in the HUD', async ({ page }) => {
  await muteRoundTrip(page, false, 42);
  expect(await page.evaluate(() => window.__tarpit!.uiRects().mute)).toEqual({ x: 904, y: 533, width: 42, height: 42 });
});

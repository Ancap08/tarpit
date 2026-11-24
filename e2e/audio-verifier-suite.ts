import { expect, test, type Page } from '@playwright/test';
import { audio, contexts, countContexts, onScene, press } from './sound';
import { waitForFirstScreen, waitForTitle } from './title';
import { setPageHidden } from './pause';

// Milestone 33 verifier (Claude Sonnet): start, stop, failure, triggers and
// leaks, run in all three projects through audio-verifier.spec.ts (mouse),
// audio-verifier-touch.spec.ts (tablet) and audio-verifier-phone.spec.ts.

const URL = '/?renderer=canvas&perf=1';

async function toGame(page: Page, touch: boolean): Promise<void> {
  await page.goto(URL);
  await waitForTitle(page);
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit!.fx() !== null);
}

const swapViewport = async (page: Page) => {
  const v = page.viewportSize()!;
  await page.setViewportSize({ width: v.height, height: v.width });
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') || window.__tarpit?.titleReady?.());
  await page.waitForTimeout(500);
};

export function suite(touch: boolean): void {
  test('no AudioContext before the first gesture (title and game); exactly one after, through restarts, layout switches, Menu and Play again', async ({ page }) => {
    await countContexts(page);
    await page.goto(URL);
    await waitForFirstScreen(page);
    await page.waitForTimeout(300);
    expect(await contexts(page)).toBe(0);
    // In the game with no gesture at all.
    await page.evaluate(() => { window.__tarpit!.game.scene.stop('title'); window.__tarpit!.game.scene.start('game', {}); });
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game'));
    await page.waitForTimeout(300);
    expect(await contexts(page), 'in the game, before a gesture').toBe(0);
    expect((await audio(page)).context).toBe('none');
    // The first gesture opens Free play after a reload.
    await page.reload();
    await waitForFirstScreen(page);
    expect(await contexts(page)).toBe(0);
    await press(page, 'title:freePlay', touch);
    await waitForTitle(page);
    await press(page, 'title:play', touch);
    await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
    expect(await contexts(page)).toBe(1);
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.fx() !== null);
    // Layout switch (rotate), twice.
    await swapViewport(page);
    await swapViewport(page);
    expect(await contexts(page), 'after two layout switches').toBe(1);
    // Menu, then Play.
    await onScene(page, (scene) => (scene as unknown as { toMenu(): void }).toMenu(), null);
    await waitForTitle(page);
    await press(page, 'title:play', touch);
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.fx() !== null);
    expect(await contexts(page), 'after Menu then Play').toBe(1);
    // Play again (restart of the scene).
    await onScene(page, (scene) => (scene as unknown as { playAgain(): void }).playAgain(), null);
    await page.waitForTimeout(500);
    expect(await contexts(page), 'after Play again').toBe(1);
    expect((await audio(page)).context).toBe('running');
  });

  for (const mode of ['missing', 'throws', 'resume rejects'] as const) {
    test(`AudioContext ${mode}: the game plays silently, with no error or unhandled rejection`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`));
      await page.addInitScript((mode) => {
        const w = window as unknown as Record<string, unknown>;
        const Orig = window.AudioContext;
        if (mode === 'missing') {
          delete w.AudioContext;
          delete w.webkitAudioContext;
        } else if (mode === 'throws') {
          w.AudioContext = function () {
            throw new Error('no audio here');
          };
        } else {
          w.AudioContext = class extends Orig {
            resume(): Promise<void> {
              return Promise.reject(new Error('resume refused'));
            }
            suspend(): Promise<void> {
              return Promise.reject(new Error('suspend refused'));
            }
          };
        }
      }, mode);
      await toGame(page, touch);
      await onScene(page, (scene) => {
        scene.state.gold = 1e5;
        scene.build({ col: 2, row: 5 }, 'cannon');
        scene.startWave();
        scene.setSpeed(3);
      }, null);
      await page.waitForTimeout(2500);
      await press(page, 'mute', touch);
      await press(page, 'mute', touch);
      await page.keyboard.press('m');
      await page.keyboard.press('m');
      // The sim goes on and the game is alive.
      const tick = await onScene(page, (scene) => (scene as unknown as { state: { tick: number } }).state.tick, null);
      expect(tick).toBeGreaterThan(30);
      const a = await audio(page);
      // With resume() rejecting but the context running anyway (Chrome after a gesture) sound still plays; only a missing or throwing context is silent.
      if (mode !== 'resume rejects') expect(Object.values(a.played).reduce((s, n) => s + n, 0), 'nothing played').toBe(0);
      if (mode === 'missing') expect(a.enabled).toBe(false);
      expect(errors).toEqual([]);
    });
  }

  test('a hidden game stays suspended until Resume; a layout switch mid-wave keeps one context and does not burst or hang voices', async ({ page }) => {
    test.setTimeout(120_000);
    await countContexts(page);
    await toGame(page, touch);
    await onScene(page, (scene) => {
      scene.state.gold = 1e5;
      scene.state.lives = 1e5;
      for (const [c, r] of [[2, 5], [2, 9], [3, 5]]) scene.build({ col: c, row: r }, 'musketeer');
      scene.startWave();
    }, null);
    await page.waitForFunction(() => (window.__tarpit!.audio().requested['shot.musketeer'] ?? 0) > 2, undefined, { timeout: 60_000 });
    const total = async (k: 'requested' | 'played') => Object.values((await audio(page))[k]).reduce((s, n) => s + n, 0);
    await setPageHidden(page, true);
    await page.waitForFunction(() => window.__tarpit!.audio().context === 'suspended');
    expect((await audio(page)).voices).toBe(0);
    const playedHidden = await total('played');
    await page.waitForTimeout(1500);
    expect(await total('played'), 'nothing starts while hidden').toBe(playedHidden);
    await setPageHidden(page, false);
    expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
    expect((await audio(page)).context).toBe('suspended');
    await press(page, 'pause:resume', touch);
    await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
    // No burst: right after showing, at most a handful of starts in 100 ms.
    const p0 = await total('played');
    await page.waitForTimeout(100);
    expect((await total('played')) - p0).toBeLessThan(12);
    // Rotate mid-wave.
    const r0 = await total('requested');
    await swapViewport(page);
    expect(await contexts(page)).toBe(1);
    await page.waitForTimeout(1500);
    expect((await audio(page)).context).toBe('running');
    // After the quiet (nothing new) the voices run out.
    await onScene(page, (scene) => {
      scene.state.enemies = [];
      scene.state.spawnedPerGroup = scene.state.spawnedPerGroup.map(() => 1e6);
    }, null);
    await page.waitForFunction(() => window.__tarpit!.audio().voices === 0, undefined, { timeout: 8_000 });
    expect(await total('requested')).toBeGreaterThanOrEqual(r0);
  });

  test('M toggles anywhere: in the game, while aiming a special, on the title; malformed and throwing storage are tolerated', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tarpit.muted', '  garbage'));
    await page.goto(URL);
    await waitForTitle(page);
    expect((await audio(page)).muted, 'malformed value means sound on').toBe(false);
    await page.keyboard.press('m');
    expect((await audio(page)).muted).toBe(true);
    await page.keyboard.press('M');
    expect((await audio(page)).muted).toBe(false);
    await toGame(page, touch);
    await onScene(page, (scene) => {
      scene.state.wave = 8;
      scene.state.specialCharges = 1;
    }, null);
    // Aim a special by its button, then press M: reports what happens.
    await press(page, 'special', touch);
    const menuOpen = await page.evaluate(() => (window.__tarpit!.uiRects() as Record<string, unknown>)['special:keg'] !== undefined);
    await page.keyboard.press('m');
    const muted = (await audio(page)).muted;
    console.log(`M with the special menu open (${menuOpen}): muted=${muted}`);
    expect(muted).toBe(true);
    await page.keyboard.press('m');
    // End screen: the lost screen keeps M working.
    await onScene(page, (scene) => {
      scene.startWave();
      scene.spawnHorde(1);
      scene.state.lives = 1;
      scene.state.enemies[0].distance = 1e5;
    }, null);
    await page.waitForFunction(() => Object.keys(window.__tarpit!.uiRects()).includes('playAgain'));
    await page.keyboard.press('m');
    expect((await audio(page)).muted, 'M on the end screen').toBe(true);
  });

  test('storage that throws on access never breaks the game or the mute', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await page.goto(URL);
    await waitForTitle(page);
    await press(page, 'title:mute', touch);
    expect((await audio(page)).muted).toBe(true);
    expect(errors).toEqual([]);
  });

  test('each event class requests its sound once per event; an impact never comes before its projectile lands (1x, 2x, 3x)', async ({ page }) => {
    test.setTimeout(90_000);
    await toGame(page, touch);
    await onScene(page, (scene) => {
      scene.state.gold = 1e5;
      scene.state.lives = 1e5;
      for (const [c, r, t] of [[2, 5, 'cannon'], [2, 9, 'mortar']] as const) scene.build({ col: c, row: r }, t);
    }, null);
    for (const speed of [1, 2, 3]) {
      const r = await page.evaluate(
        async (speed) => {
          type Scene = {
            state: { enemies: unknown[]; tick: number };
            fx: { onTick(shots: readonly unknown[]): void } | null;
            spawnHorde(n: number): boolean;
            setSpeed(s: number): void;
            startWave(): unknown;
          };
          const scene = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
          const names = ['cannon', 'mortar'];
          const req = () => {
            const a = window.__tarpit!.audio().requested;
            return names.map((n) => [a[`shot.${n}`] ?? 0, a[`impact.${n}`] ?? 0]);
          };
          const base = req();
          let shotsSeen = 0;
          const orig = scene.fx!.onTick.bind(scene.fx);
          scene.fx!.onTick = (shots) => {
            shotsSeen += shots.filter((s) => (s as { tower: string }).tower === 'cannon' || (s as { tower: string }).tower === 'mortar').length;
            orig(shots);
          };
          scene.setSpeed(speed);
          scene.spawnHorde(12);
          let impactAhead = 0;
          const firstShot: number[] = [-1, -1];
          const firstImpact: number[] = [-1, -1];
          await new Promise<void>((resolve) => {
            const end = performance.now() + 4000;
            const frame = (now: number) => {
              const cur = req();
              cur.forEach((c, i) => {
                const shots = c[0] - base[i][0];
                const imps = c[1] - base[i][1];
                if (imps > shots) impactAhead += 1;
                if (shots > 0 && firstShot[i] < 0) firstShot[i] = now;
                if (imps > 0 && firstImpact[i] < 0) firstImpact[i] = now;
              });
              if (now < end) requestAnimationFrame(frame);
              else resolve();
            };
            requestAnimationFrame(frame);
          });
          scene.fx!.onTick = orig;
          scene.setSpeed(1);
          const fin = req();
          const requestedShots = fin.reduce((s, c, i) => s + c[0] - base[i][0], 0);
          return { shotsSeen, requestedShots, impactAhead, firstShot, firstImpact };
        },
        speed,
      );
      console.log(`speed ${speed}x: shots seen ${r.shotsSeen}, requested ${r.requestedShots}, first shot->impact ${r.firstImpact.map((v, i) => (v - r.firstShot[i]).toFixed(0))}`);
      expect(r.shotsSeen, 'some shots').toBeGreaterThan(0);
      expect(r.requestedShots, 'one shot request per shot').toBe(r.shotsSeen);
      expect(r.impactAhead, 'impacts requested ahead of their shots').toBe(0);
      // Cannon (index 0): impact at least TRAVEL/speed after the shot.
      const gap = r.firstImpact[0] - r.firstShot[0];
      expect(gap).toBeGreaterThanOrEqual(150 / speed - 40);
      await onScene(page, (scene) => {
        scene.state.enemies = [];
      }, null);
      await page.waitForTimeout(800);
    }
  });

  test('a priority-5 sound is never dropped at the voice cap, and nodes are released after many waves at 3x', async ({ page }) => {
    test.setTimeout(120_000);
    await toGame(page, touch);
    await onScene(page, (scene) => {
      scene.state.gold = 1e6;
      scene.state.lives = 1e6;
      const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
      let built = 0;
      for (let row = 1; row < 15 && built < 25; row += 2)
        for (let col = 1; col < 30 && built < 25; col += 2) if (scene.build({ col, row }, types[built % 6]).ok) built += 1;
      scene.setSpeed(3);
      scene.state.wave = 0;
    }, null);
    for (let w = 0; w < 10; w++) {
      await onScene(page, (scene) => {
        scene.startWave();
        scene.spawnHorde(40);
        scene.state.specialCharges = 1;
        scene.state.specialRechargeTicks = 0;
        scene.useSpecialAt('keg', 300, 240);
      }, null);
      await page.waitForTimeout(1200);
      const a = await audio(page);
      expect(a.voices).toBeLessThanOrEqual(16);
      expect(a.capped['special.keg'] ?? 0, 'a special is never capped').toBe(0);
      expect(a.capped['waveStart'] ?? 0, 'the horn is never capped').toBe(0);
      await onScene(page, (scene) => {
        scene.state.enemies = [];
        scene.state.spawnedPerGroup = scene.state.spawnedPerGroup.map(() => 1e6);
      }, null);
    }
    await onScene(page, (scene) => {
      scene.state.enemies = [];
      scene.setSpeed(1);
    }, null);
    await page.waitForFunction(() => window.__tarpit!.audio().voices === 0, undefined, { timeout: 10_000 });
    expect(Object.keys((await audio(page)).requested).length).toBeLessThan(40);
  });

  test('no HUD button overlaps another or is smaller than its minimum beside the mute button', async ({ page }) => {
    await toGame(page, touch);
    const { rects, portrait } = await page.evaluate(() => {
      const t = window.__tarpit!;
      return { rects: t.uiRects(), portrait: t.layout() === 'portrait' };
    });
    const names = Object.keys(rects).filter((k) => k.startsWith('bar:') || ['startWave', 'speed', 'special', 'mute', 'pause'].includes(k));
    expect(names.length).toBe(11);
    for (const n of names) {
      expect(rects[n].height, `${n} height`).toBeGreaterThanOrEqual(portrait ? 70 : 42);
      expect(rects[n].width, `${n} width`).toBeGreaterThanOrEqual(portrait ? 70 : 42);
    }
    expect(rects.startWave.width).toBeGreaterThanOrEqual(portrait ? 168 : 130);
    if (!portrait) for (const n of names.filter((k) => k.startsWith('bar:'))) expect(rects[n].width).toBeGreaterThanOrEqual(132);
    for (const a of names)
      for (const b of names)
        if (a < b) {
          const [p, q] = [rects[a], rects[b]];
          expect(p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height, `${a} overlaps ${b}`).toBe(false);
        }
  });
}

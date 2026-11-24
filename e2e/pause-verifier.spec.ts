import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { waitForTitle } from './title';

// Milestone 45 verifier: live play (no ?test=1) on real time. A run that is
// paused at several wave ticks, with every pause held for real seconds, must
// reach the same simulation state at the same wave tick as a run that never
// paused, and nothing drawn may move while paused. Both runs carry a
// Fire Arrows ground zone, Guards and a Barricade, and end on wave 10 (the
// boss wave) at 3x. The script's actions fire on wave ticks, so the two runs
// match tick for tick whatever the frame timing.

const END = 1400; // Wave ticks; about 8 s of real time at 3x.
const SPECIALS = { 60: 'fireArrows', 1300: 'guards' } as const;

async function play(page: Page, pauses: number[], waitMs: number) {
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  const click = async (key: string) => {
    await page.waitForFunction(k => !!window.__tarpit?.uiRects()[k], key);
    const point = await page.evaluate(k => {
      const rect = window.__tarpit!.uiRects()[k];
      return window.__tarpit!.canvasToPage(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }, key);
    await page.mouse.click(point.x, point.y);
  };
  await click('title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  return page.evaluate(async ({ pauses, waitMs, end, specials }) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const drawn = () => {
      const out: unknown[] = [];
      const walk = (list: Phaser.GameObjects.GameObject[]) => {
        for (const o of list as (Phaser.GameObjects.GameObject & Record<string, unknown>)[]) {
          out.push([o.type, o.x, o.y, o.alpha, o.rotation, o.visible, o.text]);
          if (Array.isArray(o.list)) walk(o.list as Phaser.GameObjects.GameObject[]);
        }
      };
      walk(scene.children.list);
      return JSON.stringify([out, JSON.stringify(t.fx()), JSON.stringify(t.decor()), JSON.stringify(scene.state.enemies.map(e => t.animState(e.id)))]);
    };
    const path = scene.state.map.path;
    const where = (i: number) => ({ x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 });
    scene.state.wave = 9;
    scene.state.lives = 1000;
    scene.state.gold = 20000;
    const kinds = ['musketeer', 'cannon', 'firepot', 'mortar', 'longbow', 'tarpit'] as const;
    let built = 0;
    for (let row = 1; row < 9 && built < 12; row++) {
      for (let col = 1; col < 14 && built < 12; col++) {
        if (scene.build({ col, row }, kinds[built % kinds.length]).ok) built++;
      }
    }
    scene.setSpeed(3);
    const moved: string[] = [];
    let finish!: (value: string) => void;
    const finished = new Promise<string>(resolve => { finish = resolve; });
    const remaining = [...pauses];
    const fired = new Set<number>();
    const original = scene.advance.bind(scene);
    scene.advance = (n: number) => {
      for (let i = 0; i < n; i++) {
        if (scene.paused) return;
        const at = scene.state.waveTick;
        const special = specials[at as keyof typeof specials];
        if (special && !fired.has(at)) {
          fired.add(at);
          const point = where(at === 60 ? 2 : 3);
          scene.useSpecialAt(special, point.x, point.y);
        }
        original(1, false);
        const now = scene.state.waveTick;
        const last = now >= end;
        if (!last && !remaining.includes(now)) continue;
        remaining.splice(remaining.indexOf(now), 1);
        scene.setPaused(true);
        void (async () => {
          await frames();
          const before = drawn();
          const tick = scene.state.tick;
          await sleep(waitMs);
          if (drawn() !== before || scene.state.tick !== tick) moved.push(`wave tick ${now}`);
          if (last) finish(JSON.stringify({ moved, state: scene.state, charges: scene.state.specialCharges }));
          else scene.setPaused(false);
        })();
        return;
      }
    };
    scene.startWave();
    return finished;
  }, { pauses, waitMs, end: END, specials: SPECIALS });
}

test('a run paused for seconds at several ticks matches one that never paused, and nothing moves while paused', async ({ page }) => {
  test.setTimeout(240_000); // About 40 s here; the CI runner is slower and the waits are real.
  const straight = JSON.parse(await play(page, [], 200));
  const paused = JSON.parse(await play(page, [61, 700, 1301], 2000));
  expect(straight.moved).toEqual([]);
  expect(paused.moved, 'something advanced or redrew while paused').toEqual([]);
  // state.tick also counts the setup ticks before Start Wave, which depend on
  // when the harness began; every wave-relative field must match.
  const strip = (state: Record<string, unknown>) => ({ ...state, tick: 0, lastSpecialTick: 0 });
  expect(strip(paused.state)).toEqual(strip(straight.state));
});

import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier (milestone 16): independent probes of the animation layer in test mode.

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

test('(a) wave 1 after 200 ticks: every goblin on frame 0, facing matches its last movement', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(199);
    const before = new Map(t.state().enemies.map((e) => [e.id, e.distance]));
    t.step(1);
    const out: { id: number; frame: number; facing: string; d0: number; d1: number; texture: string }[] = [];
    for (const e of t.state().enemies) {
      const a = t.animState(e.id);
      out.push({ id: e.id, frame: a?.frame ?? -1, facing: a?.facing ?? '', texture: a?.texture ?? '', d0: before.get(e.id) ?? 0, d1: e.distance });
    }
    return out;
  });
  expect(r.length).toBeGreaterThan(0);
  // Path (docs/DESIGN.md, map.ts): right to x 160, up, right: at distance d the heading is
  // right for d < 160, up for 160 <= d < 160 + 140, then right.
  const heading = (d0: number, d1: number) => (d0 < 160 && d1 <= 160 ? 'right' : d0 >= 160 && d1 < 300 ? 'up' : 'right');
  for (const g of r) {
    expect(g.texture).toBe('goblin');
    expect(g.frame).toBe(0);
    expect(g.d1).toBeGreaterThan(g.d0);
    expect(g.facing).toBe(heading(g.d0, g.d1));
  }
  expect(new Set(r.map((g) => g.facing)).size).toBeGreaterThan(1); // both a right and an up leg are exercised
});

test('(b) a wave 3 Wolf: flipX is false going right (the Hyena frames face right), true only when facing left', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().wave = 2;
    t.startWave();
    t.step(60 * 4 + 40); // first wolf spawns at 4 s
    const wolf = t.state().enemies.find((e) => e.type === 'wolf');
    return wolf ? t.animState(wolf.id) : null;
  });
  expect(r).toMatchObject({ texture: 'wolf', facing: 'right', flipX: false, frame: 0 });
});

test('(c) depth: an enemy lower on screen has a higher depth than one above it', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(60 * 10); // goblins spread over the first legs
    type GO = { type: string; list?: GO[]; x: number; y: number; depth: number; texture?: { key: string } };
    const scene = t.game.scene.getScene('game') as unknown as { children: { list: GO[] } };
    const sprites: { x: number; y: number; depth: number }[] = [];
    const walk = (list: GO[]) => {
      for (const o of list) {
        if (o.type === 'Layer' || o.list) walk(o.list ?? []);
        else if (o.type === 'Sprite' && ['goblin', 'wolf', 'troll'].includes(o.texture?.key ?? '')) sprites.push({ x: o.x, y: o.y, depth: o.depth });
      }
    };
    walk(scene.children.list ?? []);
    return sprites;
  });
  expect(r.length).toBeGreaterThan(2);
  const ys = new Set(r.map((s) => Math.round(s.y)));
  expect(ys.size).toBeGreaterThan(1);
  for (const a of r) for (const b of r) if (a.y > b.y) expect(a.depth).toBeGreaterThan(b.depth);
});

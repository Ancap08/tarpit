import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { COLORS } from '../src/game/palette';
import type { PaintedSheet } from '../src/game/skin/loading';
import { liftPage, touchHold, ui, worldPage } from './phone';
import { settle } from './painted';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { BARRICADE_AIM_REASONS, heldCountText } from '../src/game/names';
import { ENEMY_STATS } from '../src/sim/enemies';
import { startBarricadeWave, aimBarricade, castAt } from './barricade';
import { api, visibleTexts } from './campaign';

// One walker reaches the wall per tick. A Harpy flies past without joining the count.
async function stageCrowd(page: Page, phone: boolean, size: number, painted = false): Promise<void> {
  if (painted) await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
  await startBarricadeWave(page, 7, phone);
  await api(page, t => {
    if (!t.buildAt(15, 5, 'cannon').ok) throw new Error('Cannon fixture');
  });
  await aimBarricade(page, phone);
  if (painted) await placeOnPainted(page, phone);
  else await castAt(page, { x: 420, y: 164 }, phone);
  const types = ['shieldbearer', 'goblin', 'wolf', 'goblin', 'troll', 'shieldbearer', 'goblin'] as const;
  const walkers = Array.from({ length: size }, (_, i) => {
    const type = types[i % types.length];
    const { hp, speed } = ENEMY_STATS[type];
    return { type, hp: i % 3 === 0 ? Math.ceil(hp / 2) : hp, behind: (i + 0.5) * speed / 60 };
  });
  await page.evaluate(walkers => {
    const s = window.__tarpit!.state!();
    const wall = s.blocker!;
    s.spawnedPerGroup.fill(9999);
    s.towers[0].cooldownTicks = 120;
    s.enemies = walkers.map(({ type, hp, behind }) => ({
      id: s.nextEnemyId++, type, hp, distance: wall.distance - behind, slow: 0, slowTicksLeft: 0,
    }));
    s.enemies.push({ id: s.nextEnemyId++, type: 'harpy', hp: 36, distance: wall.distance - 1, slow: 0, slowTicksLeft: 0 });
  }, walkers);
}

async function expectHeldCrowd(page: Page, phone: boolean, n: number): Promise<void> {
  const { wall, positions } = await api(page, t => {
    const { blocker, enemies } = t.state();
    const held = enemies.filter(e => e.type !== 'harpy' && e.distance === blocker!.distance);
    return { wall: blocker!, positions: held.map(e => {
      const { x, y } = t.animState(e.id)!;
      return { x, y };
    }) };
  });
  const center = (phone ? PORTRAIT : LANDSCAPE).toScreen(wall);
  expect(positions).toHaveLength(n);
  for (const p of positions) {
    expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeLessThanOrEqual(36);
  }
  const pixels = positions.map(p => Math.round(p.x) + ',' + Math.round(p.y));
  expect(new Set(pixels).size).toBeGreaterThanOrEqual(Math.min(n, 6));
  const labels = (await visibleTexts(page)).filter(text => /^x\d+$/.test(text));
  expect(labels).toEqual(n > 3 ? [heldCountText(n)] : []);
}

export async function crowd(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 20);
  for (let n = 1; n <= 20; n++) {
    await api(page, t => t.step(1));
    await expectHeldCrowd(page, phone, n);
  }
  expect(await api(page, t => t.state().enemies.find(e => e.type === 'harpy')!.distance > t.state().blocker!.distance)).toBe(true);
  await stageBossCrowd(page, phone);
}

async function stageBossCrowd(page: Page, phone: boolean): Promise<void> {
  // At the cave clearance, include both bosses to check their lifted sprite centres.
  await api(page, t => {
    const s = t.state();
    s.specialCharges = 1;
    if (!t.useSpecialAt('barricade', 64, 240).ok) throw new Error('wall at the cave clearance');
    s.enemies = Array.from({ length: 40 }, (_, i) => ({
      id: s.nextEnemyId++, type: i === 0 ? 'grumblemaw' : i === 1 ? 'boss' : 'goblin',
      hp: 23, distance: s.blocker!.distance, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
  });
  await expectHeldCrowd(page, phone, 40);
}

export async function holdingFrame(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 15);
  await api(page, t => t.step(35));
  await expectHeldCrowd(page, phone, 15);
  const blocker = await api(page, t => t.state().blocker);
  expect(blocker!.hp).toBeLessThan(blocker!.maxHp);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveScreenshot(phone ? 'phone-barricade-holding.png' : 'barricade-holding.png');
  if (process.env.M39_FRAMES) {
    await canvas.screenshot({ path: process.env.M39_FRAMES + '/m39-barricade-' + (phone ? 'phone' : 'holding') + '.png' });
  }
}

async function placeOnPainted(page: Page, phone: boolean): Promise<void> {
  expect(await api(page, t => t.painted().active)).toBe(true);
  await castAt(page, { x: 32, y: 240 }, phone);
  expect(await visibleTexts(page)).toContain(BARRICADE_AIM_REASONS['near-spawn']);
  await api(page, t => t.step(120)); // Let the refusal label clear before the holding frame.
  const point = await worldPage(page, { x: 430, y: 164 });
  const preview = async () => {
    const aim = (await ui(page)).special.barricadeAim!;
    expect(aim.valid).toBe(true);
    await expect.poll(() => page.evaluate(({ x, y }) => {
      const ctx = window.__tarpit!.game.canvas.getContext('2d')!;
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return (r << 16) + (g << 8) + b;
    }, aim.point)).toBe(COLORS.cellOk);
  };
  if (phone) {
    point.y += await liftPage(page);
    const client = await page.context().newCDPSession(page);
    await touchHold(page, client, point, 400, preview);
    await client.detach();
  } else {
    await page.mouse.move(point.x, point.y);
    await preview();
    await page.mouse.click(point.x, point.y);
  }
}

// Check the actual miniature silhouettes, whose texture origins are at their feet.
async function expectPaintedCentres(page: Page, size: number): Promise<void> {
  const wall = (await ui(page)).special.blocker!;
  const { density, sprites } = await api(page, t => t.painted());
  const walkers = sprites.filter(s => s.visible && /^painted:(goblin|wolf|shieldbearer|troll|grumblefoot|grumblemaw):/.test(s.key));
  expect(walkers).toHaveLength(size);
  const sheets = new Map<string, PaintedSheet>();
  for (const sprite of walkers) {
    const [, name] = sprite.key.split(':');
    if (!sheets.has(name)) {
      sheets.set(name, JSON.parse(readFileSync(`assets/art-painted/${name}-${density}x.json`, 'utf8')));
    }
    const sheet = sheets.get(name)!;
    const [l, t, r, b] = sheet.bodyBounds![sprite.frame];
    const x = sprite.x + ((l + r) / 2 - sheet.anchor[0]) / density!;
    const y = sprite.y + ((t + b) / 2 - sheet.anchor[1]) / density!;
    expect(Math.hypot(x - wall.point.x, y - wall.point.y), name).toBeLessThanOrEqual(36);
  }
}

export async function paintedHolding(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 15, true);
  await api(page, t => t.step(35));
  await expectHeldCrowd(page, phone, 15);
  await expectPaintedCentres(page, 15);
  const wall = (await ui(page)).special.blocker!;
  expect(wall.hp).toBeLessThan(wall.maxHp);
  await settle(page);
  if (process.env.M38_FRAMES) {
    const name = phone ? 'm38-painted-barricade-phone.png' : 'm38-painted-barricade.png';
    await page.locator('canvas').screenshot({ path: process.env.M38_FRAMES + '/' + name });
  }
  await stageBossCrowd(page, phone);
  await expectPaintedCentres(page, 40);
}

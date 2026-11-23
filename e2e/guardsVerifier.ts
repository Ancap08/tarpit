// Helpers for the milestone 40 verifier specs: the drawn position of each
// guard is measured from its rendered silhouette in native canvas pixels.
import { expect, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { api, press } from './campaign';
import { castAt, startBarricadeWave } from './barricade';
import { settle } from './painted';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { rectPageSize, rects, ui } from './phone';

/** A standing squad frozen in time (lifetime pinned), no enemies. */
export async function standSquad(page: Page, at: { x: number; y: number }, touch: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startBarricadeWave(page, 7, touch);
  await api(page, (t) => { const s = t.state(); s.spawnedPerGroup.fill(9999); s.enemies = []; });
  await press(page, 'special', touch);
  await press(page, 'special:guards', touch);
  await castAt(page, at, touch);
  await api(page, (t) => t.state().blockers.forEach((b) => { if (b.kind === 'guard') (b as { ticksLeft: number }).ticksLeft = 1e9; }));
  await settle(page);
}

export async function measure(page: Page, portrait: boolean): Promise<void> {
  const guards = await api(page, (t) => t.state().blockers.filter((b) => b.kind === 'guard'));
  expect(guards).toHaveLength(4);
  const layout = portrait ? PORTRAIT : LANDSCAPE;
  let lastSide = 0;
  for (const guard of guards) {
    const target = layout.toScreen(guard);
    // Compare the same silhouette at its live position and at the simulation foot.
    // This cancels the off-centre spear, the contact shadow, and each bearing's
    // different shape. Read native canvas pixels before phone FIT scaling.
    const { actual, reference } = await page.evaluate(async ({ id, target }) => {
      type Display = Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
      const game = window.__tarpit!.game;
      const scene = game.scene.getScene('game');
      const fx = (scene as unknown as { guardFx: { bodies: Map<number, Display> } }).guardFx;
      const body = fx.bodies.get(id)!;
      const layer = body.displayList;
      const ctx = game.canvas.getContext('2d')!;
      const x = Math.round(target.x) - 64;
      const y = Math.round(target.y) - 64;
      const capture = (atSimulationFoot: boolean) => new Promise<ImageData>((resolve) => {
        game.events.once('prerender', () => {
          // Isolate one figure on a uniform background for both readings.
          const others = [...scene.children.list, ...layer.list]
            .filter(o => !Object.is(o, layer) && o !== body && 'visible' in o && o.visible) as Display[];
          for (const o of others) o.setVisible(false);
          const foot = { x: body.x, y: body.y };
          if (atSimulationFoot) body.setPosition(target.x, target.y);
          game.events.once('postrender', () => {
            const pixels = ctx.getImageData(x, y, 128, 128);
            body.setPosition(foot.x, foot.y);
            for (const o of others) o.setVisible(true);
            resolve(pixels);
          });
        });
      });
      function bounds(image: ImageData) {
        const { data, width, height } = image;
        let left = width, right = -1, top = height, bottom = -1;
        for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
          const i = (py * width + px) * 4;
          if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) < 50) continue;
          left = Math.min(left, px); right = Math.max(right, px);
          top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
        return { left, right, top, bottom };
      }
      return { actual: bounds(await capture(false)), reference: bounds(await capture(true)) };
    }, { id: guard.id, target });
    expect(actual.bottom - actual.top + 1, 'soldier height in native pixels').toBeGreaterThanOrEqual(28);
    expect(Math.abs(reference.bottom - 64), 'boots stand at the reference foot').toBeLessThanOrEqual(6);
    const dx = actual.left - reference.left, dy = actual.bottom - reference.bottom;
    const dir = layout.screenDir(Math.cos(guard.angle), Math.sin(guard.angle));
    const along = dx * dir.x + dy * dir.y;
    const across = dy * dir.x - dx * dir.y;
    expect(Math.abs(along), `guard ${guard.id} along trail`).toBeLessThanOrEqual(6);
    expect(Math.abs(across), `guard ${guard.id} across trail`).toBeLessThanOrEqual(10);
    expect(across * lastSide, 'successive guards stand on opposite sides').toBeLessThanOrEqual(0);
    expect(Math.sign(across)).not.toBe(0);
    lastSide = Math.sign(across);
  }
}


/** Five specials, each a full-size target, inside the map and clear of every other control. */
export async function popupFits(page: Page, touch: boolean, portrait: boolean): Promise<void> {
  await startBarricadeWave(page, 7, touch);
  await press(page, 'special', touch);
  const r = await rects(page);
  const keys = Object.keys(r).filter((k) => k.startsWith('special:'));
  expect(keys.sort()).toEqual(['special:barricade', 'special:fireArrows', 'special:guards', 'special:keg', 'special:tarBarrel']);
  const map = (portrait ? PORTRAIT : LANDSCAPE).map;
  for (const k of keys) {
    const size = await rectPageSize(page, k);
    expect(Math.min(size.width, size.height), k).toBeGreaterThanOrEqual(44);
    const b = r[k];
    expect(b.x).toBeGreaterThanOrEqual(map.x);
    expect(b.y).toBeGreaterThanOrEqual(map.y);
    expect(b.x + b.width).toBeLessThanOrEqual(map.x + map.width);
    expect(b.y + b.height).toBeLessThanOrEqual(map.y + map.height);
    for (const [other, o] of Object.entries(r)) {
      if (other === k || o.width === 0 || o.height === 0) continue;
      if (other.startsWith('special:')) continue;
      const overlap = b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height;
      expect(overlap, `${k} over ${other}`).toBe(false);
    }
  }
  expect((await ui(page)).special.aiming).toBeNull();
}

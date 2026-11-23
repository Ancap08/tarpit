// Helpers for the milestone 40 verifier specs: the drawn position of each
// guard is measured from pixels (hide the guard bodies, diff the page).
import { expect, test, type Page } from '@playwright/test';
import { api, press } from './campaign';
import { castAt, startBarricadeWave } from './barricade';
import { settle } from './painted';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { rectPageSize, rects, ui, worldPage } from './phone';

type Bbox = { minX: number; maxX: number; minY: number; maxY: number } | null;

/** Show only guard `id` (or none) and settle one frame. */
async function only(page: Page, id: number | null): Promise<Buffer> {
  await page.evaluate(async (id) => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { guardFx: { bodies: Map<number, { setVisible(v: boolean): void }> } };
    for (const [gid, body] of scene.guardFx.bodies) body.setVisible(gid === id);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, id);
  return page.screenshot({ scale: 'css' });
}

/** Bounding box of the pixels that differ between two page screenshots, decoded in the page. */
function diffBox(page: Page, a: Buffer, b: Buffer): Promise<Bbox> {
  return page.evaluate(async ([x, y]) => {
    const load = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      return g.getImageData(0, 0, bmp.width, bmp.height);
    };
    const A = await load(x);
    const B = await load(y);
    let box: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
    for (let py = 0; py < A.height; py++) for (let px = 0; px < A.width; px++) {
      const i = (py * A.width + px) * 4;
      if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 40) {
        box = box ? { minX: Math.min(box.minX, px), maxX: Math.max(box.maxX, px), minY: Math.min(box.minY, py), maxY: Math.max(box.maxY, py) } : { minX: px, maxX: px, minY: py, maxY: py };
      }
    }
    return box;
  }, [a.toString('base64'), b.toString('base64')] as const);
}

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
  const none = await only(page, null);
  for (const g of guards) {
    const box = await diffBox(page, none, await only(page, g.id));
    expect(box, `guard ${g.id} is visible`).not.toBeNull();
    const target = await worldPage(page, { x: g.x, y: g.y });
    const cx = (box!.minX + box!.maxX) / 2;
    test.info().annotations.push({ type: 'box', description: `guard ${g.id} box ${JSON.stringify(box)} target ${JSON.stringify(target)}` });
    // Feet at the simulation position: the figure stands on it, horizontally centred within 6 px.
    expect(Math.abs(cx - target.x), `guard ${g.id} x ${cx} vs ${target.x}`).toBeLessThanOrEqual(6 + (portrait ? 4 : 0));
    expect(box!.maxY, `guard ${g.id} feet`).toBeGreaterThanOrEqual(target.y - 6);
    expect(box!.maxY, `guard ${g.id} feet`).toBeLessThanOrEqual(target.y + 8);
    expect(box!.maxY - box!.minY, `guard ${g.id} height`).toBeGreaterThan(12);
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

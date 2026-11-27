import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { GameScene } from '../src/game/GameScene';
import { distanceOnRoad, isFlying, trailPointAt } from '../src/sim';
import { mapPress, press } from './campaign';

export async function openRentOverdue(page: Page, ui: string) {
  await page.goto(`/?test=1&owner=1&keep=21&ui=${ui}`);
  await page.waitForFunction(() => !!window.__tarpit?.keep?.());
}

async function measureField(page: Page) {
  return page.evaluate(() => {
    const api = window.__tarpit as TarpitTestApi;
    const scene = api.game.scene.getScene('game') as GameScene;
    const layout = scene.boardLayout;
    const camera = scene.cameras.main;
    const surround = scene['keep']!['surround'];
    const { width, height } = layout.map;
    const surface = (width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width);
      canvas.height = Math.ceil(height);
      return canvas.getContext('2d', { willReadFrequently: true })!;
    };
    const ground = surface(width, height);
    const castle = surface(width, height);
    const board = surface(width, height);
    const rendered = surface(layout.width, layout.height);
    rendered.drawImage(api.game.canvas, 0, 0, layout.width, layout.height);
    const align = (ctx: CanvasRenderingContext2D, art: HTMLCanvasElement) =>
      ctx.drawImage(art, parseFloat(art.style.left), parseFloat(art.style.top));
    const slab = surround['ground'];
    const keep = surround['castle'];
    align(ground, slab);
    for (const piece of keep) align(castle, piece);
    if (keep[0].compareDocumentPosition(slab) & Node.DOCUMENT_POSITION_FOLLOWING) {
      castle.globalCompositeOperation = 'destination-out';
      align(castle, slab);
    }
    const layers = [slab, ...keep, surround['road'], surround['gateBed']].filter(layer => !!layer)
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const layer of layers) align(board, layer);
    const linear = Array.from({ length: 256 }, (_, i) => i <= 10 ? i / 3294.6 : ((i / 255 + .055) / 1.055) ** 2.4);
    const luma = (data: Uint8ClampedArray, i: number) =>
      .2126 * linear[data[i]] + .7152 * linear[data[i + 1]] + .0722 * linear[data[i + 2]];
    const contrast = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const patch = (ctx: CanvasRenderingContext2D, x: number, y: number, size = 3) => {
      const pixels = ctx.getImageData(Math.round(x) - (size >> 1), Math.round(y) - (size >> 1), size, size).data;
      let light = 0;
      let solid = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        light += luma(pixels, i) * pixels[i + 3];
        solid += pixels[i + 3];
      }
      return { light: light / (solid || 1), alpha: solid / (255 * size ** 2) };
    };
    const fieldPixel = (x: number, y: number) => ({ x: x - camera.scrollX, y: (y - camera.scrollY) * camera.zoomY });
    const spots = scene.state.map.buildSites!.map(cell => {
      const { x, y } = layout.cellCenter(cell);
      const values = [-8, 8].flatMap(dx => [-4, 4].map(dy => {
        const ink = fieldPixel(x + dx, y + dy);
        const top = patch(rendered, ink.x, ink.y);
        const bottom = patch(board, x + dx - layout.map.x, y + dy - layout.map.y);
        const composite = top.light * top.alpha + bottom.light * (1 - top.alpha);
        return contrast(composite, bottom.light);
      }));
      return { cell, contrast: Math.min(...values) };
    });

    const stats = (ctx: CanvasRenderingContext2D) => {
      const data = ctx.getImageData(0, 0, width, height).data;
      let count = 0, mean = 0, square = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (!alpha) continue;
        const light = luma(data, i);
        mean += light * alpha;
        square += light ** 2 * alpha;
        count += alpha;
      }
      return { count, rms: Math.sqrt(Math.max(0, square / count - (mean / count) ** 2)) };
    };
    const architecture = stats(castle), terrain = stats(ground);
    const gate = scene['keep']!.outerGate!;
    function sourceOf(image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
      const f = image.frame;
      return { image: f.source.image as CanvasImageSource, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
    }
    const gateSource = sourceOf(gate);
    const door = surface(gateSource.w, gateSource.h);
    door.drawImage(gateSource.image, gateSource.x, gateSource.y, gateSource.w, gateSource.h, 0, 0, gateSource.w, gateSource.h);
    const strip = door.getImageData(Math.floor(gateSource.w / 2) - 3, 0, 6, gateSource.h).data;
    const woodRows: number[] = [];
    for (let i = 0; i < strip.length; i += 4) {
      const [r, g, b, a] = strip.subarray(i, i + 4);
      if (a >= 225 && r > g * 1.12 && r > b * 1.32) woodRows.push(Math.floor(i / 24));
    }
    const doorHeight = (Math.max(...woodRows) - Math.min(...woodRows) + 1) * gate.scaleY;

    if (!api.startWave().ok) throw new Error('Wave 1 did not start');
    api.step(1450);
    const { enemies, gate: sill } = scene.state;
    const held = enemies.filter(e => e.type !== 'harpy' && e.distance === sill!.distance);
    const views = scene['enemySprites']['views'];
    const road = enemies.filter(e => !held.includes(e)).map(enemy => {
      const sprite = views.get(enemy.id)!.sprite;
      const art = sourceOf(sprite);
      const pose = surface(art.w, art.h);
      pose.drawImage(art.image, art.x, art.y, art.w, art.h, 0, 0, art.w, art.h);
      const rgba = pose.getImageData(0, 0, art.w, art.h).data;
      let light = 0, alpha = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        light += luma(rgba, i) * rgba[i + 3];
        alpha += rgba[i + 3];
      }
      return { id: enemy.id, visible: sprite.visible,
        contrast: contrast(light / alpha, patch(board, sprite.x - layout.map.x, sprite.y - layout.map.y, 9).light) };
    });
    const visible = held.filter(e => views.get(e.id)?.sprite.visible);
    const centre = layout.toScreen(sill!);
    const drawn = visible.map(enemy => {
      const s = views.get(enemy.id)!.sprite;
      const art = sourceOf(s);
      const mask = surface(176, 176);
      const scale = s.scaleX, sy = s.scaleY, f = s.frame;
      mask.drawImage(art.image, art.x, art.y, art.w, art.h,
        88 + s.x - centre.x + (f.x - s.displayOriginX) * scale,
        110 + s.y - centre.y + (f.y - s.displayOriginY) * sy,
        art.w * scale, art.h * sy);
      const alpha = mask.getImageData(0, 0, 176, 176).data.filter((_, i) => i % 4 === 3).map(a => a >= 128 ? 1 : 0);
      return { alpha, area: alpha.reduce((a, b) => a + b, 0), offset: Math.hypot(s.x - centre.x, s.y - centre.y),
        height: scene['enemySprites'].paintedBar(enemy.id)!.height };
    });
    let worstOverlap = 0;
    for (const [i, a] of drawn.entries()) for (const b of drawn.slice(i + 1)) {
      let overlap = 0;
      for (let p = 0; p < a.alpha.length; p++) overlap += a.alpha[p] && b.alpha[p] ? 1 : 0;
      worstOverlap = Math.max(worstOverlap, overlap / Math.min(a.area, b.area));
    }
    const badge = (scene['rentHeldBadge'] as unknown as {
      number: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Container;
    } | undefined);
    return {
      spots, road, held: held.length, visible: visible.length, worstOverlap,
      count: badge?.badge.visible ? badge.number.text : null,
      offset: Math.max(...drawn.map(e => e.offset)),
      castleArea: architecture.count / terrain.count, castleContrast: architecture.rms, boardContrast: terrain.rms,
      gateRatio: doorHeight / Math.max(...drawn.map(e => e.height)),
    };
  });
}

export function rentOverdueSuite(width: number, height: number, touch: boolean) {
  for (const ui of ['new', 'old']) {
    test.describe(`Level 21 at ${width}×${height}, ${ui} interface`, () => {
      test.use({ viewport: { width, height } });
      test('the sockets, road enemies, held crowd, castle and gate are readable', async ({ page }) => {
        await openRentOverdue(page, ui);
        const m = await measureField(page);
        expect(m.spots).toHaveLength(10);
        expect.soft(Math.min(...m.spots.map(s => s.contrast)), 'Every vacant socket has 3:1 luminance contrast against its ground').toBeGreaterThanOrEqual(3);
        expect(m.road.length).toBeGreaterThan(0);
        expect.soft(m.road.every(e => e.visible), 'Every wave 1 enemy still on the road is drawn').toBe(true);
        expect.soft(Math.min(...m.road.map(e => e.contrast)), 'Every wave 1 road enemy has 2:1 luminance contrast against its road or ground').toBeGreaterThanOrEqual(2);
        expect(m.held).toBeGreaterThan(3);
        expect.soft(m.visible, 'At least two separate enemies represent a full wave 1 gate crowd').toBeGreaterThanOrEqual(2);
        expect.soft(m.worstOverlap, 'No two drawn held enemies overlap by more than one fifth of either silhouette').toBeLessThanOrEqual(.2);
        expect.soft(m.count, 'The icon displays the number of enemies actually held at the gate').toBe(String(m.held));
        expect.soft(m.offset, 'Every drawn held foot stays within 40 px of the simulation point').toBeLessThanOrEqual(40);
        expect.soft(m.castleArea, 'The visible castle occupies at most one quarter of the painted board').toBeLessThanOrEqual(.25);
        expect.soft(m.castleContrast, 'The castle has lower RMS luminance contrast than the board').toBeLessThan(m.boardContrast);
        expect.soft(m.gateRatio, 'The gate leaves are at least 1.5 times as tall as a held enemy').toBeGreaterThanOrEqual(1.5);
        console.log(JSON.stringify(m));
      });

      test('the inset ridge, road and sockets stay registered and the gate changes leaves at its sill', async ({ page }) => {
        await openRentOverdue(page, ui);
        const { map, gate } = await page.evaluate(() => {
          const state = window.__tarpit!.state!();
          return { map: state.map, gate: state.gate! };
        });
        const road = Array.from({ length: 16 }, (_, i) => trailPointAt(map, gate.distance - i * 6));
        const field = await page.evaluate(road => {
          const api = window.__tarpit as TarpitTestApi;
          const scene = api.game.scene.getScene('game') as GameScene;
          const layout = scene.boardLayout;
          const keep = scene['keep']!;
          const surround = keep['surround'];
          const ground = surround['ground'], castle = surround['castle'][0];
          const ctx = ground.getContext('2d')!;
          const gap = road.some(point => {
            const p = layout.toScreen(point);
            const x = Math.round(p.x - layout.map.x - parseFloat(ground.style.left));
            const y = Math.round(p.y - layout.map.y - parseFloat(ground.style.top));
            const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
            return a < 250 || r < 150 || r <= g || g <= b;
          });
          const sprite = keep.outerGate!;
          const sill = layout.toScreen(scene.state.gate!);
          const states = [1, .55, .25, 0, .82].map(health => {
            const gate = scene.state.gate!;
            gate.hp = gate.maxHp * health;
            gate.fallen = health === 0;
            api.step(0);
            return { frame: sprite.frame.name, offset: Math.hypot(sprite.x + layout.map.x - sill.x, sprite.y + layout.map.y - sill.y) };
          });
          const foregroundOccludesKeep = !!(castle.compareDocumentPosition(ground) & Node.DOCUMENT_POSITION_FOLLOWING);
          return { gap, foregroundOccludesKeep, states };
        }, road);
        expect(field.foregroundOccludesKeep, 'The foreground ridge paints over the base of the distant keep').toBe(true);
        expect(field.gap, 'The opaque paving reaches the gate sill along the unchanged inbound route').toBe(false);
        expect(field.states.map(s => s.frame)).toEqual(['0', '1', '2', '3', '0']);
        expect(field.states.map(s => s.offset)).toEqual([0, 0, 0, 0, 0]);

        const cell = map.buildSites![4];
        await press(page, 'bar:longbow', touch);
        await mapPress(page, cell.col, cell.row, touch);
        if (touch) {
          if (ui === 'new') await press(page, 'buildConfirm', true);
          else await mapPress(page, cell.col, cell.row, true);
        }
        const built = () => page.evaluate(cell => {
          const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
          const marker = scene['keep']?.layer.getByName(`rent-site:${cell.col}:${cell.row}`) as Phaser.GameObjects.Graphics | undefined;
          return { hasTower: scene.state.towers.some(t => t.cell.col === cell.col && t.cell.row === cell.row),
            marker: marker?.visible, portrait: scene.boardLayout.turned };
        }, cell);
        await expect.poll(built).toEqual({ hasTower: true, marker: false, portrait: touch });
        if (touch) {
          await page.setViewportSize({ width: 800, height: 390 });
          await expect.poll(built).toEqual({ hasTower: true, marker: false, portrait: false });
          await page.setViewportSize({ width, height });
          await expect.poll(built).toEqual({ hasTower: true, marker: false, portrait: true });
        }
      });

      test('a Powder Keg aimed at any visible held enemy hits the same held enemies as the true sill', async ({ page }) => {
        async function aim(target: number) {
          await openRentOverdue(page, ui);
          const enemies = await page.evaluate(() => {
            const api = window.__tarpit as TarpitTestApi;
            api.startWave();
            api.step(1450);
            return api.state().enemies;
          });
          const state = await page.evaluate(() => ({ gate: window.__tarpit!.state!().gate!, map: window.__tarpit!.state!().map }));
          const held = enemies.filter(e => !isFlying(e) && e.distance === distanceOnRoad(state.map, e.road, state.gate));
          const visible = await page.evaluate(ids => {
            const api = window.__tarpit as TarpitTestApi;
            const scene = api.game.scene.getScene('game') as GameScene;
            const sprites = scene['enemySprites'];
            return ids.flatMap(id => {
              const v = sprites['views'].get(id)!;
              if (!v.sprite.visible) return [];
              const { x, y, height } = sprites.paintedBar(id)!;
              const foot = scene.boardLayout.toWorld(v.sprite);
              const body = scene.boardLayout.toWorld({ x, y: y + height * .5 });
              return [api.worldToPage(foot.x, foot.y), api.worldToPage(body.x, body.y)];
            });
          }, held.map(e => e.id));
          const point = target < 0
            ? await page.evaluate(({ x, y }) => window.__tarpit!.worldToPage(x, y), state.gate)
            : visible[target];
          await press(page, 'special', touch);
          await press(page, 'special:keg', touch);
          if (touch) await page.touchscreen.tap(point.x, point.y);
          else await page.mouse.click(point.x, point.y);
          const survivors = await page.evaluate(() => window.__tarpit!.state!().enemies.map(e => e.id));
          return { targets: held.filter(e => !survivors.includes(e.id)).map(e => e.id), held: held.length, aims: visible.length };
        }
        const trueSill = await aim(-1);
        expect(trueSill.targets).toHaveLength(trueSill.held);
        expect(trueSill.aims).toBeGreaterThanOrEqual(4);
        for (let slot = 0; slot < trueSill.aims; slot++) {
          expect((await aim(slot)).targets, `Held kills at visible aim point ${slot}`).toEqual(trueSill.targets);
        }
      });
    });
  }
}

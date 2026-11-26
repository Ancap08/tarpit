import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Browser, Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { PaintedSkin } from '../../src/game/skin/painted.ts';
import { phone } from './m47Browser.ts';

type Point = { x: number; y: number };
type Fixture = { a: Point; b: Point; crowd: Point; gate: Point | null; towers: number; enemies: number };

const python = fileURLToPath(new URL('./m56-options.py', import.meta.url));
const runPython = promisify(execFile);

export async function captureOptions(browser: Browser, scratch: string,
  enter: (page: Page, level: number, query: string) => Promise<void>, fixture: (page: Page) => Promise<Fixture>,
) {
  for (const [name, level] of [['mid-wave', 11], ['old-keep-night', 24]] as const) {
    const dir = join(scratch, name);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ ...phone, viewport: { width: 390, height: 656 } });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(String(error)));
      await enter(page, level, 'test=1&look=painted&ui=new');
      const positions = await fixture(page);
      const frozen = await page.evaluateHandle(() => {
        const api = window.__tarpit!;
        const { game } = api;
        const scene = game.scene.getScene('game') as unknown as { painted: PaintedSkin };
        const state = api.state!();
        if (state.level?.id === 24 && state.level.keepSky !== 'night storm') throw new Error('Expected the night scene');
        game.loop.stop();
        const render = () => {
          const renderer = game.renderer;
          renderer.preRender();
          game.events.emit('prerender', renderer, 0, 0);
          game.scene.render(renderer);
          renderer.postRender();
          game.events.emit('postrender', renderer, 0, 0);
        };
        render();

        // Select the live battlefield layers. HUD portraits, bars, scenery and
        // effects remain the exact same objects through all three renders.
        const { standing, air, shadows } = scene.painted;
        const actors = /^(musketeer|cannon|tar-pit|longbow|mortar|fire-pot|goblin|wolf|shieldbearer|harpy|harpy-shadow|troll|grumblefoot|grumblemaw|guard)-(?:([234])x)$/;
        const frames = new Map<Phaser.Textures.Frame, number>();
        const poses: { id: number; kind: string; density: number; x: number; y: number; image: string }[] = [];
        const sprites = [standing, air, shadows].flatMap(layer => layer.list).flatMap(object => {
          const sprite = object as Phaser.GameObjects.Image;
          if (!sprite.visible || !sprite.texture?.key.startsWith('painted:sharp:')) return [];
          const match = actors.exec(sprite.texture.key.slice('painted:sharp:'.length));
          if (!match) return [];
          const [, kind, density] = match;
          const frame = sprite.frame;
          if (!frames.has(frame)) {
            const id = frames.size;
            const canvas = document.createElement('canvas');
            canvas.width = frame.cutWidth;
            canvas.height = frame.cutHeight;
            canvas.getContext('2d')!.drawImage(frame.source.image as HTMLCanvasElement, frame.cutX, frame.cutY,
              frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
            frames.set(frame, id);
            poses.push({ id, kind, density: Number(density), x: sprite.displayOriginX - frame.x,
              y: sprite.displayOriginY - frame.y, image: canvas.toDataURL().split(',')[1] });
          }
          return [{ sprite, frame, id: frames.get(frame)! }];
        });
        return { render, poses, sprites, state: JSON.stringify(state), towers: state.towers.map(t => ({
          kind: t.type, ...api.cellToPage(t.cell.col, t.cell.row),
        })) };
      });
      const { poses, towers, state, spriteCount } = await frozen.evaluate(({ poses, towers, state, sprites }) =>
        ({ poses, towers, state, spriteCount: sprites.length }));
      assert.ok(spriteCount >= positions.towers + positions.enemies, `${name} is missing world pieces`);
      const shot = (label: string) => page.screenshot({ scale: 'device', path: join(dir, `${label}.png`) });
      const original = await shot('a-soft');
      const data = poses.map(({ id, kind, density, x, y }) => ({ id, kind, density, x, y }));
      await Promise.all(poses.map(({ id, image }) => writeFile(join(dir, `${id}.png`), Buffer.from(image, 'base64'))));
      await writeFile(join(dir, 'poses.json'), JSON.stringify(data));
      await writeFile(join(dir, 'positions.json'), JSON.stringify({ ...positions, towers }));
      const { stdout } = await runPython('python3', [python, 'finish', dir]);
      const pad = Number(stdout.trim());
      assert.ok(pad > 0);
      for (const label of ['b-inked', 'c-lifted']) {
        const images = await Promise.all(poses.map(async ({ id }) =>
          (await readFile(join(dir, `${label}-${id}.png`))).toString('base64')));
        await frozen.evaluate(async ({ sprites, render }, { label, images, pad }) => {
          const game = window.__tarpit!.game;
          const textures = await Promise.all(images.map(async (bytes, id) => {
            const image = new Image();
            image.src = 'data:image/png;base64,' + bytes;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d')!.drawImage(image, 0, 0);
            const texture = game.textures.create(`${label}-${id}`, canvas)!;
            // Phaser's LINEAR filter value. The original sharp frames use it.
            texture.setFilter(0);
            return texture;
          }));
          const added = new Map<number, Phaser.Textures.Frame>();
          for (const { sprite, frame, id } of sprites) {
            const width = frame.cutWidth + 2 * pad;
            const height = frame.cutHeight + 2 * pad;
            if (!added.has(id)) added.set(id, textures[id].add(0, 0, 0, 0, width, height)!
              .setTrim(frame.realWidth, frame.realHeight, frame.x - pad, frame.y - pad, width, height));
            sprite.setFrame(added.get(id)!);
          }
          render();
        }, { label, images, pad });
        assert.ok(!original.equals(await shot(label)), `${name} ${label} is identical to A`);
      }
      await frozen.evaluate(({ sprites, render }) => {
        for (const { sprite, frame } of sprites) sprite.setFrame(frame);
        render();
      });
      assert.ok(original.equals(await page.screenshot({ scale: 'device' })), `${name} did not round-trip pixel for pixel`);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__tarpit!.state!())), state);
      assert.deepEqual(errors, []);
      console.log(`${name}: ${positions.towers} towers, ${positions.enemies} enemies, ${spriteCount} world pieces, ${poses.length} finished poses. Soft frame restored byte for byte.`);
    } finally {
      await context.close();
    }
  }
}

import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Rect } from '../src/sim';
import { SIEGE_TEXT } from '../src/game/names';
import { mapPress, press } from './campaign';
import { onScreen } from './campaignScreens';
import { waitForTitle } from './title';

const viewports = [
  { width: 960, height: 580 }, { width: 1024, height: 768 },
  { width: 390, height: 656 }, { width: 390, height: 844 },
];

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

for (const viewport of viewports) {
  const phone = viewport.width === 390;
  const touch = viewport.width !== 960;
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: phone ? 3 : 1, isMobile: touch, hasTouch: touch });

    for (const keep of [false, true]) {
      test(`reward, pause and result cover the field on ${keep ? 'Old Keep' : 'Meadow'}`, async ({ page }) => {
        await page.goto('/?test=1&ui=new' + (keep ? '&keep=21' : ''));
        if (!keep) {
          await waitForTitle(page);
          await press(page, 'title:play', touch);
        }
        await onScreen(page, 'game');
        const boxes = await page.evaluate(() => {
          const t = window.__tarpit!;
          const scene = t.game.scene.getScene('game') as GameScene;
          const { map, width, height } = scene.boardLayout;
          t.state!().pendingBoon = { wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] };
          t.step!(0);
          const reward = scene['reward']['view'].getByName('reward-veil') as Phaser.GameObjects.Rectangle;
          const { mute, pause } = t.uiRects();
          return { width, height, map, reward: reward.getBounds(), mute, pause,
            icon: { x: scene['hud']['pauseIcon'].x, y: scene['hud']['pauseIcon'].y } };
        });
        const top = (keep && phone ? 202 : boxes.map.y) - 4;
        expect(boxes.reward).toMatchObject({
          x: 0, width: boxes.width, y: top, height: boxes.map.y + boxes.map.height - top,
        });
        expect(boxes.pause.x).toBe(boxes.mute.x + boxes.mute.width);
        expect(boxes.pause.y).toBe(boxes.mute.y);
        expect(boxes.icon.x).toBe(boxes.pause.x + boxes.pause.width / 2);
        expect(boxes.icon.y).toBeGreaterThan(boxes.pause.y);
        expect(boxes.icon.y).toBeLessThan(boxes.pause.y + boxes.pause.height);
        await press(page, 'pause', touch);
        expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
        const pause = await page.evaluate(() => {
          const veil = window.__tarpit!.game.scene.getScene('game').children.getByName('pause-veil') as Phaser.GameObjects.Graphics;
          return veil.commandBuffer.slice(3);
        });
        // The shade has one fill rectangle across the full canvas.
        expect(pause).toEqual([3, 0, 0, boxes.width, boxes.height]);
        const muted = await page.evaluate(() => window.__tarpit!.audio().muted);
        await press(page, 'mute', touch);
        expect(await page.evaluate(() => window.__tarpit!.audio().muted)).toBe(!muted);
        await press(page, 'pause:resume', touch);
        await page.evaluate(() => {
          const t = window.__tarpit!;
          Object.assign(t.state!(), { pendingBoon: null, phase: 'lost', lives: 0 });
          t.step!(0);
        });
        await onScreen(page, 'result');
        const result = await page.evaluate(() => {
          const veil = window.__tarpit!.game.scene.getScene('game').children.getByName('result-veil') as Phaser.GameObjects.Rectangle;
          return { visible: veil.visible, bounds: veil.getBounds() };
        });
        expect(result).toMatchObject({ visible: true, bounds: { x: 0, y: 0, width: boxes.width, height: boxes.height } });
      });
    }

    test('boss entrance darkens the full field on Meadow and Old Keep', async ({ page }) => {
      for (const keep of [false, true]) {
        await page.goto('/?ui=new&renderer=canvas' + (keep ? '&keep=25' : ''));
        if (!keep) {
          await waitForTitle(page);
          await press(page, 'title:play', touch);
        }
        await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.uiRects().startWave);
        const sample = await page.evaluate(() => {
          const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
          const fx = scene['fx']!;
          // Trigger the entrance at the current live clock time without waiting for the boss wave.
          fx['bossEntrance'](false);
          fx['darkenAt'] = fx['realMs'] - 120;
          fx['applyShake']();
          fx['drawOverlays']();
          const { map, width } = scene.boardLayout;
          const veil = fx.screenVeil;
          return { map, width, rect: veil.commandBuffer.slice(-4), visible: veil.visible };
        });
        const top = (keep && phone ? 202 : sample.map.y) - 4;
        expect(sample.visible).toBe(true);
        expect(sample.rect).toEqual([0, top, sample.width, sample.map.y + sample.map.height - top]);
      }
    });

    test('Royal Survey signs stay readable and clear of controls', async ({ page }) => {
      await page.goto('/?test=1&ui=new&keep=23');
      await onScreen(page, 'game');
      const samples = await page.evaluate(text => {
        const t = window.__tarpit!;
        const scene = t.game.scene.getScene('game') as GameScene;
        const signs = scene.children.list
          .filter((o): o is Phaser.GameObjects.Text => o.type === 'Text' && (o as Phaser.GameObjects.Text).text === text);
        const sample = () => ({
          labels: signs.map(label => ({ bounds: label.getBounds(),
            cssSize: parseFloat(String(label.style.fontSize)) * label.scaleY / t.game.scale.displayScale.y })),
          locks: scene['siegeControls']!['surveyMarks'].map(({ x, y }) => ({ x: x - 18, y: y - 16, width: 36, height: 32 })),
          controls: Object.entries(t.uiRects()).filter(([key]) => !key.startsWith('wallSite')),
        });
        const result = [sample()];
        const camera = scene['siegeView'];
        if (camera) {
          // Unfreeze only the camera to check the real projection while ticks stay frozen.
          Object.defineProperty(camera, 'frozen', { value: false });
          t.startWave!();
          for (const dt of [750, 750]) {
            scene['clock'].nowMs += dt;
            scene.redraw();
            result.push(sample());
          }
        }
        return result;
      }, SIEGE_TEXT.condemned);
      for (const { labels, locks, controls } of samples) {
        expect(labels).toHaveLength(2);
        for (const label of labels) {
          expect(label.cssSize).toBeGreaterThanOrEqual(11);
          for (const [key, rect] of controls) expect(overlaps(label.bounds, rect), key).toBe(false);
          for (const lock of locks) expect(overlaps(label.bounds, lock), 'sign covers a lock').toBe(false);
        }
      }
    });

    for (const id of [21, 22, 23, 24, 25]) {
      test(`level ${id}: tower drawers clear siege controls at every wall site`, async ({ page }) => {
        await page.goto(`/?test=1&ui=new&keep=${id}`);
        await onScreen(page, 'game');
        const first = await page.evaluate(() => {
          const t = window.__tarpit!;
          t.state!().gold = 10_000;
          const site = t.state!().map.buildSites!.find(c => t.buildAt!(c.col, c.row, 'musketeer').ok)!;
          return site;
        });
        await mapPress(page, first.col, first.row, touch);
        expect(await page.evaluate(() => window.__tarpit!.ui!().panelOpen)).toBe(true);
        const { samples, sites } = await page.evaluate(() => {
          const t = window.__tarpit!;
          const scene = t.game.scene.getScene('game') as GameScene;
          const state = scene.state;
          const gate = state.gate!;
          const tax = state.wallSiteTax;
          const { buildSites } = state.map;
          const samples = [];
          state.towers.length = 0;
          for (const site of buildSites!) {
            const { col, row } = site;
            const reserved = tax?.kind === 'royalSurvey' ? tax.sites : tax ? [tax.site] : [];
            const closed = reserved.some(c => c.col === col && c.row === row);
            if (closed) {
              const blocked = t.buildAt!(col, row, 'musketeer');
              samples.push({ site, blocked: !blocked.ok });
              // Quartering is buildable once paid. Survey sites remain closed.
              if (tax?.kind === 'royalSurvey') continue;
              state.wallSiteTax = undefined;
            }
            gate.hp = Math.floor(gate.maxHp / 2);
            state.gold = 10_000;
            if (!t.buildAt!(col, row, 'musketeer').ok) throw new Error(`Could not build at ${col},${row}`);
            scene['panel'].open(site, state);
            const sample = (mode: string) => {
              t.step!(0);
              const rects = t.uiRects();
              const watch = Object.entries(rects).filter(([key]) =>
                ['gate', 'repair'].includes(key) || key.startsWith('window:') ||
                key === 'wallSite' && state.wallSiteTax?.kind === 'quartering');
              const stand = scene.children.getByName('gate-last-stand') as Phaser.GameObjects.Text;
              return { site, mode, panel: scene['panel'].rect!, watch,
                windows: state.windows?.length ?? 0, quartering: state.wallSiteTax?.kind === 'quartering', lastStand: stand.visible };
            };
            samples.push(sample('build'));
            if (!t.upgradeAt!(col, row).ok) throw new Error('Could not upgrade the tower');
            state.gold = 0; // Disabled paths have a second line and make a taller drawer.
            samples.push(sample('paths'));
            state.phase = 'wave';
            state.wave = 1;
            Object.assign(gate, { hp: 0, fallen: true, lastStandTicksLeft: 180 });
            samples.push(sample('last stand'));
            Object.assign(gate, { fallen: false, lastStandTicksLeft: 0 });
            state.phase = 'setup';
            state.wave = 0;
            state.towers.length = 0;
            state.wallSiteTax = tax;
          }
          return { samples, sites: buildSites!.length };
        });
        expect(new Set(samples.map(({ site }) => `${site.col},${site.row}`)).size).toBe(sites);
        for (const sample of samples) {
          const name = `${sample.site.col},${sample.site.row}`;
          if ('blocked' in sample) {
            expect(sample.blocked, name).toBe(true);
            continue;
          }
          const { panel, mode, watch, windows, quartering, lastStand } = sample;
          expect(watch.map(([key]) => key), name).toEqual(expect.arrayContaining([
            'gate', ...(mode === 'last stand' ? [] : ['repair']),
            ...Array.from({ length: windows }, (_, i) => `window:${i}`), ...(quartering ? ['wallSite'] : []),
          ]));
          expect(lastStand, name).toBe(mode === 'last stand');
          for (const [key, control] of watch) expect(overlaps(panel, control), `${name} ${mode} covers ${key}`).toBe(false);
        }
      });
    }
  });
}

import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { BAR_TYPES } from '../src/game/ui/buildBarModel';
import { MAP_HEIGHT, EARLY_CALL_MAX_BONUS, TICKS_PER_SECOND, TOWER_DEFS } from '../src/sim';
import { rectPageSize } from './phone';
import { TOWER_NAMES, callEarlyLabel } from '../src/game/names';
import { api, postSpawn } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { waitForFirstScreen } from './title';

export async function checkLabel(page: Page, key: string, text: string) {
  const label = await page.evaluate(({ key, text }) => {
    const t = window.__tarpit!;
    const rect = t.uiRects()[key];
    const scene = t.game.scene.getScene('game');
    for (const child of scene.children.list) {
      const label = child as Phaser.GameObjects.Text;
      if (child.type !== 'Text' || !label.visible || label.text !== text) continue;
      const b = label.getBounds();
      if (b.centerX < rect.x || b.centerX > rect.x + rect.width || b.centerY < rect.y || b.centerY > rect.y + rect.height) continue;
      const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
      return {
        css: parseFloat(String(label.style.fontSize)) * scale * Math.min(label.scaleX, label.scaleY),
        lines: label.getWrappedText().length,
        padding: Math.min(b.left - rect.x, rect.x + rect.width - b.right, b.top - rect.y, rect.y + rect.height - b.bottom),
      };
    }
  }, { key, text });
  expect(label, key + ' ' + text).toBeDefined();
  const description = page.viewportSize()!.height + 'px ' + key + ' ' + text;
  test.info().annotations.push({ type: 'font', description: description + ' ' + label!.css.toFixed(2) });
  const shortPhoneLabel = page.viewportSize()!.height === 664 && (key === 'special' || key === 'startWave');
  expect.soft(label!.css, description).toBeGreaterThanOrEqual(shortPhoneLabel ? 11 : 12);
  if (key === 'startWave') expect.soft(label!.lines, description).toBeLessThanOrEqual(2);
  expect.soft(label!.padding, description).toBeGreaterThanOrEqual(0);
}

export function hudButtonSuite() {
  for (const look of ['painted', 'classic', 'showpiece'] as const) {
    test.describe(look, () => hudButtonCases(look));
  }
}

function hudButtonCases(look: 'painted' | 'classic' | 'showpiece') {
  async function startMeadow(page: Page) {
    await page.goto('/?test=1&look=' + look);
    await waitForFirstScreen(page);
    await api(page, t => t.startGame('normal', 'meadow'));
    expect(await api(page, t => t.painted().active)).toBe(look !== 'classic');
    expect(await api(page, t => !!t.showpiece?.())).toBe(look === 'showpiece');
  }

  for (const height of [844, 664]) {
    for (const mode of ['normal', 'fixed Caslon', 'fixed fallback']) {
      test(`phone HUD fits the game frame at 390x${height} (${mode})`, async ({ page }) => {
        if (mode !== 'normal') await useTallFontMetrics(page, mode === 'fixed fallback');
        await page.setViewportSize({ width: 390, height });
        await startMeadow(page);
        const { canvas, panels, controls, mapLeft, mapRight, pageWidth, pageHeight } = await page.evaluate(mapHeight => {
          const t = window.__tarpit!;
          const scene = t.game.scene.getScene('game') as GameScene;
          // These are the rectangles passed to the panel painter and the live input controls.
          const pageRect = (r: { x: number; y: number; width: number; height: number }) => {
            const a = t.canvasToPage(r.x, r.y);
            const b = t.canvasToPage(r.x + r.width, r.y + r.height);
            return { left: a.x, top: a.y, right: b.x, bottom: b.y };
          };
          return {
            canvas: t.game.canvas.getBoundingClientRect().toJSON() as DOMRect,
            panels: scene['hud']['m'].bands.map(pageRect),
            mapLeft: t.worldToPage(0, mapHeight).x, mapRight: t.worldToPage(0, 0).x,
            controls: Object.entries(t.uiRects()).map(([name, r]) => ({ name, ...pageRect(r) })),
            pageWidth: window.innerWidth, pageHeight: window.innerHeight,
          };
        }, MAP_HEIGHT);
        type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
        const contains = (outer: Box, inner: Box) =>
          outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
        expect.soft(Math.abs((canvas.left + canvas.right - pageWidth) / 2), 'canvas horizontal centre').toBeLessThanOrEqual(1);
        expect.soft(Math.abs((canvas.top + canvas.bottom - pageHeight) / 2), 'canvas vertical centre').toBeLessThanOrEqual(1);
        const towers = controls.filter(r => r.name.startsWith('bar:')).sort((a, b) => a.left - b.left);
        const bottom = controls.filter(r => ['special', 'startWave', 'speed', 'mute', 'pause'].includes(r.name))
          .sort((a, b) => a.left - b.left);
        expect(towers).toHaveLength(6);
        expect(bottom).toHaveLength(5);
        expect.soft(Math.abs(bottom[0].left - towers[0].left), 'left row edges').toBeLessThanOrEqual(1);
        expect.soft(Math.abs(bottom[4].right - towers[5].right), 'right row edges').toBeLessThanOrEqual(1);
        for (const r of [...towers, ...bottom]) {
          const minimum = height === 844 || r.name === 'pause' ? 44 : 38.9;
          expect.soft(Math.min(r.right - r.left, r.bottom - r.top), r.name + ' tap size').toBeGreaterThanOrEqual(minimum);
        }
        const gaps = bottom.slice(1).map((r, i) => r.left - bottom[i].right);
        expect.soft(Math.max(...gaps) - Math.min(...gaps), 'even gaps').toBeLessThanOrEqual(1);
        const panel = panels.find(p => contains(p, towers[0]))!;
        expect.soft(Math.abs(panel.left - mapLeft), 'panel and map left edges').toBeLessThanOrEqual(1);
        expect.soft(Math.abs(panel.right - mapRight), 'panel and map right edges').toBeLessThanOrEqual(1);
        expect.soft(Math.abs((panel.left + panel.right - pageWidth) / 2), 'game frame centre').toBeLessThanOrEqual(1);
        for (const [i, r] of controls.entries()) {
          expect.soft(contains(canvas, r), r.name + ' inside canvas').toBe(true);
          expect.soft(contains(r.name === 'gold' ? panels[0] : panel, r), r.name + ' inside HUD panel').toBe(true);
          for (const other of controls.slice(i + 1)) {
            const overlap = r.left < other.right && other.left < r.right && r.top < other.bottom && other.top < r.bottom;
            expect.soft(overlap, r.name + ' overlaps ' + other.name).toBe(false);
          }
        }
      });
    }
  }
  for (const mode of ['Caslon', 'fallback', 'tall Caslon', 'tall fallback']) {
    test('HUD button labels fit with ' + mode, async ({ page }, info) => {
      if (mode.startsWith('tall')) await useTallFontMetrics(page, mode === 'tall fallback');
      else if (mode === 'fallback') await page.route('**/*.woff2', route => route.abort());
      const sizes = info.project.name === 'phone' ? [{ width: 390, height: 844 }, { width: 390, height: 664 }] : [page.viewportSize()!];
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        await startMeadow(page);
        expect(await page.evaluate(() => [...document.fonts].some(face => face.status === 'loaded'))).toBe(!mode.endsWith('fallback'));
        const phone = info.project.name === 'phone';
        if (phone) {
          const pause = await rectPageSize(page, 'pause');
          const mute = await rectPageSize(page, 'mute');
          expect(pause.width).toBeCloseTo(mute.width, 5);
          expect(pause.height).toBeCloseTo(mute.height, 5);
          expect(pause.width).toBeCloseTo(pause.height, 0);
          expect(Math.min(pause.width, pause.height)).toBeGreaterThanOrEqual(44);
        } else {
          await checkLabel(page, 'pause', 'Pause');
          for (const compact of [false, true]) {
            await page.evaluate(compact => {
              const t = window.__tarpit!;
              t.state!().boons = compact ? ['longBarrels'] : [];
              t.step!(0);
            }, compact);
            for (const type of BAR_TYPES) {
              await checkLabel(page, 'bar:' + type, TOWER_NAMES[type]);
              await checkLabel(page, 'bar:' + type, String(TOWER_DEFS[type].cost));
            }
          }
        }
        await test.step('Show the HUD names used in tips, hints and cards', async () => {
          await checkLabel(page, 'startWave', 'Start Wave');
          await checkLabel(page, 'special', 'Special');
        });
        for (const speed of [1, 2, 3] as const) {
          await page.evaluate(speed => window.__tarpit!.setSpeed!(speed), speed);
          await checkLabel(page, 'speed', speed + 'x');
        }
        await postSpawn(page, 1);
        await checkLabel(page, 'startWave', callEarlyLabel(EARLY_CALL_MAX_BONUS, phone));
        await checkLabel(page, 'special', 'Special');
        await api(page, t => t.useSpecialAt('keg', 200, 240));
        await checkLabel(page, 'special', phone ? '20s' : 'Wait 20s');
        // Keep the wave running and draw each bonus and countdown through the real HUD.
        for (let elapsed = 1; elapsed <= EARLY_CALL_MAX_BONUS; elapsed++) {
          await page.evaluate(ticks => {
            const t = window.__tarpit!;
            const s = t.state!();
            s.waveTick += ticks;
            s.specialRechargeTicks -= ticks;
            t.step!(0);
          }, TICKS_PER_SECOND);
          await checkLabel(page, 'startWave', callEarlyLabel(EARLY_CALL_MAX_BONUS - elapsed, phone));
          if (elapsed < 20) await checkLabel(page, 'special', (phone ? '' : 'Wait ') + (20 - elapsed) + 's');
        }
        for (const [wave, reason] of [[4, 'Reward wave'], [19, 'Boss wave next'], [20, 'Last wave']] as const) {
          await postSpawn(page, wave);
          await checkLabel(page, 'startWave', phone ? reason : 'Call next\n' + reason);
        }
        await postSpawn(page, 5);
        await api(page, t => {
          t.state().spawnedPerGroup.fill(9999);
          t.state().enemies = [];
          t.step(1);
        });
        await checkLabel(page, 'startWave', phone ? 'Pick a reward' : 'Start Wave\nPick a reward');
      }
    });
  }
}

import { expect, test, type Page } from '@playwright/test';
import { BAR_TYPES } from '../src/game/ui/buildBarModel';
import { EARLY_CALL_MAX_BONUS, TICKS_PER_SECOND, TOWER_DEFS } from '../src/sim';
import { rectPageSize } from './phone';
import { TOWER_NAMES, callEarlyLabel } from '../src/game/names';
import { api, postSpawn } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { waitForFirstScreen } from './title';

async function checkLabel(page: Page, key: string, text: string) {
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
        padding: Math.min(b.left - rect.x, rect.x + rect.width - b.right, b.top - rect.y, rect.y + rect.height - b.bottom),
      };
    }
  }, { key, text });
  expect(label, key + ' ' + text).toBeDefined();
  const description = page.viewportSize()!.height + 'px ' + key + ' ' + text;
  test.info().annotations.push({ type: 'font', description: description + ' ' + label!.css.toFixed(2) });
  expect.soft(label!.css, description).toBeGreaterThanOrEqual(12);
  expect.soft(label!.padding, description).toBeGreaterThanOrEqual(0);
}

export function hudButtonLabelSuite() {
  for (const mode of ['Caslon', 'fallback', 'tall Caslon', 'tall fallback']) {
    test('HUD button labels fit at 12 CSS px with ' + mode, async ({ page }, info) => {
      if (mode.startsWith('tall')) await useTallFontMetrics(page, mode === 'tall fallback');
      else if (mode === 'fallback') await page.route('**/*.woff2', route => route.abort());
      const sizes = info.project.name === 'phone' ? [{ width: 390, height: 844 }, { width: 390, height: 664 }] : [page.viewportSize()!];
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        await page.goto('/?test=1&look=painted');
        await waitForFirstScreen(page);
        expect(await page.evaluate(() => [...document.fonts].some(face => face.status === 'loaded'))).toBe(!mode.endsWith('fallback'));
        await api(page, t => t.startGame());
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
        await checkLabel(page, 'startWave', 'Start Wave');
        for (const speed of [1, 2, 3] as const) {
          await page.evaluate(speed => window.__tarpit!.setSpeed!(speed), speed);
          await checkLabel(page, 'speed', speed + 'x');
        }
        await postSpawn(page, 1);
        await checkLabel(page, 'startWave', callEarlyLabel(EARLY_CALL_MAX_BONUS));
        await checkLabel(page, 'special', 'Special');
        await api(page, t => t.useSpecialAt('keg', 200, 240));
        await checkLabel(page, 'special', 'Wait 20s');
        // Keep the wave running and draw each bonus and countdown through the real HUD.
        for (let elapsed = 1; elapsed <= EARLY_CALL_MAX_BONUS; elapsed++) {
          await page.evaluate(ticks => {
            const t = window.__tarpit!;
            const s = t.state!();
            s.waveTick += ticks;
            s.specialRechargeTicks -= ticks;
            t.step!(0);
          }, TICKS_PER_SECOND);
          await checkLabel(page, 'startWave', callEarlyLabel(EARLY_CALL_MAX_BONUS - elapsed));
          if (elapsed < 20) await checkLabel(page, 'special', 'Wait ' + (20 - elapsed) + 's');
        }
        for (const [wave, reason] of [[4, 'Reward wave'], [19, 'Boss wave next'], [20, 'Last wave']] as const) {
          await postSpawn(page, wave);
          await checkLabel(page, 'startWave', 'Call next\n' + reason);
        }
        await postSpawn(page, 5);
        await api(page, t => {
          t.state().spawnedPerGroup.fill(9999);
          t.state().enemies = [];
          t.step(1);
        });
        await checkLabel(page, 'startWave', 'Start Wave\nPick a reward');
      }
    });
  }
}

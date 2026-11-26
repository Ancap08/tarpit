// Capture the unchanged game and the empty Riverbend plates for the M54 mock-ups.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { waitForFirstScreen } from '../../e2e/title.ts';
import { landscape, origin, phone, press, run } from './m47Browser.ts';

const directory = process.argv[2];
assert.ok(directory, 'Supply a scratch directory.');
assert.equal(process.env.PW_PORT, '4573', 'Use the milestone preview port.');

async function capture(browser: Browser, scratch: string, base: string) {
  for (const [name, browserOptions] of [['phone', phone], ['wide', landscape]] as const) {
    const context = await browser.newContext(browserOptions);
    try {
      const page = await context.newPage();
      await page.goto(base + '/?test=1&look=painted');
      await waitForFirstScreen(page);
      await page.evaluate(() => window.__tarpit!.setCampaignProgress!(
        Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 2]))));
      await press(page, 'title:campaign', name === 'phone');
      await press(page, 'title:stop:11', name === 'phone');
      await press(page, 'title:play', name === 'phone');
      await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game');
      const board = await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        if (state.level?.id !== 11 || !api.painted!().active) throw new Error('Expected Painted Level 11');
        const a = api.worldToPage(0, api.layout() === 'portrait' ? 480 : 0);
        const b = api.worldToPage(960, api.layout() === 'portrait' ? 0 : 480);
        return { x: Math.ceil(a.x), y: Math.ceil(a.y),
          width: Math.floor(b.x) - Math.ceil(a.x), height: Math.floor(b.y) - Math.ceil(a.y) };
      });
      await page.screenshot({ path: join(scratch, `board-${name}.png`), clip: board, scale: 'css' });

      const fixture = await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        state.gold = 1000;
        const towers = [
          { col: 7, row: 10, type: 'musketeer' },
          { col: 11, row: 7, type: 'cannon' },
          { col: 14, row: 1, type: 'longbow' },
          { col: 22, row: 8, type: 'firepot' },
          { col: 25, row: 10, type: 'mortar' },
        ] as const;
        for (const { col, row, type } of towers) {
          if (!api.buildAt!(col, row, type).ok) throw new Error(`Could not build ${type}`);
        }
        if (!api.upgradeAt!(7, 10).ok) throw new Error('Could not upgrade Musketeer');
        state.gold = 186;
        state.lives = 17;
        state.wave = 2;
        if (!api.startWave!().ok) throw new Error('Could not start wave 3');
        state.waveTick = 3950;
        state.spawnedPerGroup = [16, 74];
        state.nextEnemyId = 0;
        const crowd = [110, 148, 212, 250, 285, 331, 364, 405, 454, 502, 547,
          622, 661, 695, 731, 804, 856, 929, 981, 1025, 1071, 1163, 1234, 1378]
          .map((distance, index) => {
            const harpy = [3, 8, 13, 18, 22].includes(index);
            const hpRatio = [1, 1, .66, 1, 1, .31, 1, .78, 1, 1, .48, 1][index % 12];
            const id = state.nextEnemyId++;
            const type = harpy ? 'harpy' : 'shieldbearer';
            const maxHp = Math.round((harpy ? 36 : 70) * state.level!.hpScale);
            state.enemies.push({ id, type, maxHp, hp: maxHp * hpRatio,
              slow: 0, slowTicksLeft: 0, distance });
            return { distance, type, hpRatio };
          });
        api.step!(0);
        return { towers, crowd, hud: api.hudText!() };
      });
      await page.screenshot({ path: join(scratch, `current-${name}.png`), scale: 'css' });
      await writeFile(join(scratch, 'fixture.json'), JSON.stringify(fixture, null, 2));
    } finally {
      await context.close();
    }
  }
}

if (process.argv.includes('--reuse-preview')) {
  const browser = await chromium.launch();
  try {
    await capture(browser, directory, 'http://localhost:4573');
  } finally {
    await browser.close();
  }
} else {
  await run(browser => capture(browser, directory, origin));
}

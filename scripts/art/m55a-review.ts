// PW_PORT=4573 node --experimental-strip-types scripts/art/m55a-review.ts <scratch> [stills|recordings|cost|inter]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import type { Browser, Page } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene.ts';
import { INTER } from '../../src/game/palette.ts';
import { waitForFirstScreen } from '../../e2e/title.ts';
import { landscape, origin, phone, press, run, start } from './m47Browser.ts';

const scratch = process.argv[2];
assert.ok(scratch && process.env.PW_PORT === '4573');
const destination = 'docs/review/m55a';
await mkdir(destination, { recursive: true });
const modes = {
  phone,
  short: { ...phone, viewport: { width: 390, height: 664 } },
  desktop: landscape,
  tablet: { ...landscape, viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
};

function ffmpeg(args: string[]): void {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'ffmpeg must finish successfully');
}

async function capture(page: Page, name: string) {
  await page.evaluate(() => new Promise<void>(resolve => window.__tarpit!.game.events.once('postrender', resolve)));
  const size = page.viewportSize()!;
  const path = join(destination, name + '.png');
  if (size.width === 390) {
    const native = join(scratch, name + '-dpr3.png');
    await page.screenshot({ path: native, scale: 'device' });
    ffmpeg(['-i', native, '-vf', `scale=${size.width}:${size.height}:flags=lanczos`, '-frames:v', '1', path]);
  } else await page.screenshot({ path, scale: 'css' });
}

async function card(page: Page, id: number, touch: boolean, live = false) {
  await page.goto(origin + '/?ui=new&look=painted' + (live ? '' : '&test=1'));
  await waitForFirstScreen(page);
  await page.evaluate(({ id, live }) => {
    const progress = Object.fromEntries(Array.from({ length: id }, (_, n) => [n + 1, 2 as const]));
    if (live) {
      localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 1, stars: progress }));
      const title = window.__tarpit!.game.scene.getScene('title') as { tipsEnabled?: boolean };
      title.tipsEnabled = false;
    } else window.__tarpit!.setCampaignProgress!(progress);
  }, { id, live });
  await press(page, 'title:campaign', touch);
  await press(page, `title:stop:${id}`, touch);
  await page.waitForFunction(() => {
    const t = window.__tarpit!;
    if (!t.titleReady() || !t.uiRects()['title:back']) return false;
    return !!t.uiRects()['title:cardPage'] || t.game.scene.getScene('title').children.list.some(o =>
      o.type === 'Image' && (o as Phaser.GameObjects.Image).texture.key.startsWith('clean-card-map:'));
  });
}

async function play(page: Page, touch: boolean) {
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game'));
}

async function tapCell(page: Page, col: number, row: number, touch: boolean) {
  const p = await page.evaluate(([col, row]) => window.__tarpit!.cellToPage(col, row), [col, row]);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function mockBattle(page: Page) {
  await page.evaluate(() => {
    const api = window.__tarpit!, s = api.state!();
    s.gold = 1000;
    for (const [col, row, kind] of [[7, 10, 'musketeer'], [11, 7, 'cannon'], [14, 1, 'longbow'],
      [22, 8, 'firepot'], [25, 10, 'mortar']] as const) {
      if (!api.buildAt!(col, row, kind).ok) throw new Error('Fixture could not build ' + kind);
    }
    if (!api.upgradeAt!(7, 10).ok) throw new Error('Fixture could not upgrade Musketeer');
    s.gold = 186; s.lives = 17; s.wave = 2;
    if (!api.startWave!().ok) throw new Error('Fixture could not start wave 3');
    s.waveTick = 3950; s.spawnedPerGroup = [16, 74]; s.nextEnemyId = 0;
    const crowd = [110, 148, 212, 250, 285, 331, 364, 405, 454, 502, 547,
      622, 661, 695, 731, 804, 856, 929, 981, 1025, 1071, 1163, 1234, 1378];
    s.enemies = crowd.map((distance, i) => {
      const type = [3, 8, 13, 18, 22].includes(i) ? 'harpy' : 'shieldbearer';
      const maxHp = Math.round((type === 'harpy' ? 36 : 70) * s.level!.hpScale);
      const hp = maxHp * [1, 1, .66, 1, 1, .31, 1, .78, 1, 1, .48, 1][i % 12];
      return { id: s.nextEnemyId++, type, maxHp, hp, distance, slow: 0, slowTicksLeft: 0 };
    });
    api.step!(0);
  });
}

async function result(page: Page, win: boolean) {
  await page.evaluate(win => {
    const api = window.__tarpit!, s = api.state!();
    s.phase = win ? 'won' : 'lost';
    s.wave = s.level!.waves.length;
    s.lives = win ? 17 : 0;
    api.step!(0);
  }, win);
  await page.waitForFunction(() => window.__tarpit!.game.scene.getScene('game').children.list.some(o =>
    o.name.startsWith('town-picture:') && (o as Phaser.GameObjects.Image).texture.key.startsWith('town-portrait-')));
}

async function stills(browser: Browser, interRefresh = false) {
  for (const device of ['phone', 'desktop', 'tablet'] as const) {
    if (interRefresh && device === 'tablet') continue;
    const page = await browser.newPage(modes[device]);
    const touch = device !== 'desktop';
    try {
      await card(page, 11, touch);
      await capture(page, `card-${device}`);
      await play(page, touch);
      await mockBattle(page);
      await capture(page, `battle-${device}`);
      if (device === 'desktop' && !interRefresh) await capture(page, 'riverbend-road-desktop');
      if (device === 'phone') {
        await tapCell(page, 7, 10, touch);
        await capture(page, 'upgrade-phone');
        await result(page, true);
        await capture(page, 'result-win-phone');
        if (interRefresh) continue;
        await page.reload();
        await waitForFirstScreen(page);
        await page.evaluate(() => window.__tarpit!.startLevel!(11));
        await result(page, false);
        await capture(page, 'result-loss-phone');
      }
    } finally { await page.close(); }
  }

  if (!interRefresh) await additionalStills(browser);
  for (const [mock, actual] of [
    ['a-clean-01-mid-wave', 'battle-phone'], ['a-clean-01-mid-wave-wide', 'battle-desktop'],
    ['a-clean-02-upgrade', 'upgrade-phone'], ['b-fine-print-03-level-card', 'card-phone'],
    ['b-fine-print-04-result', 'result-win-phone'],
  ]) {
    ffmpeg(['-i', `docs/review/m54/${mock}.png`, '-i', join(destination, actual + '.png'), '-filter_complex',
      '[0:v][1:v]hstack', '-frames:v', '1', join(destination, 'compare-' + actual + '.png')]);
  }
}

async function additionalStills(browser: Browser) {
  for (const look of ['classic', 'painted', 'showpiece']) {
    const page = await browser.newPage(modes.phone);
    try {
      await start(page, `ui=new&test=1&look=${look}`);
      await page.evaluate(() => {
        const t = window.__tarpit!, s = t.state!();
        s.gold = 500;
        t.buildAt!(4, 5, 'musketeer'); t.buildAt!(7, 9, 'cannon'); t.buildAt!(11, 5, 'longbow');
        t.spawnHorde!(22, 360);
        if (t.showpiece?.()) s.wave = 19;
        t.step!(100);
      });
      assert.equal(await page.evaluate(() => !!window.__tarpit!.showpiece?.()), look === 'showpiece');
      await capture(page, `meadow-${look}`);
    } finally { await page.close(); }
  }

  const short = await browser.newPage(modes.short);
  try {
    await card(short, 20, true);
    await capture(short, 'card-short');
    await press(short, 'title:cardPage', true);
    await short.waitForFunction(() => window.__tarpit!.game.scene.getScene('title').children.list.some(o =>
      o.type === 'Image' && (o as Phaser.GameObjects.Image).texture.key.startsWith('clean-card-map:')));
    await capture(short, 'card-short-map-notes');
    await play(short, true);
    await short.evaluate(() => {
      const t = window.__tarpit!, state = t.state!();
      let longest = { wave: 0, length: 0 };
      for (let wave = 1; wave < state.level!.waves.length; wave++) {
        state.wave = wave;
        t.step!(0);
        const length = t.hudText!().next.length;
        if (length > longest.length) longest = { wave, length };
      }
      state.wave = longest.wave - 1;
      t.startWave!();
      t.step!(230);
    });
    await capture(short, 'two-taxes-short');
  } finally { await short.close(); }

  const phonePage = await browser.newPage(modes.phone);
  try {
    await card(phonePage, 1, true);
    await play(phonePage, true);
    await phonePage.evaluate(() => {
      const t = window.__tarpit!;
      t.state!().gold = 45;
      t.step!(0);
    });
    await capture(phonePage, 'locked-and-unaffordable');
    await start(phonePage, 'test=1&ui=new&look=painted');
    await phonePage.evaluate(() => {
      const t = window.__tarpit!, s = t.state!();
      s.wave = 4; t.startWave!(); s.spawnedPerGroup.fill(99999); t.step!(1);
    });
    await capture(phonePage, 'free-play-boon-picker');
    const offered = await phonePage.evaluate(() => window.__tarpit!.state!().pendingBoon!.options[0]);
    await press(phonePage, 'reward:' + offered, true);
    await phonePage.evaluate(() => {
      const t = window.__tarpit!, s = t.state!();
      if (s.pendingBoon) throw new Error('Reward tap did not dismiss the offer');
      s.wave = 9;
      if (!t.startWave!().ok) throw new Error('Fixture could not start wave 10');
      // The Assessor is the last spawn at tick 3900. Keep his exit much later.
      s.spawnedPerGroup = [20, 15, 12, 8, 0];
      s.waveTick = 3900;
      t.step!(1);
      s.enemies[0].distance = 380;
      s.enemies[0].hp = 3400;
      t.step!(0);
    });
    assert.ok(await phonePage.evaluate(() => window.__tarpit!.bossOnField!()));
    await capture(phonePage, 'free-play-boss-held-boon');
  } finally { await phonePage.close(); }

}

async function fontComparison(browser: Browser) {
  const frames = [];
  for (const loaded of [false, true]) {
    const page = await browser.newPage({ ...phone, serviceWorkers: 'block' });
    try {
      if (!loaded) await page.route('**/Inter-Latin-Variable-*.woff2', route => route.abort());
      await card(page, 11, true);
      await play(page, true);
      await mockBattle(page);
      const detail = await page.evaluate(async font => {
        const t = window.__tarpit!;
        await new Promise<void>(resolve => t.game.events.once('postrender', resolve));
        const scene = t.game.scene.getScene('game') as GameScene;
        const [head] = scene['hud']['m'].bands;
        const build = t.uiRects()['bar:musketeer'];
        const stats = scene.children.getByName('hud-stat:0') as Phaser.GameObjects.Text;
        const crop = ({ y, height }: { y: number; height: number }) => {
          const dpr = devicePixelRatio;
          const top = Math.max(0, Math.floor((t.canvasToPage(0, y).y - 3) * dpr));
          const bottom = Math.ceil((t.canvasToPage(0, y + height).y + 3) * dpr);
          return { top, height: bottom - top };
        };
        return { usingInter: stats.style.fontFamily.includes(font), status: crop(head), build: crop(build) };
      }, INTER);
      assert.equal(detail.usingInter, loaded);
      const png = await page.screenshot({ scale: 'device' });
      frames.push({ ...detail, data: png.toString('base64'), label: loaded ? 'Inter' : 'Device sans' });
    } finally { await page.close(); }
  }

  const page = await browser.newPage();
  try {
    const png = await page.evaluate(async frames => {
      const padding = 24, header = 52, width = 390, height = 844, nativeWidth = 3 * width;
      const canvas = document.createElement('canvas');
      canvas.width = width + nativeWidth + 3 * padding;
      canvas.height = 2 * (height + header + padding) + padding;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#111b1c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [i, frame] of frames.entries()) {
        const image = new Image();
        image.src = 'data:image/png;base64,' + frame.data;
        await image.decode();
        const rowTop = padding + i * (height + header + padding);
        const imageTop = rowTop + header, detailX = width + 2 * padding;
        ctx.font = '600 30px system-ui';
        ctx.fillStyle = '#effcf8';
        ctx.fillText(frame.label, padding, rowTop + 32);
        ctx.drawImage(image, padding, imageTop, width, height);
        let top = imageTop + Math.floor((height - frame.status.height - frame.build.height - 100) / 2);
        for (const [label, crop] of [['Status block · 3×', frame.status], ['Build bar · 3×', frame.build]] as const) {
          ctx.font = '500 24px system-ui';
          ctx.fillStyle = '#b9d4ce';
          ctx.fillText(label, detailX, top + 28);
          ctx.drawImage(image, 0, crop.top, nativeWidth, crop.height, detailX, top + 40, nativeWidth, crop.height);
          top += crop.height + 60;
        }
      }
      return canvas.toDataURL().split(',')[1];
    }, frames);
    await writeFile(join(destination, 'compare-font-phone.png'), Buffer.from(png, 'base64'));
  } finally {
    await page.close();
  }
}

async function record(browser: Browser, name: string, action: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ ...phone, recordVideo: { dir: scratch, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  const video = page.video()!;
  try { await action(page); } finally { await context.close(); }
  ffmpeg(['-i', await video.path(), '-t', '12.5', '-an', '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', join(destination, name + '.mp4')]);
}

async function holdPress(page: Page, name: string): Promise<void> {
  const point = await page.evaluate(key => {
    const api = window.__tarpit!, r = api.uiRects()[key];
    return api.canvasToPage(r.x + r.width / 2, r.y + r.height / 2);
  }, name);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await delay(130);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

async function recordings(browser: Browser) {
  await record(browser, 'build-and-upgrade', async page => {
    await start(page, 'ui=new&look=painted');
    await delay(450);
    await press(page, 'bar:musketeer', true);
    await tapCell(page, 7, 5, true);
    await delay(380);
    await holdPress(page, 'buildConfirm');
    await delay(400);
    await tapCell(page, 7, 5, true);
    await holdPress(page, 'panel:upgrade');
    await delay(350);
    await press(page, 'panel:close', true);
    await press(page, 'startWave', true);
    await delay(4850);
    await tapCell(page, 7, 5, true);
    await delay(4600);
  });
  await record(browser, 'card-to-win', async page => {
    await card(page, 11, true, true);
    await delay(2100);
    await play(page, true);
    await page.evaluate(() => {
      const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
      s.state.gold = 500; s.state.lives = 17; s.state.wave = s.state.level!.waves.length - 1;
      s.build({ col: 7, row: 10 }, 'musketeer');
    });
    await delay(850);
    await press(page, 'startWave', true);
    await page.evaluate(() => {
      const s = (window.__tarpit!.game.scene.getScene('game') as GameScene).state;
      s.spawnedPerGroup.fill(99999);
      s.enemies = [{ id: s.nextEnemyId++, type: 'goblin', maxHp: 18, hp: 1, distance: 150, slow: 0, slowTicksLeft: 0 }];
    });
    await page.waitForFunction(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.phase === 'won');
    await delay(7100);
  });
}

async function cost(browser: Browser) {
  // Performance.TaskDuration is cumulative main-thread task time. Divide the
  // elapsed task budget by the number of frames the real game rendered.
  const raw: { look: string; switched: boolean; frames: number; enemies: number; ticks: number; mainMsPerFrame: number }[] = [];
  for (const look of ['classic', 'painted']) {
    for (const switched of [false, true, true, false, false, true]) {
      const page = await browser.newPage(phone);
      try {
        await start(page, `perf=1&look=${look}${switched ? '&ui=new' : ''}`);
        await page.evaluate(() => {
          const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
          scene.state.gold = 186;
          scene.state.lives = 20;
          scene.spawnHorde(40, 330);
          scene.state.spawnedPerGroup.fill(99999);
          for (const e of scene.state.enemies) { e.maxHp = 200; e.hp = 160; }
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Performance.enable');
        await delay(900);
        const metric = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration')!.value;
        const before = await metric();
        const sample = await page.evaluate(() => new Promise<{ frames: number; enemies: number; ticks: number }>(resolve => {
          const { game } = window.__tarpit!;
          const scene = game.scene.getScene('game') as GameScene;
          const tick = scene.state.tick;
          let frames = 0;
          const frame = () => { frames++; };
          game.events.on('postrender', frame);
          setTimeout(() => {
            game.events.off('postrender', frame);
            resolve({ frames, enemies: scene.state.enemies.length, ticks: scene.state.tick - tick });
          }, 3000);
        }));
        const elapsed = await metric() - before;
        assert.equal(sample.enemies, 40);
        assert.ok(sample.frames > 30);
        raw.push({ look, switched, ...sample, mainMsPerFrame: elapsed * 1000 / sample.frames });
      } finally { await page.close(); }
    }
  }
  const median = (look: string, switched: boolean) => raw.filter(r => r.look === look && r.switched === switched)
    .map(r => r.mainMsPerFrame).sort((a, b) => a - b)[1];
  const medians = ['classic', 'painted'].map(look => {
    const off = median(look, false), on = median(look, true);
    return { look, off, on, changePercent: (on / off - 1) * 100 };
  });
  await writeFile(join(destination, 'frame-cost.json'), JSON.stringify({
    cpuThrottle: 4, viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor, medians, raw,
  }, null, 2) + '\n');
}

await run(async browser => {
  if (process.argv[3] === 'cost') await cost(browser);
  else if (process.argv[3] === 'recordings') await recordings(browser);
  else if (process.argv[3] === 'inter') {
    await stills(browser, true);
    await fontComparison(browser);
    await recordings(browser);
  }
  else {
    await stills(browser);
    if (process.argv[3] !== 'stills') await recordings(browser);
  }
});

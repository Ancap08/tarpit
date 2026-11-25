import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { CAMPAIGN_TEXT, ENEMY_SHORT_NAMES, GATE_TEXT, LEVEL_STORY, STORY_TEXT, cardFeatText, siegeRuleLines, levelTips } from '../src/game/names';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import type { CampaignProgress, EnemyType, Rect, Stars } from '../src/sim';
import { api, mapPress, press } from './campaign';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { checkSpacing, onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

const through = (level: number): CampaignProgress => Object.fromEntries(Array.from({ length: level }, (_, i) => [i + 1, i % 4 as Stars]));
const words = (page: Page) => api(page, t => t.campaignLabels().map(line => line.text));

async function shot(page: Page, name: string) {
  if (!process.env.M52C1_REVIEW) return;
  const { width, height } = page.viewportSize()!;
  await page.screenshot({ path: `docs/review/m52c1/${width}x${height}-${name}.jpg`, type: 'jpeg', quality: 91, scale: 'css' });
}

async function finish(page: Page, kind: 'earned' | 'missed' | 'lost') {
  await page.evaluate(kind => {
    const t = window.__tarpit!;
    const s = t.state!();
    s.wave = s.level!.waves.length;
    s.lives = kind === 'lost' ? 0 : 15;
    s.phase = kind === 'lost' ? 'lost' : 'won';
    if (s.gate && kind === 'missed') {
      if (s.level!.feat!.kind === 'noRepairs') s.boughtRepair = true;
      else { s.gate.hp = 0; s.gate.fallen = true; }
    }
    t.step!(0);
  }, kind);
  await onScreen(page, 'result');
}

async function open(page: Page, touch: boolean, progress: number, showTips = false) {
  await page.goto('/?test=1&act3=1');
  await waitForFirstScreen(page, { showTips, showStory: true });
  await page.evaluate(stars => {
    localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
    window.__tarpit!.setCampaignProgress!(stars);
  }, through(progress));
  await press(page, 'title:campaign', touch);
}

async function play(page: Page, touch: boolean) {
  await press(page, 'title:play', touch);
  await onScreen(page, 'game');
}

const hasOverlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const contained = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

async function checkPrint(page: Page) {
  await checkSpacing(page);
  const print = await page.evaluate(() => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene(t.scene!());
    const fit = t.game.canvas.getBoundingClientRect().width / t.game.canvas.width;
    const result = t.campaignResult!();
    const lines = result && [result.title, result.story, result.actClose, ...result.details, ...result.buttons];
    return scene.children.list.flatMap(object => {
      if (object.type !== 'Text') return [];
      const label = object as Phaser.GameObjects.Text;
      if (!label.visible || !label.text || (lines && !lines.includes(label.text))) return [];
      return [{ text: label.text, size: parseFloat(String(label.style.fontSize)) * fit * Math.min(label.scaleX, label.scaleY) }];
    });
  });
  for (const label of print) expect(label.size, label.text + ' CSS size').toBeGreaterThanOrEqual(11);
}

async function inspectField(page: Page) {
  const { boxes, labels, sites, size, fit, next } = await page.evaluate(() => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const { width, height } = t.game.canvas;
    const rects = t.uiRects();
    const boxes = Object.entries(rects).filter(([key]) =>
      key === 'gate' || key === 'repair' || /^(road:|window:|wallSite)/.test(key));
    const labels = scene.children.list.flatMap(object => {
      if (object.type !== 'Text') return [];
      const label = object as Phaser.GameObjects.Text;
      if (!label.visible || !label.text) return [];
      const r = label.getBounds();
      const owner = boxes.find(([, box]) =>
        box.x <= label.x && label.x < box.x + box.width && box.y <= label.y && label.y < box.y + box.height)?.[0];
      return owner || /^(gate-|road:)/.test(label.name) ? [{
        owner, name: label.name, text: label.text, font: parseFloat(String(label.style.fontSize)) * Math.min(label.scaleX, label.scaleY), x: r.x, y: r.y, width: r.width, height: r.height,
      }] : [];
    });
    const sites = scene.state.map.buildSites!.map(cell => {
      const point = scene.displayedMapPoint(scene.boardLayout.cellCenter(cell));
      return { x: point.x - 10, y: point.y - 10, width: 20, height: 20 };
    });
    return { boxes, labels, sites, size: { x: 0, y: 0, width, height },
      fit: t.game.canvas.getBoundingClientRect().width / width,
      next: (scene.children.getByName('wave-preview') as Phaser.GameObjects.Text).text };
  });
  expect(boxes.some(([key]) => key === 'gate')).toBe(true);
  for (const [i, [key, box]] of boxes.entries()) {
    expect(contained(box, size), `${key} outside ${size.width}x${size.height}`).toBe(true);
    for (const [other, rect] of boxes.slice(i + 1)) {
      expect(hasOverlap(box, rect), `${key} overlaps ${other}`).toBe(false);
    }
    if (key.startsWith('road:')) {
      for (const site of sites) expect(hasOverlap(box, site), `${key} covers tower spot at ${site.x},${site.y}`).toBe(false);
    }
  }
  for (const [i, label] of labels.entries()) {
    const box = boxes.find(([key]) => key === label.owner)?.[1];
    expect(box && contained(label, box), `${label.text} fits ${label.owner ?? label.name}`).toBeTruthy();
    expect(label.font * fit, `${label.text} CSS size`).toBeGreaterThanOrEqual(9);
    for (const other of labels.slice(i + 1)) {
      expect(hasOverlap(label, other), `${label.text} overlaps ${other.text}`).toBe(false);
    }
  }
  const roads = boxes.filter(([key]) => key.startsWith('road:'));
  if (roads.length) expect(next, 'Road signs replace Next during setup').toBe('');
  return { roads, labels: labels.map(label => label.text) };
}

export function actThreeFit(viewports: { width: number; height: number }[], touch: boolean) {
  for (const viewport of viewports) {
    for (const fonts of ['normal', 'tall fallback', 'tall Caslon', 'wide'] as const) {
      test(`Act Three screens fit ${viewport.width}x${viewport.height}, ${fonts}`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize(viewport);
        if (fonts === 'tall fallback') await useTallFontMetrics(page);
        if (fonts === 'tall Caslon') await useTallFontMetrics(page, false);
        if (fonts === 'wide') await useWideFontMetrics(page);
        const capture = async (name: string) => { if (fonts === 'normal' && viewport.width !== 1024) await shot(page, name); };
        await open(page, touch, 20);
        await onScreen(page, 'thirdAct');
        expect(await words(page)).toEqual(expect.arrayContaining([STORY_TEXT.thirdActNotice, STORY_TEXT.thirdActReply]));
        await checkPrint(page);
        await capture('broadside');
        await press(page, 'title:continue', touch);
        await onScreen(page, 'levelMap');
        expect(await api(page, t => t.levelStops().map(({ id, open, feat, next }) => [id, open, feat, next])))
          .toEqual([[21, true, true, true], ...[22, 23, 24, 25].map(id => [id, false, true, false])]);
        await checkPrint(page);
        await capture('sheet-fresh');
        await page.evaluate(stars => window.__tarpit!.setCampaignProgress!(stars), through(23));
        await onScreen(page, 'levelMap');
        await capture('sheet-part-won');
        await page.evaluate(stars => window.__tarpit!.setCampaignProgress!(stars), through(24));
        await onScreen(page, 'levelMap');

        for (const level of KEEP_LEVELS) {
          await test.step(`Level ${level.id}`, async () => {
            await press(page, `title:stop:${level.id}`, touch);
            await onScreen(page, 'levelCard');
            expect(await words(page)).toEqual(expect.arrayContaining([
              LEVEL_STORY[level.id].notice, CAMPAIGN_TEXT.gateRule, ...siegeRuleLines(level), cardFeatText(level.feat),
            ]));
            await checkPrint(page);
            if ([21, 23, 25].includes(level.id)) await capture(`card-${level.id}`);
            if (await api(page, t => !!t.uiRects()['title:cardPage'])) {
              await press(page, 'title:cardPage', touch);
              await onScreen(page, 'levelCard');
              expect(await words(page)).toContain('Old Keep');
              await checkPrint(page);
              if (level.id === 23) {
                if (fonts === 'tall fallback' && viewport.width === 390 && viewport.height === 664) {
                  await shot(page, 'card-23-notes-fallback');
                }
                await capture('card-23-notes');
              }
              await press(page, 'title:cardPage', touch);
              await onScreen(page, 'levelCard');
            } else expect(await words(page)).toContain('Old Keep');
            await api(page, t => t.setTipsEnabled(true));
            await press(page, 'title:play', touch);
            await onScreen(page, 'levelTips');
            expect(await words(page)).toEqual(expect.arrayContaining([...levelTips(level.id, touch)]));
            await checkPrint(page);
            await page.waitForFunction(() => window.__tarpit?.titleReady());
            await press(page, 'title:gotIt', touch);
            await onScreen(page, 'game');

            for (let wave = 0; wave < level.waves.length; wave++) {
              await page.evaluate(wave => {
                const t = window.__tarpit!;
                t.state!().wave = wave;
                t.state!().gate!.hp = Math.floor(t.state!().gate!.maxHp / 2);
                t.step!(0);
              }, wave);
              const view = await inspectField(page);
              const tally = new Map<string, number>();
              for (const group of level.waves[wave].groups) {
                const key = group.road + ':' + group.type;
                tally.set(key, (tally.get(key) ?? 0) + group.count);
              }
              expect(view.roads.map(([name]) => name)).toEqual(level.keepRoads === 'both'
                ? ['road:east', 'road:west'] : ['road:' + level.keepRoads]);
              for (const road of view.roads.map(([key]) => key.split(':')[1])) {
                const counts = [...tally].filter(([key]) => key.startsWith(road + ':')).map(([key, count]) =>
                  `${count} ${ENEMY_SHORT_NAMES[key.split(':')[1] as EnemyType]}`);
                const compact = viewport.width === 390 && road === 'west';
                expect(view.labels.map(label => compact ? label.replace(/\s+/g, ' ') : label))
                  .toContain(counts.join(compact ? ' · ' : '\n'));
              }
              if (level.id === 23 && wave === 2) {
                await capture('roads');
                if (viewport.width === 960) await capture('view-before');
              }
              if (level.id === 24 && wave === 0) {
                expect(view.labels).toEqual(expect.arrayContaining([GATE_TEXT.label, 'Repair 80', 'Costs the third star']));
                const pixels = await page.evaluate(async () => {
                  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                  const t = window.__tarpit!, gate = t.uiRects().gate;
                  const ctx = t.game.canvas.getContext('2d')!;
                  const y = Math.floor(gate.y + gate.height * 0.63 + 4);
                  return [0.25, 0.75].map(fraction =>
                    ctx.getImageData(Math.floor(gate.x + gate.width * fraction), y, 1, 1).data[0]);
                });
                expect(pixels[0] - pixels[1], 'the damaged gate has separate filled and empty bar sections').toBeGreaterThan(40);
                await capture('gate-damaged');
              }
            }
            await api(page, t => {
              const s = t.state();
              s.phase = 'wave';
              s.gate!.hp = 0;
              s.gate!.fallen = true;
              s.gate!.lastStandTicksLeft = 157;
              t.step(0);
            });
            let view = await inspectField(page);
            expect(view.labels).toEqual(expect.arrayContaining(['Gate fallen', 'Last stand! 3s']));
            expect(view.roads).toHaveLength(0);
            if (level.id === 23) {
              await capture('gate-last-stand');
              if (viewport.width === 960) await capture('view-during');
            }
            await api(page, t => { t.state().gate!.lastStandTicksLeft = 0; t.step(0); });
            view = await inspectField(page);
            expect(view.labels).toContain('Gate fallen');
            expect(view.labels.some(line => line.startsWith('Last stand!'))).toBe(false);
            if (level.id === 23) await capture('gate-fallen');
            await api(page, t => { t.state().gate!.fallen = false; t.state().gate!.hp = 100; });
            for (const kind of ['earned', 'missed', 'lost'] as const) {
              await finish(page, kind);
              const result = await api(page, t => t.campaignResult());
              const expected = level.feat.kind === 'unbroken' ? 'Unbroken' : 'Not a nail';
              expect(result?.story).toBe(kind === 'lost' ? STORY_TEXT.loss : LEVEL_STORY[level.id].reply);
              if (kind === 'lost') expect(result?.feat).toBe('');
              else expect(result?.feat).toContain(`${kind === 'earned' ? 'Earned: ' : 'Missed '}${expected}`);
              await checkPrint(page);
              if ((level.id === 23 && kind === 'earned') || (level.id === 24 && kind === 'missed')) await capture(`feat-${kind}`);
              if (level.id === 25 && kind === 'earned') {
                await press(page, 'playAgain', touch);
                await onScreen(page, 'siegeEnding');
                expect(await words(page)).toContain(STORY_TEXT.siegeEnding);
                await checkPrint(page);
                await capture('ending');
                await press(page, 'title:continue', touch);
                await onScreen(page, 'game');
              } else if (kind !== 'lost') {
                await press(page, 'playAgain', touch);
                await onScreen(page, 'game');
              } else {
                await press(page, 'menu', touch);
                await onScreen(page, 'levelMap');
              }
            }
          });
        }
      });
    }
  }
}

export function actThreeFlow(touch: boolean) {
  test('the third broadside and campaign ending are each shown once on the new campaign route', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/?test=1&act3=1');
    await waitForFirstScreen(page, { showStory: true });
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'opening');
    await press(page, 'title:continue', touch);
    await onScreen(page, 'levelMap');
    await press(page, 'title:act:3', touch);
    expect(await words(page)).toContain('Win level 20 first');
    await press(page, 'title:stop:1', touch);
    await onScreen(page, 'levelCard');
    for (let id = 1; id <= 25; id++) {
      await play(page, touch);
      expect(await api(page, t => t.state().level!.id)).toBe(id);
      await finish(page, 'earned');
      if (id === 20) {
        const result = await api(page, t => t.campaignResult());
        expect(result?.actClose).toBe(STORY_TEXT.secondActClose);
        expect(result?.complete).toBe('');
        expect(result?.nextId).toBe(21);
      }
      if (id === 25) break;
      await press(page, 'nextLevel', touch);
      if (id === 10 || id === 20) {
        await onScreen(page, id === 10 ? 'secondAct' : 'thirdAct');
        await press(page, 'title:continue', touch);
      }
      await onScreen(page, 'levelCard');
    }
    await press(page, 'menu', touch);
    await onScreen(page, 'siegeEnding');
    expect(await words(page)).toContain(STORY_TEXT.siegeEnding);
    await press(page, 'title:continue', touch);
    await onScreen(page, 'levelMap');
    expect(Object.keys(await api(page, t => t.progress()))).toHaveLength(25);
    await press(page, 'title:stop:25', touch);
    await onScreen(page, 'levelCard');
    await play(page, touch);
    await finish(page, 'earned');
    await press(page, 'menu', touch);
    await onScreen(page, 'levelMap');
  });

  test('a completed twenty-level save crosses 20–21 by keyboard and retains the old ending record', async ({ page }) => {
    await open(page, touch, 20);
    await onScreen(page, 'thirdAct');
    await press(page, 'title:continue', touch);
    await onScreen(page, 'levelMap');
    await page.keyboard.press('ArrowLeft');
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops()[0].id)).toBe(11);
    await page.keyboard.press('ArrowRight');
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops()[0].id)).toBe(21);
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    await play(page, touch);
    expect(await api(page, t => t.state().level!.id)).toBe(21);
    await finish(page, 'earned');
    expect(await api(page, t => t.progress())).toEqual({ ...through(20), 21: 3 });
    expect(await page.evaluate(() => localStorage.getItem('tarpit.seenBroadsides'))).toBe('["opening","secondAct","ending"]');
    await page.reload();
    await waitForFirstScreen(page, { showStory: true });
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops().find(stop => stop.next)?.id)).toBe(22);
  });
}

export function actThreeView() {
  for (const height of [664, 844]) {
    test('the keep view preserves real touch targets through both moves and pause at 390x' + height, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await page.goto('/?act3=1&keep=24&renderer=canvas');
      await page.waitForFunction(() => window.__tarpit?.keep?.());
      const setTime = (time: number) => page.evaluate(time => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        s['clock'].nowMs = time;
        s.advance(0);
      }, time);
      const view = () => page.evaluate(async () => {
        // Read the same published camera matrix used by the last rendered frame.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const t = window.__tarpit!;
        const s = t.game.scene.getScene('game') as GameScene;
        const c = s.cameras.main;
        const cell = s.boardLayout.cellCenter({ col: 15, row: 13 });
        const unprojected = c.getWorldPoint(0, 0);
        const actual = t.canvasToPage((cell.x - unprojected.x) * c.zoomX, (cell.y - unprojected.y) * c.zoomY);
        const hook = t.cellToPage(15, 13);
        return { zoom: c.zoomY, actual, hook, phase: s.state.phase };
      });
      await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        s['clock'].frame = () => 0;
        s['clock'].nowMs = 1000;
      });
      const checkTower = async () => {
        const { actual, hook } = await view();
        // Phaser rounds the published camera translation to canvas pixels.
        expect(Math.abs(hook.x - actual.x)).toBeLessThan(1.5);
        expect(Math.abs(hook.y - actual.y)).toBeLessThan(1.5);
        await page.touchscreen.tap(actual.x, actual.y);
        expect(await page.evaluate(() => !!window.__tarpit!.uiRects()['panel:close'])).toBe(true);
        await press(page, 'panel:close', true);
      };
      await press(page, 'bar:musketeer', true);
      await mapPress(page, 15, 13, true);
      await mapPress(page, 15, 13, true);
      const open = await view();
      await checkTower();
      await shot(page, 'view-before');
      await press(page, 'startWave', true);
      await setTime(1750);
      const middle = await view();
      expect(middle.zoom).toBeGreaterThan(open.zoom);
      await checkTower();
      await press(page, 'window:0', true);
      expect(await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        return s.children.list.some(o => o.type === 'Text' && (o as Phaser.GameObjects.Text).text === 'No targets');
      })).toBe(true);
      await page.evaluate(() => window.__tarpit!.pause());
      expect((await view()).zoom).toBe(middle.zoom);
      await page.evaluate(() => window.__tarpit!.resume());
      await setTime(2500);
      const after = await view();
      expect(after.zoom).toBeGreaterThan(middle.zoom);
      await checkTower();
      if (process.env.M52C1_REVIEW) {
        await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).advance(300));
        await shot(page, 'view-after');
      }
      await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        s.state.phase = 'setup';
        s.advance(0);
      });
      await setTime(3250);
      expect((await view()).zoom).toBeCloseTo(middle.zoom);
      await checkTower();
      const gold = () => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.gold);
      const beforePayment = await gold();
      await press(page, 'wallSite', true);
      expect(await gold()).toBe(beforePayment - 80);
      expect(await page.evaluate(() => window.__tarpit!.uiRects().wallSite)).toBeUndefined();
      await setTime(4000);
      expect((await view()).zoom).toBe(open.zoom);
      await checkTower();
    });
  }

  for (const frozen of [true, false]) {
    test(`the Act Three camera stays fixed under ${frozen ? 'test mode' : 'reduced motion'}`, async ({ page }) => {
      if (!frozen) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/?act3=1&keep=23&renderer=canvas' + (frozen ? '&test=1' : ''));
      await page.waitForFunction(() => window.__tarpit?.keep?.());
      const scales = await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        const setup = s.cameras.main.zoomY;
        s.startWave();
        s['clock'].nowMs += 3000;
        s.advance(0);
        return [setup, s.cameras.main.zoomY];
      });
      expect(scales[1]).toBe(scales[0]);
    });
  }
}

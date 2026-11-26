import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Rect } from '../src/game/input';
import { BOSS_NAME, PAUSE_TEXT } from '../src/game/names';
import { INTER } from '../src/game/palette';
import { BAR_TYPES } from '../src/game/ui/buildBarModel';
import type { Button } from '../src/game/ui/button';
import { LEVELS, TICKS_PER_SECOND, WAVES } from '../src/sim';
import { api, mapPress, press } from './campaign';
import { platformWideFactor, useWideFontMetrics } from './campaignFont';
import { NEW_PHONE_VIEWPORTS, newInterfaceChecks } from './newInterface';
import { openPaintedLevel } from './taxHud';
import { waitForTitle } from './title';

async function inspect(page: Page, floating = false) {
  return page.evaluate(({ types, floating }) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const hud = scene['hud'];
    const [strip] = hud['m'].bands;
    const rects = t.uiRects();
    const scale = t.canvasToPage(100, 100).x / 100 - t.canvasToPage(0, 0).x / 100;
    const targetSizes = Object.entries(rects).filter(([key]) => key !== 'gold')
      .map(([key, { width, height }]) => ({ key, size: Math.min(width, height) * scale }));
    const unmarkedControls: string[] = [];
    const labels: {
      group: string; text: string; family: string; visible: boolean; size: number; padding: number; uniform: boolean;
      left: number; right: number; top: number; bottom: number;
    }[] = [];
    const state = scene.state;
    function read(group: string, label: Phaser.GameObjects.Text, box: Rect) {
      const { left, right, top, bottom } = label.getBounds();
      labels.push({ group, text: label.text, family: label.style.fontFamily, visible: label.visible && !!label.text, uniform: label.scaleX === label.scaleY,
        left, right, top, bottom,
        size: parseFloat(String(label.style.fontSize)) * scale * label.scaleX,
        padding: scale * Math.min(left - box.x, box.x + box.width - right, top - box.y, box.y + box.height - bottom) });
    }
    function checkControl(key: string, button: Button, hasIcon = false) {
      const icon = hasIcon || button['icon'] && button['chrome']?.image.visible;
      const hasLabel = button.labelObjects[0].visible && button.text;
      if (!icon && !hasLabel) unmarkedControls.push(key);
    }
    if (floating) {
      const map = scene['layout'].map;
      const hits = scene['hitNumbers']!;
      hits.hit({ x: map.x, y: map.y }, 83);
      hits.hit({ x: map.x + map.width, y: map.y }, 135);
      hits.draw();
      const fx = scene['fx']!;
      fx['addGold'](map.x, map.y, 30);
      fx['addGold'](map.x + map.width, map.y + map.height, 360, true);
      fx.update(state);
      for (const { text } of hits['labels']) read('damage numbers', text, map);
      read('gold numbers', fx['goldTexts'][0], map);
      read('boss bounty', fx['goldTexts'][1], map);
      return { labels, portraits: 0, targetSizes: [], unmarkedControls };
    }
    for (const label of scene.children.list.filter(o => o.name.startsWith('hud-stat:')))
      read('stat captions', label as Phaser.GameObjects.Text, strip);
    for (const key of ['gold', 'lives', 'wave'] as const) read('stat values', hud[key], strip);
    read('level name', scene.children.getByName('hud-level-name') as Phaser.GameObjects.Text, strip);
    if (state.level?.taxes) read('taxes', hud['taxLine'], strip);
    if (state.phase !== 'lost') read('preview', hud['next'], strip);
    if (state.cheated) read('cheat mark', hud['cheatMark'], strip);
    for (const [key, button] of [['startWave', hud['startButton']], ['special', hud['specialButton']],
      ['speed', hud['speedButton']], ['pause', hud['pauseButton']]] as const) {
      if (!rects[key]) continue;
      if (button.text) read(key, button.labelObjects[0], rects[key]);
      const pauseIcon = hud['pauseIcon'];
      if (state.phase === 'setup' || state.phase === 'wave')
        checkControl(key, button, key === 'pause' && pauseIcon.visible && pauseIcon.commandBuffer.length > 0);
    }
    if (state.phase === 'wave' && state.specialCharges > 0) read('ready', hud['readyState']!, rects.special);
    const first = rects['bar:musketeer'], second = rects['bar:cannon'];
    if (state.level?.taxes?.rationing) read('permit tally', hud['bar']['count'], hud['bar']['permitBox'] ?? { ...first, width: second.x + second.width - first.x });
    for (const [i, type] of types.entries()) {
      const label = scene.children.getByName('bar-name:' + type) as Phaser.GameObjects.Text;
      const plaque = rects['bar:' + type];
      read('tower names', label, plaque);
      read('tower prices', hud['bar']['buttons'][i].labelObjects[0], plaque);
    }
    const panel = scene['panel'];
    let sellIconDrawn = false;
    if (panel.rect) {
      checkControl('panel:close', panel['closeButton']);
      read('tower title', panel['titleText'], panel.rect);
      read('tower meta', panel['killsText'], panel.rect);
      if (panel.choices.length) read('upgrade heading', panel['pathHeading']!, panel.rect);
      for (const { key, button, path } of panel['activeRows']) {
        const box = rects['panel:' + key];
        if (key === 'sell' && !button.labelObjects[0].visible) {
          const image = button['chrome']?.image;
          const tile = image?.texture.getSourceImage();
          if (image?.visible && tile instanceof HTMLCanvasElement) {
            // Look for the pale glyph inside the left half of the baked button.
            const ink = tile.getContext('2d')!.getImageData(tile.width * .04, tile.height * .25, tile.width * .31, tile.height * .5);
            sellIconDrawn = ink.data.some((channel, i) => i % 4 === 1 && channel > 140);
          }
        }
        checkControl(`panel:${key}`, button, key === 'sell' && sellIconDrawn);
        for (const [i, text] of button.labelObjects.entries()) {
          if (text.text) read(path ? 'upgrade choices' : key === 'sell' && i === 1 ? 'tower refund' : 'tower ' + key, text, box);
        }
        if (path) {
          const { description, reason } = panel['pathText'][path.path];
          read('upgrade descriptions', description, box);
          if (path.disabledReason) read('upgrade reasons', reason, box);
        }
      }
    }
    const menu = hud['specialMenu'];
    for (const key of menu['shownTypes']) {
      const button = menu['buttons'][key];
      read('special choices', button.labelObjects[0], rects['special:' + key]);
      checkControl(`special:${key}`, button);
    }
    if (state.level?.featherBarrels && rects['special:tarBarrel']) read('barrel caption', menu['barrelCaption'], rects['special:tarBarrel']);
    if (rects.buildConfirm) {
      read('build confirmation', scene['buildConfirm']!.labelObjects[0], rects.buildConfirm);
      checkControl('buildConfirm', scene['buildConfirm']!);
    }
    const boss = hud['bossBar'];
    if (t.bossOnField!()) {
      read('boss name', boss['name'], boss['plate']!);
      read('boss HP', boss['hp'], boss['plate']!);
    }
    if (scene['bannerRect']) {
      if (scene['bannerMain'].text) read('aim instruction', scene['bannerMain'], scene['bannerRect']);
      if (scene['bannerHint'].text) read('aim hint', scene['bannerHint'], scene['bannerRect']);
    }
    const moments = scene['moments'];
    if (moments['plate'] && moments['bannerBg'].visible && moments['bannerKey']) {
      read('event heading', moments['bannerText'], moments['plate']);
      if (moments['bannerSub'].text) read('event detail', moments['bannerSub'], moments['plate']);
    }
    const reward = scene['reward'];
    if (state.pendingBoon) {
      const { cards } = reward['geo'];
      read('reward title', reward['title'], scene['layout'].map);
      reward['cards'].forEach(({ name, effect }, i) => {
        read('reward names', name, cards[i]);
        read('reward descriptions', effect, cards[i]);
      });
      for (const { text, box } of reward['keys']) read('reward keys', text, box);
    }
    const held = scene['held'];
    if (held.tooltip) {
      read('boon name', held['name'], held['geo'].tooltip);
      read('boon description', held['effect'], held['geo'].tooltip);
    }
    const bar = hud['bar'];
    const portraits = bar['portraits']?.filter(image => image.visible).length ?? (bar['icons']?.image.visible ? types.length : 0);
    return { labels, portraits, sellIconDrawn, targetSizes, unmarkedControls };
  }, { types: BAR_TYPES, floating });
}

async function stressDeviceFont(page: Page, factor: number, alternate: boolean) {
  await page.addInitScript(({ factor, alternate }) => {
    const context = CanvasRenderingContext2D.prototype;
    if (alternate) {
      // Use the browser's monospace face for both measuring and painting.
      const font = Object.getOwnPropertyDescriptor(context, 'font')!;
      Object.defineProperty(context, 'font', { ...font, set(value: string) {
        font.set!.call(this, value.includes('system-ui') ? value.replace(/system-ui.*/, 'monospace') : value);
      } });
    }
    const stressed = (font: string) => font.includes(alternate ? 'monospace' : 'system-ui');
    const measure = context.measureText;
    context.measureText = function (text) {
      const metrics = measure.call(this, text);
      if (stressed(this.font)) Object.defineProperty(metrics, 'width', { value: metrics.width * factor });
      return metrics;
    };
    for (const method of ['fillText', 'strokeText'] as const) {
      const draw = context[method];
      context[method] = function (text, x, y, maxWidth) {
        if (!stressed(this.font)) return draw.call(this, text, x, y, maxWidth);
        this.save();
        this.translate(x, y);
        this.scale(factor, 1);
        draw.call(this, text, 0, 0, maxWidth === undefined ? undefined : maxWidth / factor);
        this.restore();
      };
    }
  }, { factor, alternate });
}

const interModes = { Inter: 1, 'Inter with margin': platformWideFactor, 'wide Inter': 1.15, 'narrow Inter': .90 };
const deviceModes = { device: 1, 'wide device': 1.15, 'narrow device': .90, 'wide monospace': 1.30 };

newInterfaceChecks(() => {
  test.use({ serviceWorkers: 'block' });
  for (const [mode, factor] of Object.entries({ ...interModes, ...deviceModes })) {
    const blocked = mode in deviceModes;
    const allLabels = mode === 'Inter' || mode === 'Inter with margin';
    test(`${allLabels ? 'all labels fit' : 'fit invariants'} with ${mode}`, async ({ page }, info) => {
      test.setTimeout(90_000);
      // The shared margin already accounts for the wider Linux advances.
      const correction = !allLabels && process.platform === 'darwin' ? 1.026 : 1;
      if (!blocked && factor !== 1) await useWideFontMetrics(page, factor * correction, INTER);
      if (blocked) await page.route('**/Inter-Latin-Variable-*.woff2', route => route.abort());
      if (blocked && factor !== 1) await stressDeviceFont(page, factor, mode === 'wide monospace');
      const touch = info.project.name !== 'chromium';
      const sizes = info.project.name === 'phone' ? NEW_PHONE_VIEWPORTS : [page.viewportSize()!];
      for (const { width, height } of sizes) {
        await page.setViewportSize({ width, height });
        const level = LEVELS.find(l => l.taxes?.rationing && Object.keys(l.taxes).length === 2)!;
        await openPaintedLevel(page, { ...level, waves: [...WAVES, WAVES[7], WAVES[9]], rewardWaves: [] });
        expect(await page.evaluate(family => [...document.fonts].some(face => face.family === family && face.status === 'loaded'), INTER)).toBe(!blocked);
        await api(page, t => { t.state().wave = 10; t.state().gold = 888; t.step(0); });
        const groups = new Map<string, Set<string>>();
        const hiddenWords = new Set<string>();
        const closest = {
          panel: { clearance: Infinity, detail: '' },
          map: { clearance: Infinity, detail: '' },
        };
        async function check(state: string, refund = '', floating = false) {
          const { labels, portraits, sellIconDrawn, targetSizes, unmarkedControls } = await inspect(page, floating);
          if (!floating) expect.soft(portraits, state + ' shows all tower portraits').toBe(6);
          if (!allLabels) {
            expect.soft(unmarkedControls, state + ' controls have a label or icon').toEqual([]);
            for (const { key, size } of targetSizes) {
              if (touch || key === 'pause') expect.soft(size, `${width}×${height} ${state} ${key} target`).toBeGreaterThanOrEqual(44);
            }
          }
          if (refund) {
            expect.soft(labels.find(l => l.group === 'tower refund' && l.visible)?.text, state + ' shows the refund').toBe(refund);
            if (!labels.find(l => l.group === 'tower sell')?.visible) {
              expect.soft(sellIconDrawn, state + ' shows the remove icon').toBe(true);
            }
          }
          const groupsInState = new Map<string, Set<number>>();
          for (const label of labels) {
            const detail = `${width}×${height} ${state} ${label.group} “${label.text}”`;
            expect.soft(label.family.startsWith(`"${INTER}"`), detail + ' uses bundled Inter').toBe(!blocked);
            if (allLabels) {
              expect.soft(label.visible, detail + ' visible').toBe(true);
              if (label.group === 'boss name') expect.soft(label.text, detail + ' uses the full name').toBe(BOSS_NAME);
            }
            const shortBossName = label.group === 'boss name' && label.text !== BOSS_NAME;
            const result = label.visible ? label.size.toFixed(2) + (shortBossName ? ' (short name)' : '') : 'fallback';
            if (!groups.has(label.group)) groups.set(label.group, new Set());
            groups.get(label.group)!.add(result);
            if (mode === 'wide Inter') {
              if (shortBossName) hiddenWords.add(BOSS_NAME);
              if (!label.visible && label.text) hiddenWords.add(label.text);
            }
            if (!label.visible) continue;
            const area = floating ? 'map' : 'panel';
            if (label.padding < closest[area].clearance) closest[area] = { clearance: label.padding, detail };
            if (!groupsInState.has(label.group)) groupsInState.set(label.group, new Set());
            groupsInState.get(label.group)!.add(label.size);
            expect.soft(label.padding, detail + ' CSS px clearance').toBeGreaterThanOrEqual(2 - .001);
            expect.soft(label.size, detail + ' CSS px size').toBeGreaterThanOrEqual(11.1);
            expect.soft(label.uniform, detail + ' preserves proportions').toBe(true);
          }
          for (const [group, variants] of groupsInState) expect.soft(variants.size, state + ' ' + group + ' uniform visible size').toBe(1);
          // Check each overlay's own labels. Floating numbers can cross.
          const layer = (group: string) => /^(event |boss |aim )/.exec(group)?.[1] ?? 'base';
          const visible = labels.filter(l => l.visible);
          if (!floating) for (const [i, a] of visible.entries()) {
            for (const b of visible.slice(i + 1)) {
              const overlaps = layer(a.group) === layer(b.group)
                && Math.min(a.right, b.right) - Math.max(a.left, b.left) > .001
                && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .001;
              if (overlaps) expect.soft(overlaps, `${state} ${a.group} “${a.text}” overlaps ${b.group} “${b.text}”`).toBe(false);
            }
          }
        }
        await check('setup');
        if (!allLabels) {
          await expect(page.getByRole('button', { name: PAUSE_TEXT.button, exact: true })).toBeVisible();
          expect(await page.evaluate(() => {
            const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
            const icon = scene['hud']['pauseIcon'];
            return icon.visible && icon.commandBuffer.length > 0;
          })).toBe(true);
          await press(page, 'pause', touch);
          expect(await api(page, t => t.paused())).toBe(true);
          await press(page, 'pause:resume', touch);
          expect(await api(page, t => t.paused())).toBe(false);
        }
        await press(page, 'bar:musketeer', touch);
        await mapPress(page, 7, 5, touch);
        if ((await api(page, t => t.uiRects())).buildConfirm) {
          await check('armed');
          await press(page, 'buildConfirm', touch);
        }
        if (!(await api(page, t => t.state().towers.length))) await api(page, t => t.buildAt(7, 5, 'musketeer'));
        await mapPress(page, 7, 5, touch);
        await check('tower drawer', '+50');
        await press(page, 'panel:upgrade', touch);
        await api(page, t => { t.state().gold = 0; t.step(0); });
        expect(await api(page, t => t.ui().pathChoices.length)).toBe(2);
        await check('upgrade drawer', '+85');
        if (!blocked) {
          await press(page, 'panel:close', touch);
          expect(await api(page, t => {
            t.state().gold = 888;
            return t.buildAt(7, 0, 'firepot').ok && t.upgradeAt(7, 0).ok;
          })).toBe(true);
          await mapPress(page, 7, 0, touch);
          await press(page, 'panel:path:B', touch);
          expect(await api(page, t => t.state().towers.find(tower => tower.type === 'firepot')?.path)).toBe('B');
          await press(page, 'panel:target', touch);
          await press(page, 'panel:target', touch);
          expect(await api(page, t => t.state().towers.find(tower => tower.type === 'firepot')?.targeting)).toBe('strongest');
          await check('level-three drawer at the edge', '+240');
          await press(page, 'panel:close', touch);
        } else {
          await press(page, 'panel:sell', touch);
          expect(await api(page, t => ({ towers: t.state().towers.length, gold: t.state().gold }))).toEqual({ towers: 0, gold: 85 });
        }
        await api(page, t => { t.state().wave = 9; t.startWave(); t.step(1); });
        await press(page, 'special', touch);
        await check('special menu');
        await press(page, 'special:fireArrows', touch);
        await check('aim');
        await press(page, 'special', touch);
        await page.evaluate(tick => {
          const t = window.__tarpit!;
          t.state!().waveTick = tick;
          t.step!(1);
        }, WAVES[9].groups.find(g => g.type === 'boss')!.delay * TICKS_PER_SECOND);
        expect(await api(page, t => t.bossOnField())).toBeTruthy();
        await check('boss and event banner');
        await api(page, t => {
          const s = t.state();
          s.pendingBoon = { wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] };
          t.step(0);
        });
        await check('reward');
        await api(page, t => { t.pickBoon('longBarrels'); t.step(0); });
        await press(page, 'boon:longBarrels', touch);
        await check('held boon');
        await api(page, t => { t.cheatGold(); t.state().enemies = []; t.state().phase = 'won'; t.step(0); });
        await check('won');
        await api(page, t => t.startLevel(18));
        await api(page, t => { t.state().lives = 0; t.state().phase = 'lost'; t.step(0); });
        await check('lost');
        await page.goto('/?look=painted&renderer=canvas');
        await waitForTitle(page);
        await press(page, 'title:play', touch);
        await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
        await check('floating numbers', '', true);
        if (allLabels) for (const [group, sizes] of groups) {
          expect.soft([...sizes].filter(size => size !== 'fallback').length,
            `${width}×${height} ${group} keeps one visible size between states`).toBeLessThanOrEqual(1);
        }
        if (mode === 'wide Inter') info.annotations.push({
          type: 'Hidden with wide Inter', description: `${width}×${height}: ${[...hiddenWords].sort().join(', ') || 'none'}`,
        });
        if (mode === 'Inter with margin') for (const { clearance, detail } of Object.values(closest)) {
          info.annotations.push({ type: 'Smallest margin clearance', description: `${clearance.toFixed(3)} CSS px · ${detail}` });
        }
        await info.attach(`${width}x${height}`, { body: JSON.stringify(Object.fromEntries([...groups].map(([group, sizes]) => [group, [...sizes]]))), contentType: 'application/json' });
      }
    });
  }
});

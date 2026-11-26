import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Rect } from '../src/game/input';
import { BOSS_NAME, ENEMY_SHORT_NAMES } from '../src/game/names';
import { BAR_TYPES } from '../src/game/ui/buildBarModel';
import { LEVELS, TICKS_PER_SECOND, WAVES } from '../src/sim';
import { api, mapPress, press } from './campaign';
import { newInterfaceChecks } from './newInterface';
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
    const labels: { group: string; text: string; visible: boolean; size: number; padding: number; uniform: boolean }[] = [];
    const state = scene.state;
    function read(group: string, label: Phaser.GameObjects.Text, box: Rect) {
      const { left, right, top, bottom } = label.getBounds();
      labels.push({ group, text: label.text, visible: label.visible && !!label.text, uniform: label.scaleX === label.scaleY,
        size: parseFloat(String(label.style.fontSize)) * scale * label.scaleX,
        padding: scale * Math.min(left - box.x, box.x + box.width - right, top - box.y, box.y + box.height - bottom) });
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
      return { labels, nameFits: true, portraits: 0 };
    }
    for (const label of scene.children.list.filter(o => o.name.startsWith('hud-stat:')))
      read('stat captions', label as Phaser.GameObjects.Text, strip);
    for (const key of ['gold', 'lives', 'wave'] as const) read('stat values', hud[key], strip);
    read('level name', scene.children.getByName('hud-level-name') as Phaser.GameObjects.Text, strip);
    if (state.level?.taxes) read('taxes', hud['taxLine'], strip);
    if (state.phase !== 'lost') read('preview', hud['next'], strip);
    if (state.cheated) read('cheat mark', hud['cheatMark'], strip);
    for (const [key, button] of [['startWave', hud['startButton']], ['special', hud['specialButton']],
      ['speed', hud['speedButton']], ['pause', hud['pauseButton']]] as const)
      if (rects[key] && button.text) read(key, button.labelObjects[0], rects[key]);
    if (state.phase === 'wave' && state.specialCharges > 0) read('ready', hud['readyState']!, rects.special);
    const first = rects['bar:musketeer'], second = rects['bar:cannon'];
    if (state.level?.taxes?.rationing) read('permit tally', hud['bar']['count'], { ...first, width: second.x + second.width - first.x });
    const context = document.createElement('canvas').getContext('2d')!;
    const floor = Math.ceil(100 * 11.1 / scale) / 100;
    let nameFits = true;
    for (const [i, type] of types.entries()) {
      const label = scene.children.getByName('bar-name:' + type) as Phaser.GameObjects.Text;
      const plaque = rects['bar:' + type];
      context.font = `${floor}px ${label.style.fontFamily}`;
      nameFits &&= Math.ceil(context.measureText(label.text).width) * scale <= plaque.width * scale - 4;
      read('tower names', label, plaque);
      read('tower prices', hud['bar']['buttons'][i].labelObjects[0], plaque);
    }
    const panel = scene['panel'];
    if (panel.rect) {
      read('tower title', panel['titleText'], panel.rect);
      read('tower meta', panel['killsText'], panel.rect);
      if (panel.choices.length) read('upgrade heading', panel['pathHeading']!, panel.rect);
      for (const { key, button, path } of panel['activeRows']) {
        const box = rects['panel:' + key];
        for (const text of button.labelObjects) if (text.text) read(path ? 'upgrade choices' : 'tower ' + key, text, box);
        if (path) {
          const { description, reason } = panel['pathText'][path.path];
          read('upgrade descriptions', description, box);
          if (path.disabledReason) read('upgrade reasons', reason, box);
        }
      }
    }
    const menu = hud['specialMenu'];
    for (const key of menu['shownTypes']) read('special choices', menu['buttons'][key].labelObjects[0], rects['special:' + key]);
    if (state.level?.featherBarrels && rects['special:tarBarrel']) read('barrel caption', menu['barrelCaption'], rects['special:tarBarrel']);
    if (rects.buildConfirm) read('build confirmation', scene['buildConfirm']!.labelObjects[0], rects.buildConfirm);
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
    return { labels, nameFits, portraits };
  }, { types: BAR_TYPES, floating });
}

newInterfaceChecks(() => {
  for (const factor of [1, 1.15, .90]) {
    test(`device font fit at ${factor}×`, async ({ page }, info) => {
      if (factor !== 1) await page.addInitScript(factor => {
        const context = CanvasRenderingContext2D.prototype;
        const measure = context.measureText;
        context.measureText = function (text) {
          const metrics = measure.call(this, text);
          if (this.font.includes('system-ui')) Object.defineProperty(metrics, 'width', { value: metrics.width * factor });
          return metrics;
        };
        // Simulate the same advance when painting, including the narrower face.
        for (const method of ['fillText', 'strokeText'] as const) {
          const draw = context[method];
          context[method] = function (text, x, y, maxWidth) {
            if (!this.font.includes('system-ui')) return draw.call(this, text, x, y, maxWidth);
            this.save();
            this.translate(x, y);
            this.scale(factor, 1);
            draw.call(this, text, 0, 0, maxWidth === undefined ? undefined : maxWidth / factor);
            this.restore();
          };
        }
      }, factor);
      const sizes = info.project.name === 'phone' ? [{ width: 390, height: 664 }, { width: 390, height: 844 }] : [page.viewportSize()!];
      for (const { width, height } of sizes) {
        await page.setViewportSize({ width, height });
        const level = LEVELS.find(l => l.taxes?.rationing && Object.keys(l.taxes).length === 2)!;
        await openPaintedLevel(page, { ...level, waves: [...WAVES, WAVES[7], WAVES[9]], rewardWaves: [] });
        await api(page, t => { t.state().wave = 10; t.state().gold = 888; t.step(0); });
        const groups = new Map<string, Set<string>>();
        async function check(state: string, floating = false) {
          const { labels, nameFits, portraits } = await inspect(page, floating);
          if (!nameFits) expect.soft(portraits, state + ' still shows tower art').toBe(6);
          const sizes = new Map<string, Set<number>>();
          for (const label of labels) {
            const detail = `${width}×${height} ${state} ${label.group} “${label.text}”`;
            const shouldShow = label.group !== 'tower names' || nameFits;
            expect.soft(label.visible, detail + ' visible').toBe(shouldShow);
            if (!groups.has(label.group)) groups.set(label.group, new Set());
            const shortBossName = label.group === 'boss name' && label.text !== BOSS_NAME;
            if (shortBossName) expect.soft(label.text).toBe(ENEMY_SHORT_NAMES.boss);
            groups.get(label.group)!.add(label.visible ? label.size.toFixed(2) + (shortBossName ? ' (short name)' : '') : 'fallback');
            if (!label.visible) continue;
            expect.soft(label.padding, detail + ' CSS px clearance').toBeGreaterThanOrEqual(2 - .001);
            expect.soft(label.size, detail + ' CSS px size').toBeGreaterThanOrEqual(11.1);
            expect.soft(label.uniform, detail + ' preserves proportions').toBe(true);
            if (!sizes.has(label.group)) sizes.set(label.group, new Set());
            sizes.get(label.group)!.add(label.size);
          }
          for (const [group, sizesInGroup] of sizes) expect.soft(sizesInGroup.size, state + ' ' + group + ' uniform size').toBe(1);
        }
        const touch = info.project.name !== 'chromium';
        await check('setup');
        await press(page, 'bar:musketeer', touch);
        await mapPress(page, 7, 5, touch);
        if ((await api(page, t => t.uiRects())).buildConfirm) {
          await check('armed');
          await press(page, 'buildConfirm', touch);
        }
        if (!(await api(page, t => t.state().towers.length))) await api(page, t => t.buildAt(7, 5, 'musketeer'));
        await mapPress(page, 7, 5, touch);
        await check('tower drawer');
        await press(page, 'panel:upgrade', touch);
        await api(page, t => { t.state().gold = 0; t.step(0); });
        expect(await api(page, t => t.ui().pathChoices.length)).toBe(2);
        await check('upgrade drawer');
        await press(page, 'panel:close', touch);
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
        await check('floating numbers', true);
        await test.info().attach(`${width}x${height}`, { body: JSON.stringify(Object.fromEntries([...groups].map(([group, sizes]) => [group, [...sizes]]))), contentType: 'application/json' });
      }
    });
  }
});

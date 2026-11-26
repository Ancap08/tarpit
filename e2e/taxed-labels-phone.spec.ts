import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Rect } from '../src/game/input';
import { BOSS_NAME, BOSS_WAVE_NEXT_TEXT, callEarlyLabel, CHEAT_MARK, LAST_WAVE_TEXT, START_WAVE_TEXT, TAX_NAMES } from '../src/game/names';
import { BAR_TYPES } from '../src/game/ui/buildBarModel';
import { EARLY_CALL_MAX_BONUS, LEVELS, TICKS_PER_SECOND, WAVES, type LevelDef } from '../src/sim';
import { api, press } from './campaign';
import { checkSize } from './campaignActs';
import { platformWideFactor, useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { openPaintedLevel } from './taxHud';
import { NEW_PHONE_HEIGHTS, hasNewInterface, newInterfaceChecks } from './newInterface';

// Free play 8 lists five troop types; 10 has the longest boss preview. Put both
// after wave ten so the real HUD must also fit a two-digit wave and level number.
const waves = [...WAVES.slice(0, 10), WAVES[7], WAVES[9], WAVES[7]];
const longPreviews = [
  'Next: 50 Collector, 25 Hound, 13 Toll Troll, 6 Redcoat, 14 Harpy',
  'Next: 20 Hound, 15 Toll Troll, 12 Harpy, 8 Redcoat + Grumblefoot',
];
const levels = [
  LEVELS.find(l => l.taxes && Object.keys(l.taxes).length === 1)!,
  LEVELS.find(l => l.taxes?.rationing && Object.keys(l.taxes).length === 2)!,
];

type Phase = 'setup' | 'wave' | 'won' | 'lost';
type LabelSize = { id: string; text: string; size: number };

async function checkHud(page: Page, level: LevelDef, phase: Phase, preview: string) {
  const snapshot = await page.evaluate(({ phase, types }) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const hud = scene['hud'];
    const [strip, controls] = hud['m'].bands;
    const rects = t.uiRects();
    const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
    const inset = (inner: Rect, outer: Rect) => Math.min(inner.x - outer.x, inner.y - outer.y,
      outer.x + outer.width - inner.x - inner.width, outer.y + outer.height - inner.y - inner.height);
    const labels: { id: string; text: string; visible: boolean; size: number; padding: number;
      uniform: boolean; bounds: Rect }[] = [];
    const measured = new Set<Phaser.GameObjects.Text>();
    function read(id: string, obj: Phaser.GameObjects.Text, region: Rect) {
      measured.add(obj);
      const { x, y, width, height } = obj.getBounds();
      labels.push({ id, text: obj.text, visible: obj.visible && obj.alpha > 0,
        size: parseFloat(String(obj.style.fontSize)) * Math.min(obj.scaleX, obj.scaleY) * scale,
        uniform: obj.scaleX === obj.scaleY, padding: inset({ x, y, width, height }, region),
        bounds: { x, y, width, height } });
    }
    const modern = new URL(location.href).searchParams.get('ui') === 'new';
    for (const key of ['gold', 'lives', 'wave', 'taxLine'] as const) read(key, hud[key], strip);
    if (modern) {
      for (const label of scene.children.list.filter(o => o.name.startsWith('hud-stat:')))
        read(label.name, label as Phaser.GameObjects.Text, strip);
      for (const type of types) read('tower-name:' + type,
        scene.children.getByName('bar-name:' + type) as Phaser.GameObjects.Text, rects['bar:' + type]);
    }
    read('tag', modern ? scene.children.getByName('hud-level-name') as Phaser.GameObjects.Text : hud['tag'], strip);
    if (phase !== 'lost') read('next', hud['next'], strip);
    if (t.state!().cheated) read('cheatMark', hud['cheatMark'], strip);
    for (const [key, button] of [['startWave', hud['startButton']], ['special', hud['specialButton']],
      ['speed', hud['speedButton']]] as const) read(key, button.labelObjects[0], rects[key]);
    const readyState = hud['readyState'];
    if (readyState?.visible) read('specialReady', readyState, rects.special);
    hud['bar']['buttons'].forEach((button, i) => read('bar:' + types[i], button.labelObjects[0], button.rect));
    if (t.state!().level?.taxes?.rationing) {
      const first = rects['bar:musketeer'], second = rects['bar:cannon'];
      read('tally', hud['bar']['count'], hud['bar']['permitBox'] ?? { ...first, width: second.x + second.width - first.x });
    }
    if (t.bossOnField!()) {
      const boss = hud['bossBar'];
      const { bar, pill } = boss['geo'];
      read('bossName', boss['name'], { ...bar, y: pill.y,
        width: Math.ceil(boss['name'].displayWidth) + 2 * pill.padX, height: pill.height });
      read('bossHp', boss['hp'], bar);
    }
    // A new visible label in either HUD band must acquire the same size and containment checks.
    const unmeasured = scene.children.list.filter(node => node.type === 'Text')
      .map(node => node as Phaser.GameObjects.Text)
      .filter(label => label.visible && label.alpha > 0 && label.depth < 11 && label.text && !measured.has(label))
      .filter(label => label.getBounds().top < strip.y + strip.height || label.getBounds().bottom > controls.y)
      .map(label => label.text);
    const overlaps: string[] = [];
    for (const [i, { id, bounds: a }] of labels.entries()) {
      if (!labels[i].visible) continue;
      for (const { id: other, bounds: b, visible } of labels.slice(i + 1))
        if (visible && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y)
          overlaps.push(id + ' / ' + other);
    }
    // Both painted bands must fit the actual canvas and leave the battlefield clear.
    const layout = scene['layout'];
    const canvas = { x: 0, y: 0, width: t.game.scale.width, height: t.game.scale.height };
    const framePadding = Math.min(inset(strip, canvas), inset(controls, canvas),
      layout.map.y - strip.y - strip.height, controls.y - layout.map.y - layout.map.height,
      ...labels.filter(l => l.id.startsWith('bar:') || (['special', 'speed', 'startWave'].includes(l.id) || l.id === 'tally' && !modern))
        .map(l => inset(l.bounds, controls)));
    const s = t.state!();
    return { labels, unmeasured, overlaps, framePadding, waveLines: hud['startButton'].labelObjects[0].getWrappedText(),
      next: hud['next'].text, phase: s.phase, end: t.endScreen!(),
      gold: s.gold, lives: s.lives, wave: s.wave, total: s.level!.waves.length, cheated: s.cheated };
  }, { phase, types: BAR_TYPES });

  expect(snapshot.phase).toBe(phase);
  expect(snapshot.end).toBe(phase === 'won' || phase === 'lost' ? phase : null);
  expect(snapshot.next).toBe(preview);
  const text = Object.fromEntries(snapshot.labels.map(l => [l.id, l.text]));
  const modern = hasNewInterface(page);
  expect(text).toMatchObject({ gold: (modern ? '' : 'Gold ') + snapshot.gold, lives: (modern ? '' : 'Lives ') + Math.max(0, snapshot.lives),
    wave: `${modern ? '' : 'Wave '}${snapshot.wave}/${snapshot.total}` });
  if (hasNewInterface(page)) expect(text.tag).toMatch(new RegExp(`^Level ${level.id} · .+`));
  else expect(text.tag).toBe('Level ' + level.id);
  if (text.startWave === BOSS_WAVE_NEXT_TEXT) expect.soft(snapshot.waveLines).toEqual(['Boss', 'next']);
  if (snapshot.cheated) expect(text.cheatMark).toBe(CHEAT_MARK);
  for (const [key, name] of Object.entries(TAX_NAMES))
    if (key in level.taxes!) expect(text.taxLine).toContain(name);
  expect(snapshot.framePadding, 'HUD clears map and canvas edges').toBeGreaterThanOrEqual(0);
  expect(snapshot.unmeasured, phase + ' unchecked text in HUD bands').toEqual([]);
  expect(snapshot.overlaps, phase + ' overlapping HUD labels').toEqual([]);
  const height = page.viewportSize()!.height;
  if (modern) expect(new Set(snapshot.labels.filter(l => l.id.startsWith('tower-name:')).map(l => l.visible)).size).toBe(1);
  for (const label of snapshot.labels) {
    const detail = phase + ' ' + label.id + ' “' + label.text + '”';
    if (modern && !label.visible && label.id.startsWith('tower-name:')) continue;
    expect.soft(label.visible && !!label.text, detail + ' visible').toBe(true);
    expect.soft(label.padding, detail + ' inside its panel or plaque').toBeGreaterThanOrEqual(0);
    expect.soft(label.uniform, detail + ' keeps glyph proportions').toBe(true);
    const minimum = (height === 844 && !label.id.startsWith('tower-name:')) || ['taxLine', 'tally', 'speed'].includes(label.id) ? 12 : 11.1;
    expect.soft(label.size, detail + ' CSS px').toBeGreaterThanOrEqual(minimum);
    test.info().annotations.push({ type: 'font', description: height + ' ' + detail + ' ' + label.size.toFixed(2) });
  }
  return snapshot.labels.map(({ id, text, size }) => ({ id, text, size }));
}

async function exerciseHud(page: Page, level: LevelDef, fallback: boolean) {
  const states: LabelSize[][] = [];
  async function check(phase: Phase, preview: string, waveLabel: string) {
    const labels = await checkHud(page, level, phase, preview);
    expect(labels.find(label => label.id === 'startWave')?.text).toBe(waveLabel);
    states.push(labels);
  }

  await openPaintedLevel(page, { ...level, waves, rewardWaves: [] });
  expect(await page.evaluate(() => [...document.fonts].some(f => f.status === 'loaded'))).toBe(!fallback);
  await api(page, t => { t.state().wave = 10; t.state().gold = 888; t.step(0); });
  await check('setup', longPreviews[0], START_WAVE_TEXT);
  await api(page, t => { t.startWave(); t.step(1); });
  await check('wave', longPreviews[1], BOSS_WAVE_NEXT_TEXT);
  await api(page, t => {
    t.state().spawnedPerGroup.fill(99_999);
    t.state().enemies = [];
    t.step(1);
  });
  await check('setup', longPreviews[1], START_WAVE_TEXT);
  await api(page, t => { t.startWave(); t.step(1); });
  // Keep the other troops near the entrance while the Assessor arrives.
  await page.evaluate(tick => {
    const t = window.__tarpit!;
    t.state!().waveTick = tick;
    t.step!(1);
  }, WAVES[9].groups.find(g => g.type === 'boss')!.delay * TICKS_PER_SECOND);
  expect(await api(page, t => t.hudText().boss)).toContain(BOSS_NAME);
  // Mark the remaining spawns complete, then use the bonus to call the last wave.
  await api(page, t => { t.state().spawnedPerGroup.fill(99_999); t.step(0); });
  await check('wave', longPreviews[0], callEarlyLabel(EARLY_CALL_MAX_BONUS, true));
  expect(await api(page, t => t.callNextWave())).toMatchObject({ ok: true });
  await check('wave', 'Next: none', LAST_WAVE_TEXT);
  expect(await api(page, t => t.cheatGold())).toMatchObject({ ok: true });
  await api(page, t => {
    const s = t.state();
    s.enemies = [];
    s.phase = 'won';
    t.step(0);
  });
  await check('won', 'Next: none', START_WAVE_TEXT);
  await page.evaluate(id => window.__tarpit!.startLevel!(id), level.id);
  await api(page, t => { t.state().lives = 0; t.state().phase = 'lost'; t.step(0); });
  await check('lost', '', START_WAVE_TEXT);
  await checkSize(page);
  return states;
}

function matrix(modern = false) {
  const heights = modern ? NEW_PHONE_HEIGHTS : [844, 664];
  for (const height of heights) {
    for (const mode of ['normal', 'fixed Caslon', 'fixed fallback', 'wide text']) {
      for (const level of levels) {
        test(`taxed HUD labels fit at 390x${height} (${mode}, ${Object.keys(level.taxes!).length} taxes)`, async ({ page }) => {
          test.setTimeout(60_000);
          await page.setViewportSize({ width: 390, height });
          if (mode === 'fixed Caslon' || mode === 'fixed fallback') await useTallFontMetrics(page, mode === 'fixed fallback');
          const normal = await exerciseHud(page, level, mode === 'fixed fallback');
          if (mode !== 'wide text') return;

          await useWideFontMetrics(page, hasNewInterface(page) ? platformWideFactor : undefined);
          const wide = await exerciseHud(page, level, false);
          for (const [state, labels] of wide.entries()) {
            const reference = normal[state];
            expect(labels.map(l => [l.id, l.text])).toEqual(reference.map(l => [l.id, l.text]));
            for (const [i, { id, text, size }] of labels.entries()) {
              const message = `${id} “${text}” normal ${reference[i].size} vs wide ${size} CSS px`;
              expect.soft(Math.abs(size - reference[i].size), message).toBeLessThanOrEqual(0.01);
            }
          }
        });
      }
    }
  }

  for (const height of modern ? heights : [664]) {
    test(`a long aim instruction fits the taxed strip with the fallback face at 390×${height}`, async ({ page }) => {
      await useTallFontMetrics(page, true);
      await page.setViewportSize({ width: 390, height });
      const level = levels[1];
      await openPaintedLevel(page, level);
      await api(page, t => { t.startWave(); t.step(1); });
      for (const touch of [true, false]) {
        await press(page, 'special', touch);
        await press(page, 'special:fireArrows', touch);
        const aim = await api(page, t => t.hudText().next);
        expect(aim).toContain('Fire Arrows');
        await checkHud(page, level, 'wave', aim);
        await press(page, 'special', touch);
        expect(await api(page, t => t.hudText().next)).toMatch(/^Next:/);
      }
    });
  }
}

matrix();
newInterfaceChecks(() => matrix(true));

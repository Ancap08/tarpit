import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene.ts';
import type { EnemyType, TowerType } from '../../src/sim/types.ts';
import { landscape, origin, phone, press, run } from './m47Browser.ts';
import { waitForFirstScreen } from '../../e2e/title.ts';

const output = 'docs/review/m52c2b';
const short = { ...phone, viewport: { width: 390, height: 664 } };
const videoMs = 12_000;
type Profile = typeof phone | typeof landscape | typeof short;
type Rank = { road: 'east' | 'west'; type: EnemyType; count: number; hp: number; back?: number; firstId?: number };
type Crew = [number, TowerType];

async function open(page: Page, level: number): Promise<void> {
  await page.goto(origin + '/?act3=1&perf=1&keepTier=2&keep=' + level);
  await page.waitForFunction(() => !!window.__tarpit?.keep?.());
  await page.addStyleTag({ content: 'body > output { visibility: hidden }' });
  await page.evaluate(async () => {
    window.__tarpit!.setMuted(true);
    await document.fonts.ready;
  });
}

async function withPage(browser: Browser, profile: Profile, capture: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext(profile);
  try { await capture(await context.newPage()); } finally { await context.close(); }
}

async function still(page: Page, name: string): Promise<void> {
  const size = page.viewportSize()!;
  await page.screenshot({ path: join(output, `${size.width}x${size.height}-${name}.jpg`), scale: 'css', quality: 94 });
}

/** Front ranks share a real simulation distance. Don't widen the windows or fake the visible effect. */
async function stageWave(page: Page, ranks: Rank[], crew: Crew[] = [], wave = 1) {
  return page.evaluate(({ ranks, crew, wave }) => {
    const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const state = s.state;
    const map = state.map;
    if (!state.gate || !state.level) throw new Error('Review fixture needs a siege gate and level.');
    for (const [site, tower] of crew) {
      if (!s.build(map.buildSites![site], tower).ok) throw new Error('Review tower placement was refused.');
    }
    state.wave = wave - 1;
    if (!s.startWave().ok) throw new Error('Review wave did not start.');
    state.spawnedPerGroup = state.level.waves[wave - 1].groups.map(group => group.count);
    const length = (points: typeof map.path) => points.slice(1).reduce((sum, next, i) =>
      sum + Math.hypot(next.x - points[i].x, next.y - points[i].y), 0);
    const gate = state.gate;
    const roadLengths = Object.fromEntries((map.otherRoads ?? []).map(road => [
      road.id, length([...road.approach, ...map.path.slice(road.joinIndex)]),
    ]));
    const sill = (road: Rank['road']) => road === map.mainRoad ? gate.distance : roadLengths[road] - gate.yardLength;
    state.enemies.splice(0);
    for (const rank of ranks) {
      if (rank.firstId !== undefined) state.nextEnemyId = rank.firstId;
      const distance = sill(rank.road) - (rank.back ?? 0);
      if (!Number.isFinite(distance)) throw new Error('Review rank used a closed road.');
      for (let i = 0; i < rank.count; i++) {
        state.enemies.push({
          id: state.nextEnemyId++, road: rank.road, type: rank.type, distance,
          hp: rank.hp * (i % 7 === 6 ? .85 : 1), maxHp: rank.hp, slow: 0, slowTicksLeft: 0,
        });
      }
    }
    s.redraw();
    return { east: sill('east'), west: sill('west'), started: s['clock'].nowMs };
  }, { ranks, crew, wave });
}

function crowdRanks(primary: Rank['road'], both: boolean): Rank[] {
  const other = primary === 'west' ? 'east' : 'west';
  return [
    { road: primary, type: 'goblin', count: both ? 12 : 19, hp: 26 },
    { road: both ? other : primary, type: 'shieldbearer', count: 6, hp: 80 },
    { road: primary, type: 'troll', count: 3, hp: 950 },
    ...(both ? [{ road: other, type: 'wolf', count: 5, hp: 24 } as Rank] : []),
  ];
}

async function clockAt(page: Page, when: number): Promise<void> {
  await page.waitForFunction(when => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene['clock'].nowMs >= when;
  }, when, { timeout: 8_000 });
}

async function verifyCrowd(page: Page, sill: { east: number; west: number }, min: number): Promise<void> {
  const count = await page.evaluate(sill => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.enemies.filter(enemy =>
      (enemy.road === 'east' || enemy.road === 'west') && Math.abs(enemy.distance - sill[enemy.road]) < 1e-6).length;
  }, { east: Number.isFinite(sill.east) ? sill.east : -1, west: Number.isFinite(sill.west) ? sill.west : -1 });
  assert.ok(count >= min, `Only ${count} held at the sill`);
  console.log('Held at the true sill', count);
}

async function windowSequence(page: Page, captures: boolean): Promise<void> {
  const stage = await stageWave(page, crowdRanks('west', false));
  await clockAt(page, stage.started + 1900);
  await verifyCrowd(page, stage, 28);
  if (captures) await still(page, 'window-lit');
  if (!captures) await clockAt(page, stage.started + 3500);
  await press(page, 'window:0', true);
  const fired = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return { now: scene['clock'].nowMs, used: scene.state.windows![0].used,
      hits: scene.state.enemies.filter(enemy => enemy.feathered).length };
  });
  assert.ok(fired.used && fired.hits >= 28, JSON.stringify(fired));
  console.log('Window targets feathered by an actual touch', fired.hits);
  if (captures) {
    await clockAt(page, fired.now + 685);
    await still(page, 'window-mid-shake');
    await clockAt(page, fired.now + 1430);
    await still(page, 'window-spent');
  }
}

async function skyCrowd(page: Page, level: number, sky: string): Promise<void> {
  await open(page, level);
  const stage = await stageWave(page, crowdRanks('west', level !== 22), [[3, 'musketeer'], [6, 'musketeer']]);
  await clockAt(page, stage.started + 1580);
  await verifyCrowd(page, stage, 20);
  await still(page, `gate-crowd-${sky}`);
}

async function scaleProof(page: Page): Promise<void> {
  await open(page, 25);
  const stage = await stageWave(page, [{ road: 'west', type: 'troll', count: 1, hp: 950, firstId: 4 }]);
  await clockAt(page, stage.started + 1580);
  await still(page, 'barbican-and-toll-troll');
}

async function ramSequence(page: Page, captures: boolean): Promise<void> {
  const stage = await stageWave(page, [
    { road: 'west', type: 'ram', count: 1, hp: 450, back: 132 },
    { road: 'east', type: 'grumblemaw', count: 1, hp: 7000, back: 218 },
  ], [], 6);
  await clockAt(page, stage.started + 1650);
  if (captures) await still(page, 'ram-arriving');
  await page.waitForFunction(west => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.enemies.some(enemy => enemy.type === 'ram' && Math.abs(west - enemy.distance) < 1e-6);
  }, stage.west, { timeout: 8_000 });
  const contact = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene['clock'].nowMs;
  });
  await clockAt(page, contact + 370);
  if (captures) await still(page, 'ram-at-gate');
  await clockAt(page, contact + 1360);
  await press(page, 'window:1', true);
  const cast = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const ram = scene.state.enemies.find(enemy => enemy.type === 'ram')!;
    return { used: scene.state.windows![1].used, feathered: ram.feathered, running: ram.runTicksLeft,
      kingBehind: scene.state.enemies.some(enemy => enemy.type === 'grumblemaw'), now: scene['clock'].nowMs };
  });
  assert.ok(cast.used && cast.feathered && cast.running && cast.kingBehind, JSON.stringify(cast));
  console.log('Ram feathered and rolling back with King present');
  if (captures) {
    await clockAt(page, cast.now + 770);
    await still(page, 'ram-feathered');
  }
}

async function quartering(page: Page): Promise<void> {
  await open(page, 24);
  await still(page, 'quartering-before');
  await press(page, 'wallSite', true);
  const paid = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return { open: scene.state.wallSiteTax === undefined, gold: scene.state.gold, now: scene['clock'].nowMs };
  });
  assert.equal(paid.open, true);
  assert.equal(paid.gold, 205);
  await clockAt(page, paid.now + 735);
  await still(page, 'quartering-departing');
  await clockAt(page, paid.now + 1580);
  await still(page, 'quartering-paid');
}

async function surveyAndRepair(page: Page): Promise<void> {
  await open(page, 23);
  await still(page, 'royal-survey');
  const damaged = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const gate = scene.state.gate!;
    gate.hp = Math.floor(gate.maxHp * .60);
    scene.redraw();
    return scene['clock'].nowMs;
  });
  await clockAt(page, damaged + 180);
  await still(page, 'gate-shudder');
  await clockAt(page, damaged + 575);
  await press(page, 'repair', true);
  const repaired = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const gate = scene.state.gate!;
    return { fixed: scene.state.boughtRepair && gate.hp > gate.maxHp * 2 / 3, now: scene['clock'].nowMs };
  });
  assert.equal(repaired.fixed, true);
  await clockAt(page, repaired.now + 450);
  await still(page, 'gate-repair');
}

async function fall(page: Page): Promise<void> {
  await open(page, 25);
  const stage = await stageWave(page, [
    { road: 'west', type: 'goblin', count: 8, hp: 29, back: 155 },
    { road: 'east', type: 'troll', count: 2, hp: 950 },
    { road: 'east', type: 'shieldbearer', count: 6, hp: 84, back: 120 },
  ], [[0, 'musketeer'], [1, 'mortar'], [3, 'longbow']]);
  await clockAt(page, stage.started + 1600);
  const born = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.state.gate!.hp = 1;
    scene.advance(1);
    if (!scene.state.gate!.fallen) throw new Error('The crowd has not broken the fixture gate.');
    return scene['clock'].nowMs;
  });
  await clockAt(page, born + 210);
  await still(page, 'gate-falling');
  await clockAt(page, born + 1230);
  const active = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.gate!.lastStandTicksLeft;
  });
  assert.ok(active > 0);
  await still(page, 'last-stand');
}

async function notice(page: Page): Promise<void> {
  await open(page, 23);
  await stageWave(page, [{ road: 'east', type: 'troll', count: 1, hp: 950 }], [[4, 'mortar']]);
  await page.waitForFunction(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const fx = scene['fx']!;
    return scene.cameras.main.zoomY === 1.5 && fx['projectiles'].some(shot => shot?.tower === 'mortar' &&
      (fx['gameMs'] - shot.bornMs) / shot.travelMs > .24);
  }, null, { timeout: 9_000 });
  await still(page, 'notice-shell');
}

async function ending(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const wins = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 3]));
    localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars: wins }));
    localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct"]');
    localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct"]');
    localStorage.setItem('tarpit.seenSiegeTips', '[25]');
  });
  await page.goto(origin + '/?act3=1&test=1');
  await waitForFirstScreen(page, { showStory: true });
  const touch = page.viewportSize()!.width < 480;
  await press(page, 'title:campaign', touch);
  await press(page, 'title:stop:25', touch);
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game');
  await page.evaluate(() => {
    const api = window.__tarpit!;
    const state = api.state!();
    state.wave = state.level!.waves.length;
    state.phase = 'won';
    api.step!(0);
  });
  await press(page, 'menu', touch);
  await page.waitForFunction(() => window.__tarpit?.screen?.() === 'siegeEnding' && window.__tarpit.titleReady());
  await still(page, 'ending');
}

async function film(browser: Browser, level: number, name: string, stage: (page: Page) => Promise<void>): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), 'tarpit-siege-film-'));
  const context = await browser.newContext({ ...phone, recordVideo: { dir: scratch, size: phone.viewport } });
  try {
    const born = performance.now();
    const page = await context.newPage();
    await open(page, level);
    const begin = performance.now() - born;
    await stage(page);
    const tail = videoMs + begin - (performance.now() - born);
    if (tail > 0) await new Promise<void>(resolve => setTimeout(resolve, tail));
    const video = page.video()!;
    await context.close();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (begin / 1000).toFixed(3), '-i', await video.path(),
      '-an', '-vf', 'fps=30,tpad=stop_mode=clone:stop_duration=1,format=yuv420p',
      '-frames:v', String(30 * videoMs / 1000), '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-movflags', '+faststart', join(output, name + '.mp4')]);
  } finally {
    await context.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

await mkdir(output, { recursive: true });
await run(async browser => {
  if (!process.argv.includes('--films-only')) {
    await withPage(browser, phone, async page => {
      await open(page, 22);
      await windowSequence(page, true);
      await open(page, 25);
      await ramSequence(page, true);
      await quartering(page);
      await surveyAndRepair(page);
      await skyCrowd(page, 22, 'dusk');
      await skyCrowd(page, 23, 'night');
      await skyCrowd(page, 25, 'dawn');
      await scaleProof(page);
      await fall(page);
      await notice(page);
    });
    await withPage(browser, short, async page => {
      await skyCrowd(page, 22, 'dusk');
      await skyCrowd(page, 23, 'night');
      await skyCrowd(page, 25, 'dawn');
    });
    await withPage(browser, phone, ending);
    await withPage(browser, landscape, ending);
  }
  if (!process.argv.includes('--stills-only')) {
    await film(browser, 22, 'window-on-the-gate-crowd', page => windowSequence(page, false));
    await film(browser, 25, 'ram-and-the-king', page => ramSequence(page, false));
  }
});

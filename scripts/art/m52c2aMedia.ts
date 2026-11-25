import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { preview } from 'vite';
import type { GameScene } from '../../src/game/GameScene.ts';
import { landscape, origin, phone, press, run } from './m47Browser.ts';

const output = 'docs/review/m52c2a';
const short = { ...phone, viewport: { width: 390, height: 664 } };
const tablet = { ...landscape, viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true };
type Profile = typeof phone | typeof landscape | typeof tablet;

async function open(page: Page, level: number, query = '&test=1'): Promise<void> {
  await page.goto(origin + '/?act3=1&keep=' + level + query);
  await page.waitForFunction(() => window.__tarpit?.keep?.());
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function withPage(browser: Browser, profile: Profile, capture: (page: Page) => Promise<void>) {
  const context = await browser.newContext(profile);
  try { await capture(await context.newPage()); } finally { await context.close(); }
}

async function still(page: Page, name: string) {
  await page.screenshot({ path: join(output, name + '.jpg'), scale: 'css', quality: 95 });
}

async function conditions(page: Page) {
  await open(page, 21);
  const clip = await page.evaluate(() => {
    const api = window.__tarpit!;
    const gate = api.state!().gate!;
    const point = api.worldToPage(gate.x, gate.y);
    return { x: Math.round(point.x - 46), y: Math.round(point.y - 67), width: 92, height: 80 };
  });
  for (const [i, [fraction, name]] of [[1, 'sound'], [.60, 'cracked'], [.21, 'splintered'], [0, 'open']].entries()) {
    const frame = await page.evaluate(fraction => {
      const api = window.__tarpit!;
      const scene = api.game.scene.getScene('game') as GameScene;
      const gate = api.state!().gate!;
      gate.hp = Math.round(gate.maxHp * Number(fraction));
      gate.fallen = Number(fraction) === 0;
      api.step!(0);
      return scene['keep']!.outerGate!.frame.name;
    }, fraction);
    assert.equal(frame, String(i));
    await page.screenshot({ path: join(output, 'gate-' + name + '.jpg'), clip, quality: 96, scale: 'device' });
  }
}

async function battle(page: Page, name: string) {
  await open(page, 23, '&perf=1&keepTier=2');
  await page.addStyleTag({ content: 'body > output { visibility:hidden }' });
  await page.evaluate(() => window.__tarpit!.setMuted(true));
  const proof = await page.evaluate(() => {
    const api = window.__tarpit!;
    const s = api.game.scene.getScene('game') as GameScene;
    if (!s.build(s.state.map.buildSites![4], 'musketeer').ok) throw Error('Review tower placement refused');
    if (!s.startWave().ok) throw Error('Review wave refused');
    s['clock'].nowMs = 8_000;
    s.advance(850);
    const { gate, map, enemies, tick } = s.state;
    if (!gate || !map.otherRoads?.length) throw Error('No shared siege gate');
    const west = map.otherRoads[0];
    const length = (points: readonly { x: number; y: number }[]) => points.slice(1).reduce((sum, to, i) =>
      sum + Math.hypot(to.x - points[i].x, to.y - points[i].y), 0);
    const join = map.path[west.joinIndex];
    const westDistance = gate.distance - length(map.path.slice(0, west.joinIndex + 1)) + length([...west.approach, join]);
    const held = (road: string, distance: number) => enemies.filter(enemy =>
      enemy.road === road && Math.abs(enemy.distance - distance) < 1e-8).length;
    return { tick, hp: gate.hp, maxHp: gate.maxHp, enemies: enemies.length,
      heldEast: held('east', gate.distance), heldWest: held('west', westDistance) };
  });
  assert.ok(proof.heldEast > 0 && proof.heldWest > 0 && proof.hp < proof.maxHp, JSON.stringify(proof));
  console.log(name, proof);
  await still(page, name);
}

async function film(browser: Browser) {
  const scratch = await mkdtemp(join(tmpdir(), 'tarpit-siege-film-'));
  try {
    const context = await browser.newContext({ ...phone, recordVideo: { dir: scratch, size: phone.viewport } });
    try {
      const page = await context.newPage();
      const born = performance.now();
      await open(page, 23, '');
      const begin = (performance.now() - born) / 1000;
      await page.evaluate(() => window.__tarpit!.setMuted(true));
      await page.waitForFunction(() => (window.__tarpit?.keep?.()?.timeMs ?? 0) > 1900);
      await page.evaluate(() => {
        const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
        for (const [site, tower] of [[6, 'mortar'], [8, 'musketeer'], [9, 'longbow'], [3, 'longbow']] as const) {
          if (!scene.build(scene.state.map.buildSites![site], tower).ok) throw Error('Recording tower placement refused');
        }
        scene.setSpeed(3);
      });
      await press(page, 'startWave', true);
      await page.waitForFunction(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        return s.state.wave === 1 && s.state.phase === 'setup' && s.cameras.main.zoomY === 1.15;
      }, null, { timeout: 60_000 });
      const end = (performance.now() - born) / 1000;
      const video = page.video()!;
      await context.close();
      const span = (end - begin).toFixed(3);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', begin.toFixed(3), '-i', await video.path(), '-an',
        '-vf', `trim=duration=${span},setpts=15/${span}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=0.3,format=yuv420p`,
        '-frames:v', '450', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-movflags', '+faststart',
        join(output, 'level-23-phone.mp4')]);
      console.log(`Level 23 wave 1, ${span} seconds condensed to 15 seconds`);
    } finally { await context.close(); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

await mkdir(output, { recursive: true });
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
if (baseline) {
  const server = await preview({ logLevel: 'error', build: { outDir: baseline },
    preview: { host: '127.0.0.1', port: Number(process.env.PW_PORT), strictPort: true } });
  try {
    const browser = await chromium.launch();
    try {
      await withPage(browser, phone, async page => {
        await open(page, 23);
        await still(page, '390x844-before');
      });
    } finally { await browser.close(); }
  } finally { await server.close(); }
}

await run(async browser => {
  await withPage(browser, phone, async page => {
    for (const level of [21, 22, 23, 24, 25]) {
      await open(page, level);
      await still(page, `390x844-level-${level}`);
    }
    await open(page, 23, '&test=1&keepLightning=1');
    await still(page, '390x844-lightning');
    await conditions(page);
    await battle(page, '390x844-outer-gate-midwave');
  });
  for (const [profile, name] of [[short, '390x664'], [landscape, '960x580'], [tablet, '1024x768']] as const) {
    await withPage(browser, profile, async page => {
      await open(page, 23);
      await still(page, name + '-level-23');
      if (profile === short) await battle(page, '390x664-outer-gate-midwave');
    });
  }
  if (!process.argv.includes('--stills-only')) await film(browser);
});

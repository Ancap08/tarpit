// Demo recording: `npm run demo`. Run by hand, not in CI.
//
// Builds the game, serves dist/ with `vite preview`, and plays it in real time
// (not test mode) in headless Chromium with Playwright's video recording on:
// title click, a Musketeer on cell (7,5) through the build bar (pick, glide
// over the map so the ghost and range follow, click the cell), Start Wave,
// 2x, wave 1, a Cannon on (7,7), wave 2, then a Tar Pit on (10,5). The game
// starts with 100 gold, so the three towers cannot all be bought before
// wave 1; this order is the one (found with the headless sim) that leaves
// enough gold for the Tar Pit after wave 2 (12 lives, 68 gold). Every click
// goes through the real UI: bar and HUD buttons at the rectangles
// window.__tarpit.uiRects() reports, cells at their centres. Then
// the system ffmpeg turns the video into docs/media/tarpit.gif (640 px wide,
// 12 fps, two-pass palette, sped up to fit about 22 s) and a mid-wave still
// docs/media/tarpit.png (960x580).
//
// Needs ffmpeg on PATH or in FFMPEG (default /opt/homebrew/bin/ffmpeg) and
// the Playwright Chromium (`npx playwright install chromium`).

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA = join(ROOT, 'docs', 'media');
const GIF = join(MEDIA, 'tarpit.gif');
const PNG = join(MEDIA, 'tarpit.png');
const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const PORT = 4179;
const URL_BASE = `http://localhost:${PORT}/`;
const VIEW = { width: 960, height: 580 };
/** Target length of the GIF in seconds; the video is sped up to fit. */
const TARGET_SECONDS = 22;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Snapshot {
  phase: string;
  wave: number;
  gold: number;
  lives: number;
  enemies: number;
}

const log = (msg: string) => console.log(`[demo] ${msg}`);

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start at ${url}`);
}

// The running GameScene, reached through window.__tarpit.game (present
// outside test mode). Only reads: the clicks below do all the playing.
function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const s = (window.__tarpit!.game.scene.getScene('game') as unknown as {
      state: { phase: string; wave: number; gold: number; lives: number; enemies: unknown[] };
    }).state;
    return { phase: s.phase, wave: s.wave, gold: s.gold, lives: s.lives, enemies: s.enemies.length };
  });
}

// uiRects() is on window.__tarpit outside test mode too (read-only).
function rects(page: Page): Promise<Record<string, Rect>> {
  return page.evaluate(() => window.__tarpit!.uiRects() as Record<string, Rect>);
}

/** Ui state from the running scene: the bar's pick. */
function pick(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window.__tarpit!.game.scene.getScene('game') as unknown as { uiState(): { pick: string | null } }).uiState().pick,
  );
}

async function clickRect(page: Page, key: string, hoverMs = 0): Promise<void> {
  const r = (await rects(page))[key];
  if (!r) throw new Error(`no UI rect "${key}" on screen`);
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  if (hoverMs) await page.waitForTimeout(hoverMs);
  await page.mouse.click(x, y);
}

/**
 * Pick the tower on the bar, glide over the map so the ghost and its range
 * follow the pointer, click the cell, and clear the pick if it is still
 * active (it clears by itself when the gold left is below the cost).
 */
async function buildAt(page: Page, col: number, row: number, tower: 'musketeer' | 'cannon' | 'tarpit'): Promise<void> {
  const before = await snapshot(page);
  await clickRect(page, `bar:${tower}`, 300);
  await page.waitForTimeout(300);
  const x = col * 32 + 16;
  const y = row * 32 + 16;
  await page.mouse.move(x + 96, y + 64, { steps: 10 });
  await page.waitForTimeout(250);
  await page.mouse.move(x, y, { steps: 14 });
  await page.waitForTimeout(700);
  await page.mouse.click(x, y);
  const after = await snapshot(page);
  if (after.gold >= before.gold) throw new Error(`build ${tower} at (${col},${row}) did not happen (gold ${before.gold})`);
  log(`built ${tower} at (${col},${row}): gold ${before.gold} -> ${after.gold}`);
  await page.waitForTimeout(400);
  if ((await pick(page)) !== null) await clickRect(page, `bar:${tower}`, 200);
  await page.waitForTimeout(300);
}

async function waitFor(page: Page, what: string, ok: (s: Snapshot) => boolean, timeoutMs = 60000): Promise<Snapshot> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshot(page);
    if (ok(s)) return s;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(s)}`);
    await page.waitForTimeout(100);
  }
}

async function main(): Promise<void> {
  log('building dist/');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const work = mkdtempSync(join(tmpdir(), 'tarpit-demo-'));
  try {
    await waitForServer(URL_BASE);
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      recordVideo: { dir: work, size: VIEW },
    });
    const page = await context.newPage();
    const t0 = Date.now();
    const at = () => (Date.now() - t0) / 1000;

    await page.goto(URL_BASE);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
    await page.waitForTimeout(1500);
    const start = Math.max(0, at() - 1);
    await page.mouse.click(VIEW.width / 2, VIEW.height / 2);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    await page.waitForTimeout(600);

    await buildAt(page, 7, 5, 'musketeer');
    await clickRect(page, 'startWave', 300);
    await page.waitForTimeout(800);
    await clickRect(page, 'speed', 300);
    let s = await waitFor(page, 'wave 1 to end', (x) => x.phase !== 'wave');
    log(`wave 1 done: lives ${s.lives}, gold ${s.gold}`);
    await page.waitForTimeout(500);

    await buildAt(page, 7, 7, 'cannon');
    await clickRect(page, 'startWave', 300);
    // The still: a frame with five or more enemies out just after the Cannon
    // fired, so its splash is on screen. state.shots holds only the latest
    // tick's shots, so this watches the Cannon's cooldown jump back up.
    await page.waitForFunction(
      () => {
        const s = (window.__tarpit!.game.scene.getScene('game') as unknown as {
          state: { enemies: unknown[]; towers: { type: string; cooldownTicks: number }[] };
        }).state;
        const w = window as unknown as { demoMaxCooldown?: number };
        const cannon = s.towers.find((t) => t.type === 'cannon');
        if (!cannon) return false;
        w.demoMaxCooldown = Math.max(w.demoMaxCooldown ?? 0, cannon.cooldownTicks);
        return s.enemies.length >= 5 && cannon.cooldownTicks >= w.demoMaxCooldown - 4;
      },
      undefined,
      { polling: 'raf', timeout: 60000 },
    );
    await page.screenshot({ path: PNG });
    log('still saved');
    s = await waitFor(page, 'wave 2 to end', (x) => x.phase !== 'wave');
    log(`wave 2 done: lives ${s.lives}, gold ${s.gold}`);
    await page.waitForTimeout(400);
    if (s.gold >= 60) await buildAt(page, 10, 5, 'tarpit');
    else log(`skipped the Tar Pit: only ${s.gold} gold`);
    await page.waitForTimeout(2500);
    const end = at();

    const video = page.video();
    await context.close();
    await browser.close();
    if (!video) throw new Error('no video recorded');
    const webm = await video.path();

    const span = end - start;
    const factor = Math.max(1, span / TARGET_SECONDS);
    log(`recorded ${span.toFixed(1)} s of play; speeding up ${factor.toFixed(2)}x`);
    const palette = join(work, 'palette.png');
    const filters = `setpts=PTS/${factor.toFixed(4)},fps=12,scale=640:-1:flags=lanczos`;
    const trim = ['-ss', start.toFixed(2), '-t', span.toFixed(2)];
    mkdirSync(MEDIA, { recursive: true });
    execFileSync(FFMPEG, ['-y', '-v', 'error', ...trim, '-i', webm, '-vf', `${filters},palettegen=stats_mode=diff`, palette]);
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', ...trim, '-i', webm, '-i', palette,
      '-lavfi', `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      GIF,
    ]);
    const mb = statSync(GIF).size / 1024 / 1024;
    log(`wrote ${GIF} (${mb.toFixed(2)} MB, about ${(span / factor).toFixed(1)} s) and ${PNG}`);
    if (mb >= 4) throw new Error('GIF is 4 MB or more; lower TARGET_SECONDS or the frame rate');
  } finally {
    server.kill();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();

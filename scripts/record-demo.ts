// Demo recording: `npm run demo`. Run by hand, not in CI.
//
// Builds the game, serves dist/ with `vite preview`, and plays it in real time
// (not test mode) in headless Chromium with Playwright's video recording on.
// The play shows v2: [Play] on the title menu (Normal); Longbow picked on the build bar and placed
// on (9,5) and (9,4) inside the first U (the pick stays active for the second
// one, then clears itself at 20 gold); Start Wave, 2x, wave 1; a Tar Pit on
// (14,10); wave 2; a Fire Pot on (14,9) beside it, so tarred enemies burn at
// double rate on that stretch; wave 3; then wave 4 until a Mortar is
// affordable, and a Mortar on (17,6) with its ghost, range and dashed minimum
// range shown on the way in. These are the combo build's first five
// purchases (COMBO_PLAN in src/sim/headless.ts). The game starts with 100
// gold, so the timing comes from a headless run: 77 gold after wave 1 (Tar
// Pit), 90 after wave 2 (Fire Pot), 107 after wave 3, and 110 for the Mortar
// about 180 ticks into wave 4. Every click goes through the real UI: bar and
// HUD buttons at the rectangles window.__tarpit.uiRects() reports, cells at
// their centres. Then the system ffmpeg turns the video into
// docs/media/tarpit.gif (640 px wide, 12 fps, two-pass palette, sped up to
// fit about TARGET_SECONDS) and a wave 3 still docs/media/tarpit.png
// (960x580) with the Tar Pit and Fire Pot both on a tarred, burning enemy.
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
// PW_PORT, as for the e2e tests (playwright.config.ts); its own default
// keeps a demo off the e2e server's port 4173.
const PORT = Number(process.env.PW_PORT ?? 4179);
const URL_BASE = `http://localhost:${PORT}/`;
const VIEW = { width: 960, height: 580 };
/** Target length of the GIF in seconds; the video is sped up to fit. */
const TARGET_SECONDS = 25;

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

type TowerType = 'musketeer' | 'cannon' | 'tarpit' | 'longbow' | 'mortar' | 'firepot';

/**
 * Pick the tower on the bar, glide over the map so the ghost and its range
 * follow the pointer, and click each cell in turn (the pick stays active
 * between them). Then clear the pick if it is still active (it clears by
 * itself when the gold left is below the cost). `ghostMs` is how long the
 * ghost rests on the first cell before the click.
 */
async function buildAt(page: Page, tower: TowerType, cells: [number, number][], ghostMs = 700): Promise<void> {
  await clickRect(page, `bar:${tower}`, 300);
  await page.waitForTimeout(300);
  for (const [i, [col, row]] of cells.entries()) {
    const before = await snapshot(page);
    const x = col * 32 + 16;
    const y = row * 32 + 16;
    if (i === 0) {
      await page.mouse.move(x + 96, y + 64, { steps: 10 });
      await page.waitForTimeout(250);
    }
    await page.mouse.move(x, y, { steps: 14 });
    await page.waitForTimeout(i === 0 ? ghostMs : 500);
    await page.mouse.click(x, y);
    const after = await snapshot(page);
    if (after.gold >= before.gold) throw new Error(`build ${tower} at (${col},${row}) did not happen (gold ${before.gold})`);
    log(`built ${tower} at (${col},${row}): gold ${before.gold} -> ${after.gold}`);
    await page.waitForTimeout(400);
  }
  if ((await pick(page)) !== null) await clickRect(page, `bar:${tower}`, 200);
  await page.waitForTimeout(300);
}

/**
 * True on the frame where an enemy is both tarred and burning and the Fire
 * Pot has just fired (its cooldown jumped back up within the last few
 * ticks), so the Fire Pot's shot, the Tar Pit and the enemy's two rings are
 * on screen together. state.shots holds only the latest tick's shots, so
 * this watches the cooldown instead.
 */
function comboFrame(page: Page, timeoutMs: number): Promise<boolean> {
  return page
    .waitForFunction(
      () => {
        const s = (window.__tarpit!.game.scene.getScene('game') as unknown as {
          state: {
            enemies: { slowTicksLeft: number; burnTicksLeft?: number }[];
            towers: { type: string; cooldownTicks: number }[];
          };
        }).state;
        const w = window as unknown as { demoMaxCooldown?: number };
        const pot = s.towers.find((t) => t.type === 'firepot');
        if (!pot) return false;
        w.demoMaxCooldown = Math.max(w.demoMaxCooldown ?? 0, pot.cooldownTicks);
        const combo = s.enemies.some((e) => e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0);
        return combo && pot.cooldownTicks >= w.demoMaxCooldown - 6;
      },
      undefined,
      { polling: 'raf', timeout: timeoutMs },
    )
    .then(
      () => true,
      () => false,
    );
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
    await clickRect(page, 'title:play', 300);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    await page.waitForTimeout(600);

    await buildAt(page, 'longbow', [
      [9, 5],
      [9, 4],
    ]);
    await clickRect(page, 'startWave', 300);
    await page.waitForTimeout(800);
    await clickRect(page, 'speed', 300);
    let s = await waitFor(page, 'wave 1 to end', (x) => x.phase !== 'wave');
    log(`wave 1 done: lives ${s.lives}, gold ${s.gold}`);
    await page.waitForTimeout(500);

    await buildAt(page, 'tarpit', [[14, 10]]);
    await clickRect(page, 'startWave', 300);
    s = await waitFor(page, 'wave 2 to end', (x) => x.phase !== 'wave');
    log(`wave 2 done: lives ${s.lives}, gold ${s.gold}`);
    await page.waitForTimeout(500);

    await buildAt(page, 'firepot', [[14, 9]]);
    await clickRect(page, 'startWave', 300);
    // The still: the Tar Pit and the Fire Pot both on a tarred, burning
    // enemy. The headless run has the first one at wave 3 tick 3164.
    if (await comboFrame(page, 60000)) {
      await page.screenshot({ path: PNG });
      log('still saved');
    } else {
      throw new Error('no frame with a tarred, burning enemy in wave 3');
    }
    s = await waitFor(page, 'wave 3 to end', (x) => x.phase !== 'wave');
    log(`wave 3 done: lives ${s.lives}, gold ${s.gold}`);
    await page.waitForTimeout(500);

    if (s.gold >= 110) {
      await buildAt(page, 'mortar', [[17, 6]], 1200);
    } else {
      // Not affordable between waves 3 and 4: start wave 4 and build the
      // Mortar mid-wave once the bounties reach 110.
      await clickRect(page, 'startWave', 300);
      await waitFor(page, '110 gold for the Mortar', (x) => x.gold >= 110 || x.phase !== 'wave');
      await buildAt(page, 'mortar', [[17, 6]], 1200);
    }
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

// Demo recording: `npm run demo`. Run by hand, not in CI.
//
// Builds the game, serves dist/ with `vite preview`, and writes the README
// media into docs/media:
//
// 1. tarpit.gif and tarpit.png: real-time play (not test mode, WebGL) in
//    headless Chromium with Playwright's video recording on. Every click and
//    drag goes through the real UI: title and HUD buttons at the rectangles
//    window.__tarpit.uiRects() reports, map cells at their centres. The play
//    (milestone 29, v4) on Meadow, Normal:
//    - the title menu with its map row; Meadow and Normal clicked, then Play;
//    - a Longbow dragged from the build bar onto (11,7) (ghost and range on
//      the way in), then dragged on to (9,5) while it is still free to move
//      (planning phase); a Tar Pit dragged onto (6,4) by the first climb;
//    - Start Wave, 2x, wave 1 (one Goblin every 2.5 s, about 26 s at 2x);
//    - Start Wave for wave 2; at wave tick 490 a Powder Keg aimed at
//      (172,125), where four Goblins bunch on the first climb;
//    - a Fire Pot dragged onto (6,5), beside the Tar Pit, once gold allows;
//      tarred Goblins burn at double rate there;
//    - "Call next" pressed once, as soon as it is offered (wave 2's last
//      spawn), which starts wave 3;
//    - the Longbow's panel opened and held so its "Kills" line can be read.
//    Cells and ticks come from a headless run of the same plan
//    (milestone 29 DEVLOG): 100 gold buys the Longbow and the Tar Pit, wave
//    1 ends with 65 gold and 20 lives, the keg kills 4 Goblins at any wave
//    tick from 485 to 510, gold reaches 70 for the Fire Pot right after it,
//    and wave 2's last spawn is wave tick 1674. tarpit.png (960x580) is the
//    first wave 2 frame after the Fire Pot is built where a Goblin is tarred
//    and burning and the Fire Pot has just fired.
//    ffmpeg turns the video into a 640 px wide, 12 fps, two-pass palette GIF
//    (milestone 34: lightly denoised, 128 colours),
//    sped up to fit about TARGET_SECONDS.
// 2. tarpit-riverbend.png and tarpit-boss.png: test mode (?test=1, Canvas,
//    frozen time and walk frames), played by the comboBuild script through
//    the scene's actions (window.__tarpit.runScript): Riverbend, Normal,
//    wave 7, 1440 ticks in; Meadow, Normal, wave 10, 5263 ticks in, the
//    boss bar frame that src/sim/boss-frame.test.ts pins.
//
// Needs ffmpeg on PATH or in FFMPEG (default /opt/homebrew/bin/ffmpeg) and
// the Playwright Chromium (`npx playwright install chromium`).

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA = join(ROOT, 'docs', 'media');
const GIF = join(MEDIA, 'tarpit.gif');
const PNG = join(MEDIA, 'tarpit.png');
const PNG_RIVERBEND = join(MEDIA, 'tarpit-riverbend.png');
const PNG_BOSS = join(MEDIA, 'tarpit-boss.png');
const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
// PW_PORT, as for the e2e tests (playwright.config.ts); its own default
// keeps a demo off the e2e server's port 4173.
const PORT = Number(process.env.PW_PORT ?? 4179);
const URL_BASE = `http://localhost:${PORT}/`;
const VIEW = { width: 960, height: 580 };
/** Target length of the GIF in seconds; the video is sped up to fit. */
const TARGET_SECONDS = 25;
/** The GIF must stay under this size. */
const MAX_GIF_MB = 6;

/** The plan's cells (col, row) and wave 2 ticks, from the headless run. */
const LONGBOW_DROP: Cell = [11, 7];
const LONGBOW_CELL: Cell = [9, 5];
const TARPIT_CELL: Cell = [6, 4];
const FIREPOT_CELL: Cell = [6, 5];
const KEG_WAVE_TICK = 490;
const KEG_POINT = { x: 172, y: 125 };

type Cell = [number, number];
type TowerType = 'musketeer' | 'cannon' | 'tarpit' | 'longbow' | 'mortar' | 'firepot';
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Snapshot {
  phase: string;
  wave: number;
  waveTick: number;
  gold: number;
  lives: number;
  enemies: number;
  towers: string[];
}

const log = (msg: string) => console.log(`[demo] ${msg}`);
const centre = ([col, row]: Cell) => ({ x: col * 32 + 16, y: row * 32 + 16 });

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
      state: {
        phase: string;
        wave: number;
        waveTick: number;
        gold: number;
        lives: number;
        enemies: unknown[];
        towers: { type: string; cell: { col: number; row: number }; locked: boolean }[];
      };
    }).state;
    return {
      phase: s.phase,
      wave: s.wave,
      waveTick: s.waveTick,
      gold: s.gold,
      lives: s.lives,
      enemies: s.enemies.length,
      towers: s.towers.map((t) => `${t.type}(${t.cell.col},${t.cell.row})${t.locked ? '' : ' unlocked'}`),
    };
  });
}

// uiRects() is on window.__tarpit outside test mode too (read-only).
function rects(page: Page): Promise<Record<string, Rect>> {
  return page.evaluate(() => window.__tarpit!.uiRects() as Record<string, Rect>);
}

/** Ui state from the running scene (read-only). */
function uiState(page: Page): Promise<{
  pick: string | null;
  panelOpen: boolean;
  special: { charges: number; aiming: string | null };
  callEarly: { available: boolean; bonus: number };
}> {
  return page.evaluate(
    () =>
      (window.__tarpit!.game.scene.getScene('game') as unknown as {
        uiState(): {
          pick: string | null;
          panelOpen: boolean;
          special: { charges: number; aiming: string | null };
          callEarly: { available: boolean; bonus: number };
        };
      }).uiState(),
  );
}

async function rectCentre(page: Page, key: string): Promise<{ x: number; y: number }> {
  const r = (await rects(page))[key];
  if (!r) throw new Error(`no UI rect "${key}" on screen`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function clickRect(page: Page, key: string, hoverMs = 0): Promise<void> {
  const { x, y } = await rectCentre(page, key);
  await page.mouse.move(x, y, { steps: 8 });
  if (hoverMs) await page.waitForTimeout(hoverMs);
  await page.mouse.click(x, y);
}

/**
 * Press a tower's build bar button and drag it onto `cell`: the ghost and
 * its range follow the pointer over the map and rest on the cell for
 * `restMs` before the release builds there. Throws if nothing was built.
 */
async function dragFromBar(page: Page, tower: TowerType, cell: Cell, restMs = 700): Promise<void> {
  const before = await snapshot(page);
  const bar = await rectCentre(page, `bar:${tower}`);
  const to = centre(cell);
  await page.mouse.move(bar.x, bar.y, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.move(to.x + 48, to.y + 72, { steps: 16 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(restMs);
  await page.mouse.up();
  const after = await snapshot(page);
  if (after.gold >= before.gold) throw new Error(`drag ${tower} onto (${cell}) built nothing (gold ${before.gold})`);
  log(`dragged ${tower} onto (${cell}) at wave ${after.wave} tick ${after.waveTick}: gold ${before.gold} -> ${after.gold}`);
  // The pick stays after a drag; clear it so the next click on the map is plain.
  if ((await uiState(page)).pick !== null) await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/** Drag the unlocked tower on `from` to `to` (planning phase: free). */
async function dragTower(page: Page, from: Cell, to: Cell): Promise<void> {
  const a = centre(from);
  const b = centre(to);
  await page.mouse.move(a.x, a.y, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 20 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  const s = await snapshot(page);
  const moved = s.towers.some((t) => t.includes(`(${to[0]},${to[1]})`)) && !s.towers.some((t) => t.includes(`(${from[0]},${from[1]})`));
  if (!moved) throw new Error(`move (${from}) -> (${to}) did not happen: ${s.towers.join(', ')}`);
  log(`moved the tower on (${from}) to (${to}): ${s.towers.join(', ')}, gold ${s.gold}`);
  await page.waitForTimeout(400);
}

/** Wait until the running wave's tick reaches `tick` (or the wave ends). */
async function waitForWaveTick(page: Page, tick: number, timeoutMs = 60000): Promise<void> {
  await page.waitForFunction(
    (t) => {
      const s = (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { phase: string; waveTick: number } }).state;
      return s.phase !== 'wave' || s.waveTick >= t;
    },
    tick,
    { polling: 'raf', timeout: timeoutMs },
  );
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
    await page.waitForTimeout(50);
  }
}

/** Part 1: the real-time recording. Returns the video file and the span of play to keep. */
async function recordPlay(browser: Browser, work: string): Promise<{ webm: string; start: number; end: number }> {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: work, size: VIEW },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;

  await page.goto(URL_BASE);
  // The title is drawn and takes clicks (milestone 26 follow-up; e2e/title.ts).
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  await page.waitForTimeout(800);
  const start = Math.max(0, at() - 0.5);
  await page.waitForTimeout(2500);
  await clickRect(page, 'title:freePlay', 400);
  await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
  // Meadow and Normal are preselected; clicking them only selects.
  await clickRect(page, 'title:map:meadow', 500);
  await clickRect(page, 'title:normal', 400);
  await clickRect(page, 'title:play', 400);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await page.waitForTimeout(600);

  // Planning phase: drag a Longbow in, move it, drag a Tar Pit in.
  await dragFromBar(page, 'longbow', LONGBOW_DROP);
  await dragTower(page, LONGBOW_DROP, LONGBOW_CELL);
  await dragFromBar(page, 'tarpit', TARPIT_CELL);

  await clickRect(page, 'startWave', 300);
  await page.waitForTimeout(500);
  await clickRect(page, 'speed', 300);
  let s = await waitFor(page, 'wave 1 to end', (x) => x.phase !== 'wave');
  log(`wave 1 done: lives ${s.lives}, gold ${s.gold}`);
  await page.waitForTimeout(400);

  await clickRect(page, 'startWave', 300);
  // Powder Keg: one special is unlocked, so the Special button selects it
  // and the circle follows the mouse; the mouse fires on the press.
  await waitForWaveTick(page, KEG_WAVE_TICK - 120);
  await clickRect(page, 'special', 200);
  await page.mouse.move(KEG_POINT.x + 60, KEG_POINT.y + 60, { steps: 6 });
  await page.mouse.move(KEG_POINT.x, KEG_POINT.y, { steps: 12 });
  await waitForWaveTick(page, KEG_WAVE_TICK);
  const beforeKeg = await snapshot(page);
  await page.mouse.click(KEG_POINT.x, KEG_POINT.y);
  const afterKeg = await snapshot(page);
  if ((await uiState(page)).special.charges !== 0) throw new Error('the Powder Keg did not fire');
  log(`keg at wave 2 tick ${beforeKeg.waveTick}: gold ${beforeKeg.gold} -> ${afterKeg.gold}, enemies ${beforeKeg.enemies} -> ${afterKeg.enemies}`);
  await page.waitForTimeout(600);

  await waitFor(page, '70 gold for the Fire Pot', (x) => x.gold >= 70 || x.phase !== 'wave');
  await dragFromBar(page, 'firepot', FIREPOT_CELL);
  if (await comboFrame(page, 30000)) {
    await page.screenshot({ path: PNG });
    const c = await snapshot(page);
    log(`still saved at wave ${c.wave} tick ${c.waveTick}`);
  } else {
    throw new Error('no frame with a tarred, burning enemy in wave 2');
  }

  // Call next, once, when it is offered (after wave 2's last spawn).
  await page.waitForFunction(
    () =>
      (window.__tarpit!.game.scene.getScene('game') as unknown as { uiState(): { callEarly: { available: boolean } } }).uiState()
        .callEarly.available,
    undefined,
    { polling: 'raf', timeout: 60000 },
  );
  const call = await uiState(page);
  const beforeCall = await snapshot(page);
  await clickRect(page, 'startWave', 500);
  const afterCall = await snapshot(page);
  if (afterCall.wave !== beforeCall.wave + 1) throw new Error(`Call next did not start wave ${beforeCall.wave + 1}`);
  log(`called wave ${afterCall.wave} at wave ${beforeCall.wave} tick ${beforeCall.waveTick} (+${call.callEarly.bonus}): gold ${beforeCall.gold} -> ${afterCall.gold}, lives ${afterCall.lives}`);
  await page.waitForTimeout(1500);

  // The Longbow's panel, held long enough to read its Kills line.
  const bow = centre(LONGBOW_CELL);
  await page.mouse.move(bow.x, bow.y, { steps: 10 });
  await page.mouse.click(bow.x, bow.y);
  if (!(await uiState(page)).panelOpen) throw new Error('the Longbow panel did not open');
  const kills = await page.evaluate(
    (cell) =>
      (window.__tarpit!.game.scene.getScene('game') as unknown as {
        state: { towers: { cell: { col: number; row: number }; kills: number }[] };
      }).state.towers.find((t) => t.cell.col === cell[0] && t.cell.row === cell[1])?.kills,
    LONGBOW_CELL,
  );
  log(`Longbow panel open: Kills ${kills}`);
  await page.waitForTimeout(4000);
  const end = at();
  s = await snapshot(page);
  log(`end: wave ${s.wave} tick ${s.waveTick}, lives ${s.lives}, gold ${s.gold}, towers ${s.towers.join(', ')}`);

  const video = page.video();
  await context.close();
  if (!video) throw new Error('no video recorded');
  return { webm: await video.path(), start, end };
}

/** Part 2: the test-mode stills. */
async function takeStills(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const open = async () => {
    await page.goto(`${URL_BASE}?test=1`);
    await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
    await page.evaluate(() => document.fonts.ready);
  };

  await open();
  const river = await page.evaluate(async () => {
    const t = window.__tarpit!;
    await t.startGame!('normal', 'riverbend');
    t.runScript!('comboBuild', 7);
    t.startWave!();
    t.step!(1440);
    const s = t.state!();
    return { map: s.map.id, wave: s.wave, enemies: s.enemies.length, towers: s.towers.length, lives: s.lives };
  });
  if (JSON.stringify(river) !== JSON.stringify({ map: 'riverbend', wave: 7, enemies: 14, towers: 9, lives: 18 })) {
    throw new Error(`Riverbend frame changed: ${JSON.stringify(river)}`);
  }
  await settle();
  await page.screenshot({ path: PNG_RIVERBEND });
  log(`Riverbend still: ${JSON.stringify(river)}`);

  await open();
  const boss = await page.evaluate(async () => {
    const t = window.__tarpit!;
    await t.startGame!();
    t.runScript!('comboBuild', 10);
    t.startWave!();
    t.step!(5263);
    return { wave: t.state!().wave, enemies: t.state!().enemies.length, bar: t.hudText!().boss };
  });
  if (boss.wave !== 10 || boss.enemies !== 1 || !boss.bar?.endsWith('3525 / 4000')) throw new Error(`boss frame changed: ${JSON.stringify(boss)}`);
  await settle();
  await page.screenshot({ path: PNG_BOSS });
  log(`boss still: ${JSON.stringify(boss)}`);
  await page.close();
}

function makeGif(webm: string, work: string, start: number, end: number): void {
  const span = end - start;
  const factor = Math.max(1, span / TARGET_SECONDS);
  log(`recorded ${span.toFixed(1)} s of play; speeding up ${factor.toFixed(2)}x`);
  const palette = join(work, 'palette.png');
  // Milestone 34: a light temporal denoise and a 128-colour palette, so the
  // textured ground's video noise does not repaint every GIF frame (6.4 MB
  // without them, against 3.4 MB before the living map).
  const filters = `hqdn3d=0:0:12:12,setpts=PTS/${factor.toFixed(4)},fps=12,scale=640:-1:flags=lanczos`;
  const trim = ['-ss', start.toFixed(2), '-t', span.toFixed(2)];
  mkdirSync(MEDIA, { recursive: true });
  execFileSync(FFMPEG, ['-y', '-v', 'error', ...trim, '-i', webm, '-vf', `${filters},palettegen=stats_mode=diff:max_colors=128`, palette]);
  execFileSync(FFMPEG, [
    '-y', '-v', 'error', ...trim, '-i', webm, '-i', palette,
    '-lavfi', `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    GIF,
  ]);
  const mb = statSync(GIF).size / 1024 / 1024;
  log(`wrote ${GIF} (${mb.toFixed(2)} MB, about ${(span / factor).toFixed(1)} s) and ${PNG}`);
  if (mb >= MAX_GIF_MB) throw new Error(`GIF is ${MAX_GIF_MB} MB or more; lower TARGET_SECONDS or the frame rate`);
}

async function main(): Promise<void> {
  log('building dist/');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const work = mkdtempSync(join(tmpdir(), 'tarpit-demo-'));
  try {
    await waitForServer(URL_BASE);
    const browser = await chromium.launch();
    const { webm, start, end } = await recordPlay(browser, work);
    await takeStills(browser);
    await browser.close();
    makeGif(webm, work, start, end);
  } finally {
    server.kill();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();

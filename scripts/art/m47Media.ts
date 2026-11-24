// PW_PORT=4373 M47_SCRATCH=/path/to/scratch node --experimental-strip-types scripts/art/m47Media.ts
// Two complete level-one games, played through the scene purchase and Start Wave actions.
// The demo recorder's Playwright video + ffmpeg approach, with real-speed excerpts from all six waves.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene';
import { landscape, phone, press, run, start } from './m47Browser.ts';

const output = 'docs/art/showpiece';
const scratch = process.env.M47_SCRATCH;
assert.ok(scratch, 'Set M47_SCRATCH to an existing scratch directory.');
await mkdir(scratch, { recursive: true });
await mkdir(output, { recursive: true });

async function take(browser: Browser, layout: 'phone' | 'landscape', work: string) {
  const touch = layout === 'phone', profile = touch ? phone : landscape;
  const context = await browser.newContext({ ...profile, recordVideo: { dir: work, size: profile.viewport } });
  const page = await context.newPage();
  const origin = performance.now(), seconds = () => (performance.now()-origin) / 1000;
  const clips: [number, number][] = [];
  const still = (name: string) => page.screenshot({ path: join(output,`${layout}-${name}.jpg`), quality: 92, scale: 'css' });
  const cdp = await context.newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const state = () => page.evaluate(() => {
    const api = window.__tarpit!, s = (api.game.scene.getScene('game') as GameScene).state;
    return { wave: s.wave, phase: s.phase, lives: s.lives, tick: s.tick,
      kills: s.towers.reduce((k,t) => k+t.kills,0), detail: api.showpiece?.() };
  });
  try {
    await start(page,'look=showpiece&perf=1&showpieceTier=2',true,touch);
    // Capture the full art on the headless renderer; keep the performance badge out of footage.
    await page.addStyleTag({content:'body > output { visibility: hidden }'});
    assert.equal((await state()).detail?.tier,2);
    const startHeap = await heap();
    const dawn = seconds();
    await still('morning');
    await delay(2600);
    clips.push([dawn,seconds()]);
    // The first 16 cells in Meadow's existing trailCellOrder (the beginner bot's sites).
    // Alternate the two legal crews, and spend only the game's earned gold.
    const cells = [[2,5],[6,6],[3,3],[7,1],[10,1],[14,3],[14,6],[14,9],[13,13],[16,10],[19,10],[22,10],[22,7],[22,4],[25,4],[28,7]];
    for (let wave = 1; wave <= 6; wave++) {
      await page.evaluate(({cells,wave}) => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        if (s.state.wave !== wave-1 || s.state.phase !== 'setup') throw Error('Unexpected wave setup');
        for (const [col,row] of cells.slice(s.state.towers.length)) {
          const tower = s.state.towers.length % 2 ? 'musketeer' : 'longbow';
          if (!s.build({ col,row },tower).ok) break;
        }
        s.setSpeed(3);
      },{cells,wave});
      const opening = seconds();
      await press(page,'startWave',touch);
      // Choose ordinary gameplay windows; no clock jumps, fake health, spawned enemies or gold.
      await page.waitForFunction(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.waveTick >= 350,
        undefined,{timeout:60_000});
      const from = wave === 1 ? opening : seconds();
      await delay(2400);
      if (wave === 3 || wave === 6) await still(wave === 3 ? 'crossfire' : 'dusk');
      await delay(2700);
      clips.push([from,seconds()]);
      await page.waitForFunction(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.phase !== 'wave',
        undefined,{timeout:120_000});
    }
    assert.equal((await state()).phase,'won');
    const victory = seconds();
    await delay(4200);
    clips.push([victory,seconds()]);
    const complete = await state(), endHeap = await heap();
    await press(page,'playAgain',touch);
    await page.waitForFunction(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.wave === 0);
    const replay = await state(), replayHeap = await heap();
    assert.equal(replay.detail?.marks,0);
    console.log(JSON.stringify({ layout, startHeap, endHeap, replayHeap, complete, replay }));
    const video = page.video()!;
    await context.close();
    const input = await video.path();
    const segments = clips.map(([from,to],i) => `[0:v]trim=start=${from.toFixed(3)}:end=${to.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    const chain = clips.map((_,i)=>`[v${i}]`).join('');
    const file = join(output,`${layout}.mp4`);
    execFileSync(process.env.FFMPEG ?? 'ffmpeg',['-y','-loglevel','error','-i',input,'-filter_complex',
      [...segments,`${chain}concat=n=${clips.length}:v=1:a=0,fps=25,format=yuv420p[v]`].join(';'),
      '-map','[v]','-an','-c:v','libx264','-crf','21','-preset','fast','-movflags','+faststart',file]);
    const bytes=(await stat(file)).size;
    const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'}));
    assert.ok(bytes<6_000_000 && duration>=30 && duration<=60);
    console.log(JSON.stringify({ file, bytes, duration }));
  } finally { await context.close(); }
}

// Wave eight contains all five ordinary collectors. Seed its opening budget and
// six legal tower positions, then let the real spawn, movement and damage rules run.
async function crossfire(browser: Browser) {
  const context = await browser.newContext(landscape);
  try {
    const page = await context.newPage();
    await start(page,'look=showpiece&perf=1&showpieceTier=2');
    await page.addStyleTag({content:'body > output { visibility: hidden }'});
    await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      scene.state.gold = 500;
      scene.state.wave = 7;
      for (const [col,row,type] of [[7,1,'longbow'],[10,4,'musketeer'],[14,6,'cannon'],
        [11,8,'tarpit'],[14,9,'firepot'],[16,10,'mortar']] as const) {
        const result = scene.build({col,row},type);
        if (!result.ok) throw Error(type + ' placement refused: ' + result.reason);
      }
      if (!scene.startWave().ok) throw Error('Wave eight refused');
      scene.setSpeed(3);
    });
    await page.waitForFunction(() => {
      const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
      return s.state.waveTick > 1250 && s.state.enemies.length >= 8 && s.state.shots.length > 0;
    },undefined,{timeout:60_000});
    await page.screenshot({path:join(output,'landscape-crossfire.jpg'),quality:92,scale:'css'});
  } finally { await context.close(); }
}

await run(async browser => {
  if (process.argv.includes('--crossfire')) return crossfire(browser);
  const work = await mkdtemp(join(scratch,'capture-'));
  try {
    // Complete both games even if one capture fails, then release the recording directory.
    const layouts = ['phone','landscape'] as const;
    const results = await Promise.allSettled(layouts.map(layout => take(browser,layout,work)));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    await crossfire(browser);
  } finally { await rm(work,{recursive:true,force:true}); }
}, {channel:'chromium',args:['--enable-gpu','--use-angle=metal']});

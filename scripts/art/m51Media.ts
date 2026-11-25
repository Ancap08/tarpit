// PW_PORT=4373 node --experimental-strip-types scripts/art/m51Media.ts [--phone-safety]
// Production preview and Playwright recording follow the meadow showpiece.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser, Page } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene';
import { origin, phone, landscape, run, press } from './m47Browser.ts';

const output = process.env.M51_MEDIA_DIR ?? 'docs/review/m51';
await mkdir(output,{recursive:true});

async function openKeep(page: Page, query: string) {
  await page.goto(origin + '/?keep=1&' + query, {waitUntil:'domcontentloaded'});
  await readyKeep(page);
}

async function readyKeep(page: Page) {
  await page.waitForFunction(() => window.__tarpit?.keep?.(), undefined, {timeout:30_000});
  await page.locator('#keep-status').waitFor({state:'hidden'});
  await page.evaluate(() => new Promise<void>(done => window.__tarpit!.game.events.once('postrender', done)));
}

/** Keep the DOM panorama, game canvas and their alignment. A physical-pixel
 * crop of the phone shows the details between the belfry and the rose. */
async function portraitDetail(page: Page) {
  await page.screenshot({path:join(output,'keep-phone-zoom.png'), scale:'device',
    clip:{x:54,y:55,width:282,height:406}});
}

// A wider portrait viewport at DPR 3 requests the full plates. Capture the
// composited castle from the map edge to the approach in both exposures.
async function nativeStudies(browser: Browser) {
  const ctx = await browser.newContext({...phone, viewport:{width:500,height:1244}});
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    for (const lightning of [false,true]) {
      await openKeep(page,'test=1&keepLightning=' + Number(lightning));
      const clip = await page.evaluate(() => {
        const api = window.__tarpit!;
        const scene = api.game.scene.getScene('game') as GameScene;
        const {map} = scene.boardLayout;
        const stair = scene.boardLayout.toScreen(scene.state.map.path.at(-2)!);
        const top = api.canvasToPage(map.x+4,map.y+4);
        const bottom = api.canvasToPage(map.x+map.width-4,stair.y+23);
        return {x:top.x,y:top.y,width:bottom.x-top.x,height:bottom.y-top.y};
      });
      const name = lightning ? 'keep-lightning-detail.jpg' : 'keep-dusk-detail.jpg';
      await page.screenshot({path:join(output,name), type:'jpeg', quality:96, scale:'device', clip});
    }
  } finally { await ctx.close(); }
}

// Use matching 390 × 844 pages for both plates. The only substitution is
// the WebP sent for each half-size URL, so fitting and the renderer agree.
async function phoneSafety(browser: Browser) {
  const scratch = await mkdtemp(join(tmpdir(),'keep-phone-review-'));
  try {
    const ctx = await browser.newContext({...phone, serviceWorkers:'block'});
    try {
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      const half = join(scratch,'half.png');
      const full = join(scratch,'full.png');
      const clip = {x:0,y:54,width:390,height:440};
      await openKeep(page,'test=1');
      await page.screenshot({path:join(output,'keep-390x844.png'), scale:'css'});
      await portraitDetail(page);
      await page.screenshot({path:half, scale:'css', clip});

      const plates = '**/assets/keep/*-half.webp';
      const matched = new Set<string>();
      await page.route(plates, route => {
        const path = new URL(route.request().url()).pathname.replace('-half.webp','.webp');
        matched.add(path);
        return route.fulfill({path:join('public',path), contentType:'image/webp'});
      });
      await openKeep(page,'test=1');
      assert.equal(matched.size,11);
      await page.screenshot({path:full, scale:'css', clip});
      await page.unroute(plates);
      execFileSync('python3',['-c',`
import sys
from PIL import Image, ImageDraw, ImageFont

with Image.open(sys.argv[1]) as full, Image.open(sys.argv[2]) as half:
    assert full.size == half.size == (390, 440)
    gutter, caption = 12, 34
    sheet = Image.new('RGB', (full.width * 2 + gutter, full.height + caption), '#192029')
    legend = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, picture) in enumerate((('Full-size source', full), ('Half-size source', half))):
        x = i * (full.width + gutter)
        sheet.paste(picture, (x, caption))
        legend.text((x + 10, 8), label, font=font, fill='#f0ede4')
    sheet.save(sys.argv[3])
`,full,half,join(output,'keep-phone-full-vs-half.png')]);

      const glow = '**/assets/keep/glow-half.webp';
      let resume = () => {};
      const held = new Promise<void>(resolve => { resume = resolve; });
      await page.route(glow, async route => {
        await held;
        await route.continue();
      });
      try {
        await page.goto(origin + '/?keep=1&test=1', {waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => {
          const bar = document.querySelector<HTMLProgressElement>('#keep-status progress');
          return bar && !bar.hidden && bar.value >= .9 && bar.value < 1;
        });
        await page.screenshot({path:join(output,'keep-loading.png'), scale:'css'});
      } finally {
        resume();
      }
      await readyKeep(page);
      await page.unroute(glow);

      await page.route(glow, route => route.abort());
      await page.goto(origin + '/?keep=1&test=1', {waitUntil:'domcontentloaded'});
      await page.getByText('The Old Keep could not load.', {exact:true}).waitFor();
      await page.getByRole('button',{name:'Back to title'}).waitFor();
      await page.screenshot({path:join(output,'keep-load-failed.png'), scale:'css'});
    } finally { await ctx.close(); }
  } finally { await rm(scratch,{recursive:true,force:true}); }
}

await run(async browser => {
  if (process.argv.includes('--phone-safety')) return phoneSafety(browser);
  if (process.argv.includes('--studies-only')) return nativeStudies(browser);
  for (const [width,height] of [[390,844],[390,664],[1024,768],[960,580]]) {
    const ctx = await browser.newContext({ ...(width === 390 ? phone : landscape), viewport:{width,height} });
    try {
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      await openKeep(page,'test=1');
      await page.screenshot({path:join(output, `keep-${width}x${height}.png`),scale:'css'});
      if (width === 390 && height === 844 && !process.argv.includes('--setup-only')) {
        await portraitDetail(page);
        if (process.argv.includes('--portrait-detail-only')) return;
        await openKeep(page,'test=1');
      }
      if (width === 390 && !process.argv.includes('--setup-only')) {
        const nearGate = height === 844;
        const shot = await page.evaluate(nearGate => {
          const a = window.__tarpit!;
          const s = a.state!();
          const sites = s.map.buildSites!;
          const crew = nearGate ? [[0,'mortar'],[1,'longbow'],[5,'cannon']] as const
            : [[0,'longbow'],[1,'musketeer']] as const;
          for (const [i,type] of crew) {
            const {col,row} = sites[i];
            if (!a.buildAt!(col,row,type).ok) throw Error('Wall placement refused');
          }
          // Play the last fixed wave through the normal simulation so the
          // portrait comparison has real Trolls, shots, health bars and crews.
          const path = s.map.path;
          const exit = path[path.length-1];
          const length = path.slice(1).reduce((sum, p, i) =>
            sum + Math.hypot(p.x-path[i].x,p.y-path[i].y), 0);
          s.wave = 2;
          a.startWave!();
          let closest = Infinity;
          for (let t = 0; t < 6_000 && s.phase === 'wave'; t++) {
            a.step!(1);
            const remaining = Math.min(...s.enemies.filter(e => e.type === 'troll').map(e => length-e.distance));
            const shot = s.shots.find(hit => Math.hypot(hit.to.x-exit.x,hit.to.y-exit.y) < 115);
            if (shot) closest = Math.min(closest,remaining);
            if (shot && (nearGate ? remaining < 25 : s.enemies.length >= 8)) {
              return {tick:s.tick,wave:s.wave,enemies:s.enemies.length,remaining,shot};
            }
          }
          throw Error('No near-gate shot in the last wave, closest Troll '+closest);
        },nearGate);
        console.log('Crossfire',height,shot);
        await page.screenshot({path:join(output,nearGate ? 'keep-wall-defence.png' : 'keep-390x664-midwave.png'),scale:'css'});
      }
    } finally { await ctx.close(); }
  }
  if (process.argv.includes('--setup-only')) return;
  await nativeStudies(browser);
  const scratch = await mkdtemp(join(tmpdir(),'keep-recording-'));
  try {
    const ctx = await browser.newContext({...phone,recordVideo:{dir:scratch,size:phone.viewport}});
    try {
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      const born = performance.now();
      await openKeep(page,'perf=1&keepTier=2');
      const start = (performance.now()-born)/1000;
      await page.addStyleTag({content:'body > output {visibility:hidden}'});
      await delay(3000);
      await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        for (const [i,type] of (['mortar','longbow'] as const).entries()) {
          if (!s.build(s.state.map.buildSites![i],type).ok) throw Error('Film tower placement refused');
        }
        s.setSpeed(2);
      });
      await press(page,'startWave',true);
      await delay(12_300);
      const video = page.video()!;
      await ctx.close();
      execFileSync('ffmpeg',['-y','-loglevel','error','-ss',start.toFixed(3),'-i',await video.path(),
        '-t','15','-an','-vf','fps=25,format=yuv420p','-c:v','libx264','-crf','19','-preset','fast',
        '-movflags','+faststart',join(output,'keep-phone.mp4')]);
      const seconds = Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',join(output,'keep-phone.mp4')],{encoding:'utf8'}));
      assert.ok(seconds >= 14.8 && seconds <= 15.1);
    } finally { await ctx.close(); }
  } finally { await rm(scratch,{recursive:true,force:true}); }
},{channel:'chromium',args:['--enable-gpu','--use-angle=metal']});

// PW_PORT=4373 node --experimental-strip-types scripts/art/m51Media.ts
// Production preview and Playwright recording follow the meadow showpiece.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene';
import { origin, phone, landscape, run, press } from './m47Browser.ts';

const output = 'docs/review/m51';
await mkdir(output,{recursive:true});

async function openKeep(page: Page, query: string) {
  await page.goto(origin + '/?keep=1&' + query);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'), undefined, {timeout:90_000});
  await page.evaluate(() => new Promise<void>(done => window.__tarpit!.game.events.once('postrender', done)));
}

await run(async browser => {
  for (const [width,height] of [[390,844],[390,664],[1024,768],[960,580]]) {
    const ctx = await browser.newContext({ ...(width === 390 ? phone : landscape), viewport:{width,height} });
    try {
      const page = await ctx.newPage();
      await openKeep(page,'test=1');
      await page.screenshot({path:join(output, `keep-${width}x${height}.png`),scale:'css'});
      if (width === 390 && height === 844) {
        const shot = await page.evaluate(() => {
          const a = window.__tarpit!;
          const s = a.state!();
          if (!a.buildAt!(11,4,'longbow').ok || !a.buildAt!(11,10,'musketeer').ok) throw Error('Wall placement refused');
          // Stage the last fixed wave so its Trolls survive into the gate approach.
          s.wave = 2;
          a.startWave!();
          for (let t = 0; t < 6_000 && s.phase === 'wave'; t++) {
            a.step!(1);
            if (s.enemies.length > 1 && s.shots.some(shot => Math.hypot(shot.to.x-400,shot.to.y-240)<110)) {
              return {tick:s.tick,wave:s.wave,enemies:s.enemies.length,shot:s.shots[0]};
            }
          }
          throw Error('No near-gate shot in the last wave');
        });
        console.log('Crossfire',shot);
        await page.screenshot({path:join(output,'keep-wall-defence.png'),scale:'css'});
      }
    } finally { await ctx.close(); }
  }
  const scratch = await mkdtemp(join(tmpdir(),'keep-recording-'));
  try {
    const ctx = await browser.newContext({...phone,recordVideo:{dir:scratch,size:phone.viewport}});
    try {
      const page = await ctx.newPage();
      const born = performance.now();
      await openKeep(page,'perf=1&keepTier=2');
      const start = (performance.now()-born)/1000;
      await page.addStyleTag({content:'body > output {visibility:hidden}'});
      await delay(3000);
      await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        for (const [col,row,type] of [[11,4,'longbow'],[11,10,'musketeer']] as const)
          if (!s.build({col,row},type).ok) throw Error('Film tower placement refused');
        s.setSpeed(3);
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

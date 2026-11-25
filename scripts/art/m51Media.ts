// PW_PORT=4373 node --experimental-strip-types scripts/art/m51Media.ts
// Production preview and Playwright recording follow the meadow showpiece.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser, Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { GameScene } from '../../src/game/GameScene';
import { origin, phone, landscape, run, press } from './m47Browser.ts';

const output = process.env.M51_MEDIA_DIR ?? 'docs/review/m51';
await mkdir(output,{recursive:true});

async function openKeep(page: Page, query: string) {
  await page.goto(origin + '/?keep=1&' + query);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'), undefined, {timeout:90_000});
  await page.evaluate(() => new Promise<void>(done => window.__tarpit!.game.events.once('postrender', done)));
}

/** The second camera looks from the belfry to the rose, across the outer
 * window figures and waterspouts. Take the camera pixels before CSS fitting. */
async function portraitDetail(page: Page) {
  const data = await page.evaluate(async () => {
    const a = window.__tarpit!;
    const scene = a.game.scene.getScene('game') as GameScene;
    const board = scene.boardLayout;
    const {x,y,width,height} = board.map;
    const foot = board.toScreen(scene.state.map.path.at(-2)!);
    const zoom = 2.1;
    scene.cameras.add(x,y,width,height,false,'belfry detail').setZoom(zoom)
      .centerOn(foot.x+82,y+height/(2*zoom)+4);
    return await new Promise<string>((resolve,reject) => {
      a.game.renderer.snapshotArea(x,y,width,height,image => {
        if (image instanceof HTMLImageElement) resolve(image.src);
        else reject(Error('Expected encoded portrait detail'));
      });
    });
  });
  await writeFile(join(output,'keep-phone-zoom.png'),Buffer.from(data.split(',')[1],'base64'));
}

// Render the phone's actual scene at one output pixel per source castle texel.
// This preserves the lanterns, hands, bell, chain, storm fork and mountain
// registration in both studies. Only this temporary review page is enlarged.
async function nativeStudies(browser: Browser) {
  const ctx = await browser.newContext(phone);
  try {
    const page = await ctx.newPage();
    for (const lightning of [false,true]) {
      await openKeep(page,'test=1&keepLightning=' + Number(lightning));
      const data = await page.evaluate(async () => {
        const api = window.__tarpit!;
        const scene = api.game.scene.getScene('game') as GameScene;
        const nodes = [...scene.children.getChildren()];
        let gate: Phaser.GameObjects.Image | undefined;
        while (nodes.length) {
          const node = nodes.pop()!;
          if (node.type === 'Container') nodes.push(...(node as Phaser.GameObjects.Container).list);
          if (node.type === 'Image' && (node as Phaser.GameObjects.Image).texture.key === 'keep:gate') {
            gate = node as Phaser.GameObjects.Image;
            break;
          }
        }
        if (!gate) throw Error('Missing portrait gate plate');
        const {map} = scene.boardLayout;
        const stair = scene.boardLayout.toScreen(scene.state.map.path.at(-2)!);
        const zoomX = gate.width/gate.displayWidth, zoomY = gate.height/gate.displayHeight;
        const top = map.y+4, bottom = stair.y+23;
        const width = Math.floor((map.width-8)*zoomX), height = Math.floor((bottom-top)*zoomY);
        api.game.scale.setGameSize(width,height);
        scene.cameras.add(0,0,width,height,false,'native study')
          .setZoom(zoomX,zoomY).centerOn(map.x+map.width/2,(top+bottom)/2);
        return await new Promise<string>((resolve,reject) => {
          api.game.renderer.snapshot(image => {
            if (image instanceof HTMLImageElement) resolve(image.src);
            else reject(Error('Expected encoded study image'));
          },'image/jpeg',.96);
        });
      });
      const name = lightning ? 'keep-lightning-detail.jpg' : 'keep-dusk-detail.jpg';
      await writeFile(join(output,name),Buffer.from(data.split(',')[1],'base64'));
    }
  } finally { await ctx.close(); }
}

await run(async browser => {
  if (process.argv.includes('--studies-only')) return nativeStudies(browser);
  for (const [width,height] of [[390,844],[390,664],[1024,768],[960,580]]) {
    const ctx = await browser.newContext({ ...(width === 390 ? phone : landscape), viewport:{width,height} });
    try {
      const page = await ctx.newPage();
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

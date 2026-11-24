// PW_PORT=4373 node --experimental-strip-types scripts/art/m47DrawCosts.ts
// Paired marginal render cost on Chromium's software GL. The simulation and
// every animation stay at the same pose throughout the comparison.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type Phaser from 'phaser';
import type { GameScene } from '../../src/game/GameScene';
import type { TowerType } from '../../src/sim/types';
import { phone, run, start } from './m47Browser.ts';

type Drawable = { visible: boolean; frame?: { name: string }; list?: Drawable[] };
interface BattleLayers {
  fieldLayer: Drawable;
  crewLayer: Drawable;
  victoryLayer: Drawable;
  salute: { draw(won: boolean, time: number, tier: number, calm: boolean): void };
}
interface TestScene {
  showpiece: {
    battle: BattleLayers;
    camera: { blast(time: number): void; draw(state: GameScene['state'], time: number, moving: boolean): void };
    pasture: { layer: { list: Drawable[] } };
  };
}

await run(async browser => {
  const context = await browser.newContext(phone);
  try {
    const page = await context.newPage();
    await start(page, 'look=showpiece&perf=1&showpieceTier=2');
    const cdp = await context.newCDPSession(page);
    await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      scene.state.gold = scene.state.lives = 1e6;
      const types: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
      for (let row = 1; row < 15 && scene.state.towers.length < 25; row += 2) {
        for (let col = 1; col < 30 && scene.state.towers.length < 25; col += 2) {
          scene.build({ row, col }, types[scene.state.towers.length % types.length]);
        }
      }
      scene.spawnHorde(120, 120);
      scene.state.wave = 20;
    });
    // Let the real towers fire and the farm's light transition finish.
    await delay(4300);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const result = await page.evaluate(() => {
      const game = window.__tarpit!.game;
      const scene = game.scene.getScene('game') as GameScene;
      const show = (scene as unknown as TestScene).showpiece;
      const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      const gl = renderer.gl;
      if (!gl) throw new Error('Expected WebGL');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug && String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
      if (!gpu?.includes('SwiftShader')) throw new Error('Expected SwiftShader, got ' + gpu);
      game.loop.sleep();
      if (scene.state.enemies.length < 120) scene.spawnHorde(120 - scene.state.enemies.length, 120);
      // Ordinary wave spawns can briefly push the packed-horde fixture above 120.
      scene.state.enemies.splice(120);
      scene.redraw();

      const display = show.pasture.layer.list;
      const groupFor = (object: Drawable) => {
        const frame = object.frame?.name;
        if (!frame || ['vignette', 'sunwash', 'lamp', 'shade'].includes(frame)) return 'daylight';
        if (['graze', 'ewe', 'peck', 'hen', 'catTail', 'cat', 'rake', 'run', 'wingUp', 'wingDown'].includes(frame)) return 'animals';
        return 'farm';
      };
      const visible = display.filter(object => object.visible);
      const groups: Record<string, Drawable[]> = {};
      for (const name of ['farm', 'animals', 'daylight']) {
        groups[name] = visible.filter(object => groupFor(object) === name);
        if (!groups[name].length) throw new Error('Missing group ' + name);
      }
      if (!visible.some(object => object.frame?.name === 'lamp')) throw new Error('Dusk lights are missing');
      groups.field = [show.battle.fieldLayer];
      groups.crews = [show.battle.crewLayer];

      // Freeze a real artillery kick at its peak. Sample this camera only in
      // its own comparison: it draws the field twice during its brief life.
      show.camera.blast(100000);
      show.camera.draw(scene.state, 100075, true);
      const camera = scene.cameras.getCamera('meadow');
      if (!camera) throw new Error('Expected a moving Meadow camera');
      camera.visible = false;
      groups.camera = [camera];
      const counts = Object.fromEntries(Object.entries(groups).map(([name, objects]) =>
        [name, objects.reduce((sum, item) => sum + (item.list?.filter(child => child.visible).length ?? 1), 0)]));
      const names = Object.keys(groups);
      // readPixels forces Chromium to return a pixel from this frame. gl.finish
      // alone can return before SwiftShader's out-of-process commands finish.
      const pixel = new Uint8Array(4);
      const one = () => {
        const start = performance.now();
        renderer.preRender();
        game.scene.render(renderer);
        renderer.postRender();
        gl.finish();
        gl.readPixels(12, 12, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return performance.now() - start;
      };
      // A batch spans timer quantisation. Pair order alternates and the
      // rotation spreads warm-up, machine noise and longer-running pairs.
      const sample = () => (one() + one()) / 2;
      const raw: Record<string, { on: number; off: number }[]> = {};
      const pairs = 9;
      const pair = (name: string, i: number) => {
        const members = groups[name];
        const time = (enabled: boolean) => {
          for (const object of members) object.visible = enabled;
          return sample();
        };
        let on, off;
        if (i % 2 === 0) {
          on = time(true);
          off = time(false);
        } else {
          off = time(false);
          on = time(true);
        }
        for (const object of members) object.visible = name !== 'camera';
        (raw[name] ??= []).push({ on, off });
      };
      for (let i = 0; i < 6; i++) one();
      for (let i = 0; i < pairs; i++) {
        for (let offset = 0; offset < names.length; offset++) {
          pair(names[(i + offset) % names.length], i);
        }
      }
      // Victory is measured in its own frozen view with the real modal.
      const combat = { enemies: scene.state.enemies.length, towers: scene.state.towers.length, marks: scene.showpieceState()?.marks };
      scene.state.enemies.length = 0;
      scene.state.phase = 'won';
      scene.redraw();
      show.battle.salute.draw(true, scene.showpieceState()!.timeMs + 1450, 2, false);
      groups.victory = [show.battle.victoryLayer];
      for (let i = 0; i < 4; i++) one();
      for (let i = 0; i < pairs; i++) pair('victory', i);
      return { gpu, size: [scene.scale.width, scene.scale.height], combat, counts, raw };
    });
    assert.equal(result.combat.enemies, 120);
    assert.equal(result.combat.towers, 25);
    assert.ok((result.combat.marks ?? 0) > 0);
    const quartiles = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [0.25, 0.5, 0.75].map(p => +sorted[Math.floor(p * (sorted.length - 1))].toFixed(3));
    };
    const costs = Object.entries(result.raw).map(([name, samples]) => ({
      name, objects: result.counts[name], enabledMs: quartiles(samples.map(s => s.on))[1],
      disabledMs: quartiles(samples.map(s => s.off))[1], deltaQ1MedianQ3: quartiles(samples.map(s => s.on - s.off)),
    }));
    console.log(JSON.stringify({ cpuRate: 6, batch: 2, pairs: 9, ...result, costs }));
  } finally {
    await context.close();
  }
}, { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

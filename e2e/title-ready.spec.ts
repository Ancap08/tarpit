import { expect, test } from '@playwright/test';

// Milestone 26 follow-up: the Play click flake. On a first visit the title's
// create() runs when its sprite sheets finish loading, between frames, and
// Phaser hit-tests a new interactive object only from its scene's next
// update (the input plugin's pending-insertion list). A click in that gap
// was lost, so a spec that clicked Play as soon as the title scene was
// active could wait forever for the game. The title now reports ready (and
// lists its buttons in uiRects()) only from its first rendered frame.
//
// Each case hooks the page before the game boots: at the title's create it
// checks that the title is not ready yet (and that Phaser has not listed the
// Play button, the cause), then at the title's first render, the earliest
// moment titleReady() is true, it clicks Play with DOM mouse events in the
// same task. The game must start.

type Probe = {
  atCreate?: { ready: boolean; rects: string[]; listed: boolean; pending: boolean };
  atRender?: { ready: boolean; rects: string[] };
  clickedAt?: number;
};

for (const url of ['/?renderer=canvas', '/?test=1']) {
  test(`a click on Play at the title's first ready frame starts the game (${url})`, async ({ page }) => {
    await page.addInitScript(() => {
      type Rect = { x: number; y: number; width: number; height: number };
      // Phaser's private input lists are read on purpose: they show the cause.
      type Emitter = { once(event: string, f: () => void): void };
      type Title = {
        events: Emitter;
        playButton: { box: unknown };
        input: { _list: unknown[]; _pendingInsertion: unknown[] };
      };
      type Game = { scene: { getScene(key: string): Title | null }; events: Emitter; canvas: HTMLCanvasElement; loop: { frame: number } };
      type Api = { game: Game; titleReady(): boolean; uiRects(): Record<string, Rect> };
      const w = window as unknown as { __probe: Probe; __api?: Api; __tarpit?: Api };
      w.__probe = {};
      const titleKeys = (api: Api) => Object.keys(api.uiRects()).filter((k) => k.startsWith('title:'));
      // window.__tarpit is set right after the game is created (main.ts); hook the title from there.
      Object.defineProperty(window, '__tarpit', {
        configurable: true,
        get: () => w.__api,
        set: (api: Api) => {
          w.__api = api;
          const game = api.game;
          const hook = () => {
            const title = game.scene.getScene('title')!;
            title.events.once('create', () => {
              const box = title.playButton.box;
              w.__probe.atCreate = {
                ready: api.titleReady(),
                rects: titleKeys(api),
                listed: title.input._list.includes(box),
                pending: title.input._pendingInsertion.includes(box),
              };
              // Registered after TitleScene's own render listener, so ready is already set when this runs.
              title.events.once('render', () => {
                w.__probe.atRender = { ready: api.titleReady(), rects: titleKeys(api) };
                const r = api.uiRects()['title:play'];
                const c = game.canvas.getBoundingClientRect();
                const x = c.left + r.x + r.width / 2;
                const y = c.top + r.y + r.height / 2;
                game.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
                game.canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, button: 0, buttons: 1 }));
                game.canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true, button: 0, buttons: 0 }));
                w.__probe.clickedAt = game.loop.frame;
              });
            });
          };
          if (game.scene.getScene('title')) hook();
          else game.events.once('ready', hook);
        },
      });
    });
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __probe: Probe }).__probe.clickedAt !== undefined);
    const probe = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);
    // At create: not ready, no title buttons listed; Phaser has the Play button pending, not hit-testable.
    expect(probe.atCreate).toEqual({ ready: false, rects: [], listed: false, pending: true });
    // At the first render: ready, every button listed (milestone 27: the map thumbnails too).
    expect(probe.atRender).toEqual({
      ready: true,
      rects: ['title:easy', 'title:normal', 'title:hard', 'title:map:meadow', 'title:map:switchback', 'title:map:riverbend', 'title:play', 'title:mute'],
    });
    // The click at that moment started the game.
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'), undefined, { timeout: 5000 });
  });
}

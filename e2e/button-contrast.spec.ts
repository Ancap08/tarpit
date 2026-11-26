import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Button } from '../src/game/ui/button';
import { api, press } from './campaign';
import { waitForTitle } from './title';

// WCAG relative luminance for sRGB colours.
function luminance(rgb: number): number {
  const [r, g, b] = [16, 8, 0].map(shift => {
    const channel = ((rgb >> shift) & 255) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(text: string, fill: number): number {
  const light = [luminance(Number.parseInt(text.slice(1), 16)), luminance(fill)];
  return (Math.max(...light) + 0.05) / (Math.min(...light) + 0.05);
}

test('new button ink has at least 4.5:1 contrast on its painted fill when enabled', async ({ page }, info) => {
  await page.goto('/?test=1&ui=new');
  await waitForTitle(page);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

  const samples = await api(page, t => {
    const scene = t.game.scene.getScene('game') as GameScene;
    // Use the same Button class as the live tower panel, in the production build.
    const ButtonClass = scene['panel']['upgrade'].constructor as typeof Button;
    const rect = { x: 20, y: 100, width: 260, height: 50 };
    const samples: { skin: string; primary: boolean; available: boolean; state: string; fill: number; label: string; right?: string }[] = [];
    for (const skin of ['battle', 'paper'] as const) {
      for (const primary of [true, false]) {
        for (const right of [undefined, '35']) {
          const button = new ButtonClass(scene, rect, 'Upgrade', () => {}, { skin, primary, right });
          const box = button['box'];
          const [label, price] = button.labelObjects;
          const image = button['chrome']!.image as Phaser.GameObjects.Image;
          const tile = image.texture.getSourceImage() as HTMLCanvasElement;
          const ctx = tile.getContext('2d')!;
          for (const available of [true, false]) {
            button.set(label.text, available);
            const read = (state: string) => {
              // Sample the flat fill behind the labels, before text is composited.
              const [r, g, b, alpha] = ctx.getImageData(tile.width / 2, tile.height / 2, 1, 1).data;
              if (alpha !== 255 || !label.visible || (price && !price.visible)) throw new Error('Expected an opaque fill and visible button text');
              const ink = label.style.color;
              const priceInk = price?.style.color;
              if (typeof ink !== 'string' || (price && typeof priceInk !== 'string')) throw new Error('Expected solid button ink');
              samples.push({ skin, primary, available, state, fill: (r << 16) | (g << 8) | b,
                label: ink, right: typeof priceInk === 'string' ? priceInk : undefined });
            };
            read('rest');
            box.emit('pointerdown');
            read('pressed');
            box.emit('pointerout');
            box.emit('pointerover');
            read('hovered');
            box.emit('pointerdown');
            read('hovered and pressed');
            box.emit('pointerout');
            button.setPicked(true);
            read('picked');
            button.setPicked(false);
          }
        }
      }
    }
    return samples;
  });

  const ratios = samples.map(({ skin, primary, available, state, fill, label, right }) => ({
    button: `${skin} ${primary ? 'primary' : 'plain'}${available ? '' : ' disabled'}`,
    state, available, label: contrast(label, fill), right: right === undefined ? undefined : contrast(right, fill),
  }));
  await info.attach('button contrast ratios', { body: JSON.stringify(ratios, null, 2), contentType: 'application/json' });
  for (const { button, state, available, label, right } of ratios) {
    if (!available) continue;
    const where = `${button} ${state} ${right === undefined ? 'without' : 'with'} right-hand text`;
    expect.soft(label, `${where}: label contrast ${label.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    if (right !== undefined) expect.soft(right, `${where}: right-hand contrast ${right.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
});

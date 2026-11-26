import type { Page } from '@playwright/test';

// Independent verifier helpers for milestone 55c. They enumerate everything
// from the live Phaser scene (every Text node, every registered target), so
// a new control cannot hide from them by being left out of a hand-written list.

export interface TextRecord {
  text: string; x: number; y: number; w: number; h: number; fs: number; color: string; alpha: number;
  depth: number; bold: boolean; scene: string;
  glyph?: number; contrast?: number;
}

/** Visible Text objects of the active scenes, in page CSS pixels. */
export function collectTexts(page: Page): Promise<{ texts: TextRecord[]; targets: Record<string, { x: number; y: number; w: number; h: number }> }> {
  return page.evaluate(() => {
    const t = window.__tarpit!;
    const g = t.game;
    const ds = g.scale.displayScale;
    const cb = g.canvas.getBoundingClientRect();
    const toCss = (x: number, y: number) => ({ x: cb.left + x / ds.x, y: cb.top + y / ds.y });
    const texts: TextRecord[] = [];
    for (const scene of g.scene.scenes.filter(s => s.sys.isActive() && s.sys.isVisible())) {
      const walk = (list: Phaser.GameObjects.GameObject[], visible: boolean, alpha: number) => {
        for (const node of list) {
          const v = visible && (node as { visible?: boolean }).visible !== false;
          const a = alpha * ((node as { alpha?: number }).alpha ?? 1);
          if (node.type === 'Text') {
            const label = node as Phaser.GameObjects.Text;
            if (!v || a < 0.05 || !label.text.trim()) continue;
            const b = label.getBounds();
            const p0 = toCss(b.x, b.y), p1 = toCss(b.right, b.bottom);
            const m = label.getWorldTransformMatrix();
            texts.push({ text: label.text, x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y,
              fs: parseFloat(String(label.style.fontSize)) * Math.abs(m.scaleY) / ds.y, color: String(label.style.color), alpha: a,
              depth: label.depth, bold: /bold|[6-9]00/.test(String(label.style.fontStyle)), scene: scene.sys.settings.key });
          }
          const children = (node as { list?: Phaser.GameObjects.GameObject[] }).list;
          if (children) walk(children, v, a);
        }
      };
      walk(scene.children.list, true, 1);
    }
    const targets: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const [key, r] of Object.entries(t.uiRects())) {
      const p = toCss(r.x, r.y);
      targets[key] = { x: p.x, y: p.y, w: r.width / ds.x, h: r.height / ds.y };
    }
    return { texts, targets };
  });
}

/** Stop every Text from drawing (prototype patch), then redraw. */
export function hideAllText(page: Page, on: boolean): Promise<void> {
  return page.evaluate(on => {
    const g = window.__tarpit!.game;
    const all: Phaser.GameObjects.Text[] = [];
    for (const scene of g.scene.scenes) {
      const walk = (list: Phaser.GameObjects.GameObject[]) => {
        for (const node of list) {
          if (node.type === 'Text') all.push(node as Phaser.GameObjects.Text);
          const children = (node as { list?: Phaser.GameObjects.GameObject[] }).list;
          if (children) walk(children);
        }
      };
      walk(scene.children.list);
    }
    if (!all.length) return;
    const proto = Object.getPrototypeOf(all[0]) as Record<string, unknown>;
    if (on && !proto.__orig) { proto.__orig = proto.renderCanvas; proto.renderCanvas = () => {}; }
    if (!on && proto.__orig) { proto.renderCanvas = proto.__orig; delete proto.__orig; }
    for (const label of all) label.updateText();
  }, on);
}

/**
 * WCAG contrast of each text against what is rendered behind it. Takes one
 * screenshot with text and one without, treats the pixels that differ as the
 * glyphs, and compares the glyph colour with the bare pixels under them.
 * Needs a second page to decode the PNGs.
 */
export async function measureContrast(page: Page, decoder: Page, texts: TextRecord[], dpr: number): Promise<TextRecord[]> {
  await page.waitForTimeout(150);
  const full = (await page.screenshot()).toString('base64');
  await hideAllText(page, true);
  await page.waitForTimeout(150);
  const bare = (await page.screenshot()).toString('base64');
  await hideAllText(page, false);
  const out = await decoder.evaluate(async ({ full, bare, texts, dpr }) => {
    const load = async (b64: string) => {
      const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return { data: ctx.getImageData(0, 0, bmp.width, bmp.height), w: bmp.width, h: bmp.height };
    };
    const [F, B] = [await load(full), await load(bare)];
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const parse = (c: string) => {
      const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
      return hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) : null;
    };
    return texts.map(t => {
      const x0 = Math.max(0, Math.floor(t.x * dpr) - 2), y0 = Math.max(0, Math.floor(t.y * dpr) - 2);
      const x1 = Math.min(F.w, Math.ceil((t.x + t.w) * dpr) + 2), y1 = Math.min(F.h, Math.ceil((t.y + t.h) * dpr) + 2);
      const fg = parse(t.color);
      const values: number[] = [];
      let glyph = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * F.w + x) * 4;
        const d = Math.abs(F.data.data[i] - B.data.data[i]) + Math.abs(F.data.data[i + 1] - B.data.data[i + 1]) + Math.abs(F.data.data[i + 2] - B.data.data[i + 2]);
        if (d <= 60) continue;
        glyph++;
        if (fg) values.push(ratio(lum(fg[0], fg[1], fg[2]), lum(B.data.data[i], B.data.data[i + 1], B.data.data[i + 2])));
      }
      values.sort((a, b) => a - b);
      return { ...t, glyph, contrast: values.length ? values[Math.floor(values.length * 0.05)] : undefined };
    });
  }, { full, bare, texts, dpr });
  return out;
}

/** Ink pixels (alpha over half) the text would put down on its own at this size, drawn on an offscreen canvas in the game page. */
export function expectedInk(page: Page, texts: { text: string; fs: number; bold: boolean }[], dpr: number): Promise<number[]> {
  return page.evaluate(({ texts, dpr }) => {
    const family = '"Libre Caslon Text", "Courier New", monospace';
    return texts.map(t => {
      const size = t.fs * dpr;
      const canvas = new OffscreenCanvas(Math.ceil(size * t.text.length * 1.2) + 8, Math.ceil(size * 2));
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${t.bold ? 'bold ' : ''}${size}px ${family}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, 2, 2);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) count++;
      return count;
    });
  }, { texts, dpr });
}

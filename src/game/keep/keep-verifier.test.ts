// Independent guards on the Old Keep's art (milestone 51 verifier).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'public/assets/keep');
const files = readdirSync(DIR).filter(f => f.endsWith('.webp')).sort();

function size(file: string): { width: number; height: number } {
  const d = readFileSync(join(DIR, file));
  const kind = d.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: d.readUIntLE(24, 3) + 1, height: d.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8L') {
    const bits = d.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: d.readUInt16LE(26) & 0x3fff, height: d.readUInt16LE(28) & 0x3fff };
}

describe('Old Keep art budget', () => {
  it('stays under the 8 MB art limit on disk', () => {
    const bytes = files.reduce((sum, f) => sum + readFileSync(join(DIR, f)).length, 0);
    expect(bytes).toBeLessThan(8_000_000);
  });

  it('keeps the pixels a phone must hold in memory under 256 MB', () => {
    // loadKeep() decodes every plate into a texture whatever the orientation.
    // At 4 bytes a pixel this is the GPU cost (and a second, evictable, decoded
    // copy sits in the image element). 248.6 MB on 2026-11-24; do not grow it.
    const pixelBytes = files.reduce((sum, f) => { const s = size(f); return sum + s.width * s.height * 4; }, 0);
    expect(pixelBytes).toBeLessThan(256_000_000);
    for (const f of files) {
      const s = size(f);
      expect(Math.max(s.width, s.height), f).toBeLessThanOrEqual(4096); // older iPhones' texture limit
    }
  });

  it('loads exactly the plates on disk, no more and no fewer', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/keep/oldKeep.ts'), 'utf8');
    const list = /const plates = \[([^\]]+)\]/.exec(source)![1].match(/'([^']+)'/g)!.map(s => s.slice(1, -1));
    expect(list.map(n => n + '.webp').sort()).toEqual(files);
  });
});

describe('Old Keep provenance', () => {
  const manifest = readFileSync(join(process.cwd(), 'assets/MANIFEST.md'), 'utf8');
  it('lists every plate against a script that exists under scripts/art', () => {
    for (const f of files) {
      const row = manifest.split('\n').find(line => line.includes('`public/assets/keep/' + f + '`'));
      expect(row, f).toBeDefined();
      const script = /`(scripts\/art\/[^`]+)`/.exec(row!)![1];
      expect(existsSync(join(process.cwd(), script)), script).toBe(true);
    }
  });

  it('has no downloaded or hand-supplied input in the art scripts', () => {
    for (const name of ['keep_castle.py', 'keep_weather.py']) {
      const text = readFileSync(join(process.cwd(), 'scripts/art', name), 'utf8');
      expect(text, name).not.toMatch(/https?:\/\/|urllib|requests\.|\.hdr|\.exr/);
    }
  });
});

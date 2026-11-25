// Independent guards on the Old Keep's art (milestone 51 verifier).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keepPlateSet } from './plates';
import type { KeepSky } from '../../sim/levelTypes';

const DIR = join(process.cwd(), 'public/assets/keep');
const ACTORS = join(process.cwd(), 'public/assets/act3/siege-actors.webp');
const files = readdirSync(DIR).filter(f => f.endsWith('.webp')).sort();
const skies: KeepSky[] = ['dusk', 'night storm', 'dawn'];

function size(file: string, path = join(DIR, file)): { width: number; height: number } {
  const d = readFileSync(path);
  const kind = d.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: d.readUIntLE(24, 3) + 1, height: d.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8L') {
    const bits = d.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: d.readUInt16LE(26) & 0x3fff, height: d.readUInt16LE(28) & 0x3fff };
}

describe('Old Keep art budget', () => {
  it('stays under the 10 MB art limit on disk', () => {
    const bytes = files.reduce((sum, f) => sum + readFileSync(join(DIR, f)).length, readFileSync(ACTORS).length);
    expect(bytes).toBeLessThanOrEqual(10_000_000);
  });

  it('selects one half-density siege set on even a large DPR phone', () => {
    const actors = size('siege-actors.webp', ACTORS);
    for (const weather of skies) for (const turned of [true, false]) {
      const set = keepPlateSet(turned, 2800, weather, weather === 'dusk', true, true);
      expect(set.files.some(({ name }) => name === 'siege-gates')).toBe(false);
      expect(set.files.some(({ name }) => name === 'siege-barbican')).toBe(true);
      expect(set.files.every(({ file }) => file.endsWith('-half.webp'))).toBe(true);
      const bytes = set.files.reduce((sum, { file }) => {
        const { width, height } = size(file);
        return sum + width * height * 4;
      }, actors.width * actors.height * 4);
      expect(bytes).toBeLessThanOrEqual(60_000_000);
    }
  });

  it('caps a DPR 3 phone at 60 MB and keeps the older iPhone texture limit', () => {
    for (const weather of [undefined, ...skies]) for (const turned of [true, false]) {
      const set = keepPlateSet(turned, turned ? 390 * 3 : Math.floor(390 * 960 / 580 * 3), weather, weather === 'dusk');
      const opposite = turned ? ['landscape', 'siege-wide', 'gate-wide'] : ['portrait', 'siege-portrait', 'gate'];
      expect(set.files.every(({ file }) => file.endsWith('-half.webp'))).toBe(true);
      expect(set.files.some(({ name }) => opposite.includes(name))).toBe(false);
      const bytes = set.files.reduce((sum, { file }) => {
        const { width, height } = size(file);
        return sum + width * height * 4;
      }, 0);
      expect(bytes).toBeLessThanOrEqual(60_000_000);
    }
    for (const file of files) {
      const { width, height } = size(file);
      expect(Math.max(width, height), file).toBeLessThanOrEqual(4096);
      if (!file.endsWith('-half.webp')) {
        expect(size(file.replace('.webp', '-half.webp')), file).toEqual({ width: width / 2, height: height / 2 });
      }
    }
  });

  it('loads exactly the plates on disk, with one orientation and one resolution per visit', () => {
    const sets = [keepPlateSet(true, 1170), keepPlateSet(false, 1920),
      keepPlateSet(true, 1281), keepPlateSet(false, 2049)];
    for (const set of sets) expect(set.files).toHaveLength(11);
    expect(sets[2].files.some(({ file }) => file === 'portrait.webp')).toBe(true);
    expect(sets[3].files.some(({ file }) => file === 'landscape.webp')).toBe(true);
    for (const weather of skies) {
      const variants = [keepPlateSet(true, 1170, weather, weather === 'dusk'), keepPlateSet(false, 1920, weather, weather === 'dusk'),
        keepPlateSet(true, 1281, weather, weather === 'dusk'), keepPlateSet(false, 2049, weather, weather === 'dusk')];
      for (const { files } of variants) {
        expect(files.filter(({ name }) => name.startsWith('sky'))).toHaveLength(1);
        expect(files.some(({ name }) => name.startsWith('strike'))).toBe(weather === 'night storm');
        expect(files.some(({ name }) => name === 'drift')).toBe(weather !== 'dawn');
      }
      sets.push(...variants);
      sets.push(keepPlateSet(true, 1170, weather, weather === 'dusk', true),
        keepPlateSet(false, 2049, weather, weather === 'dusk', true));
    }
    expect([...new Set(sets.flatMap(set => set.files.map(({ file }) => file)))].sort()).toEqual(files);
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

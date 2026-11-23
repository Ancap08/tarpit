// Milestone 43 verifier: leftovers of the "Meadow only" limit that the milestone removed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TITLE_TEXT } from '../names';

const readme = readFileSync('README.md', 'utf8').replace(/\s+/g, ' ');

describe('no trace of the Meadow-only limit remains', () => {
  it('README How to play no longer says Switchback and Riverbend use Classic art', () => {
    expect(readme).not.toMatch(/Switchback and Riverbend use Classic art/);
  });
  it('README status paragraph no longer limits Painted to Meadow', () => {
    expect(readme).not.toMatch(/Classic remains the default and is used on Switchback and Riverbend/);
  });
  it('names.ts keeps no "Meadow only" Painted prompt', () => {
    expect(JSON.stringify(TITLE_TEXT)).not.toMatch(/Meadow only/);
  });
});

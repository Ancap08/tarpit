// Milestone 43 verifier: leftovers of the "Meadow only" limit that the milestone removed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TITLE_TEXT } from '../names';

const readme = readFileSync('README.md', 'utf8').replace(/\s+/g, ' ');

describe('no trace of the Meadow-only limit remains', () => {
  // DEFECT (verifier, milestone 43): README "How to play" step 1 still says
  // "see the miniature art on Meadow" and "Switchback and Riverbend use Classic art".
  it.fails('README How to play no longer says Switchback and Riverbend use Classic art', () => {
    expect(readme).not.toMatch(/Switchback and Riverbend use Classic art/);
  });
  // DEFECT: the v5 status paragraph still says Painted is for Meadow and Classic is used on the others.
  it.fails('README status paragraph no longer limits Painted to Meadow', () => {
    expect(readme).not.toMatch(/Classic remains the default and is used on Switchback and Riverbend/);
  });
  // DEFECT: the string is unused now but still ships in names.ts.
  it.fails('names.ts keeps no "Meadow only" Painted prompt', () => {
    expect(JSON.stringify(TITLE_TEXT)).not.toMatch(/Meadow only/);
  });
});

// SHA-256 of the unmodified runBot results serialized by d517ac8, in play
// order. Hash every result field, including the action log and terminal state.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { botBeginner, botGood, botPerson, runBot, type BotRun } from './bots';
import { createGame } from './game';
import { LEVELS } from './levels';
import { MAP_IDS } from './map';

const players = [
  {
    name: 'Good', bot: botGood,
    campaign: 'ed4da3e33b623f30cfc176240680339221a0d69f78736047654eea828b6019a4',
    free: '5354e8515f84844c32342d105a949db5bb103f361e70b971713ba794f86a7f13',
  },
  {
    name: 'Person', bot: botPerson,
    campaign: '3e87055c293b333eda07f5c96b11cb18c1fb40ea914e101e46aa68fe19ecf021',
    free: 'baa6e4269842428e75715ed6ff965c33e430a7c3682c7ba5957808263f94cdc2',
  },
  {
    name: 'Beginner', bot: botBeginner,
    campaign: 'fbf5097a91e4c90804ea0f1b9e97e65b5f70c1f88832bbb5f8eeabed8c2326cf',
    free: '9a058a4a3f753964b3aa7fa3da6f8c605d00bda93f9f578e2d0daf203e1364c1',
  },
];

function originalRunBytes(run: BotRun, label: string): string {
  // These bots never sell or undo a purchase, so the final towers record
  // every second path bought over the entire run.
  expect(run.state.towers.some(t => t.type === 'tarpit' && t.path === 'B'), label).toBe(false);
  expect(['won', 'lost'], label).toContain(run.state.phase);
  return JSON.stringify(run);
}

describe.each(players)('R7: $name without a path B Tar Pit', ({ bot, campaign, free }) => {
  it('keeps the complete bot output on every campaign level byte for byte', () => {
    const hash = createHash('sha256');
    for (const level of LEVELS) {
      hash.update(originalRunBytes(runBot(createGame({ level }), bot), `level ${level.id}`));
    }
    expect(hash.digest('hex')).toBe(campaign);
  }, 120_000);

  it('keeps complete Free play outputs, including barrel casts, byte for byte', () => {
    const hash = createHash('sha256');
    for (const map of MAP_IDS) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        // In d517ac8 Person actually bought Wide Tar in these four games.
        // The remaining 23 games across the three bots are fixed R7 controls.
        if (bot === botPerson && (map === 'switchback' || (map === 'riverbend' && difficulty === 'normal'))) continue;
        const run = runBot(createGame({ map, difficulty }), bot);
        hash.update(originalRunBytes(run, `${map} ${difficulty}`));
      }
    }
    expect(hash.digest('hex')).toBe(free);
  }, 120_000);
});

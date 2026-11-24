import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { botBeginner, botGood, botPerson, runBot } from './bots';
import { createGame } from './game';
import { LEVELS } from './levels';
import type { LevelDef } from './levelTypes';

// Milestone 49, 28e2d49. The first digest covers the complete level definition.
// The second covers complete Good, Person and Beginner runs with barrel casts skipped.
const original = [
  ['d4f7450abea445096aac2469dbb177b02b7530d2ac1b7acf92c869d6677eae0e', '12d546e2797672d173c065d01ebc19fca6afc8b72b9ee293f374ce5636d52f12'],
  ['2a64af57c3fa435854c1d9f071caf38c56e14fd22ba08cb8b0661371ced886d9', '17d387c64615060c0d5a7fd2d2471ec7285be2543164c6ee38652861e92b0c61'],
  ['fc4ce03be9250adc1776a26497f22d91ab1ec9eef63d86350e0cd97658784e42', 'd4a7df4789f263bbd440ee5e52e7a36b07b29cb6a93ad0fe239b404f9296fb1f'],
  ['8844b18a84e1cb05675883fb2a65028fb4888e3ff40140c6d98ae4ed40617d09', 'febf11acc3e530aa670dc195b9204b9f5980f486cc991b9bb006a28b5f19abd9'],
  ['106be9d72567c6775b74f37ba34ead962a1fcfdd19936b02209459b7b6bac213', '57cb461cff824fe40315dcc38120ddeae71f91450c3c3eb52c7c4c056b2fc001'],
  ['e8a6e649803223e3e111930d1b978bc79fed6859203ec5def0e6c3fcfbf8ef07', 'd1577098094c7eddf1371b2437d81f0294b7c8cc2bd895f3f47a745cdc5419d4'],
  ['12238a1da261fff935b9e73b230986430a6c9f57ad732f6a1315943615749710', '16ab321d35039939b62c7d971061733443ec82757c5c1f7188fb27274b2fd3dd'],
  ['34d8d99fc0a4e30b79692778767727037a8696389c49ce542cb379365fcb5bad', '3fec58e02ac6dec30e955475cf06670dab5fb8bbb1d026928b159b8323635b20'],
  ['e5da0d84b1b614015382166224076a8f31399cb052ddf216a5531ccbf7a26a1b', '30ce6781bc382738d2fc71a6cb91775759f681855ab67bbbd9cdf43aef966291'],
  ['5cd7114a88aa01aec5577db46e8b72cd86d919f02f3ddc4a93e13ed484ec106a', 'b55e331b3924641c1554e4406c4dc75d198b713d3fcb754066c623ee089ebe43'],
  ['e8fa576429f97985b9841ded8893518373493c6c2ca9a01a7c92d1141fd49c0f', 'f149e68fe58b56e5a6768cbc9662de3c78129f186e59059bf36539ca702d1e40'],
  ['25e8c3969f722a0941978476676fa163b629387c5b79bec7f63fbb05c55a8cab', '5196835ee370a58e1c27139267b866dfb2fa3a2565c1579bcafa99698762cf8f'],
  ['36769e0c9068a6ed8ca1c7b379835e14991c431344b1b2b5d177c992c6a9e1e0', '6970cdf21ad85b34d95714c118bc1d534c1a64d2b168f0e8ba022e0cf02c4f34'],
  ['9c94df9c3229eca76615a6b1a6e95445781e7b5a4fa34f72179c68909d54f529', '2e2924b523c97fc787361b5edc38ecfea364c525bf2b7e9c9acca17cc39d191e'],
  ['784ef2cd548e17268abc90f6a047e84c4694474e87c1a4dfef396f39a6c9e2a5', '6b3d8477b85ec984bc7a115899b9ff8da59d59e25331119f4ab1822ebf9d03fe'],
  ['5dd657438d0524f7c9dfe6da071bf4d97ed536bd437931820c63a4ca3d182b83', 'c1f8432a3feed0326b2ef97ddf2810a22fcc66ce5fc18edf34c59a2d114bb121'],
  ['d992d586a34840f685265bcc3269d6373bc5979473766d0eceedd2451097054c', '9c5407f04bfc0bcf2270ef66048ae29d26c0c89bc7e0d0389753f7c78c5e7cc7'],
  ['a5f309f8f9316b8709b95c050c439060eb98a969e113cf9d0275ed822ba6549d', 'a18c68bdfb2326574f1effd1f17e7ce7e9627df72b55f9b93a2477687ff1bc2d'],
  ['873c5df39e96493240cc14b6560e583f9add2085a33c625b593eb3b368d99aa7', '3d2a3501bad4911acb16854a36368d5cfbb28a7db4bd8da415cae4e3cd44b267'],
  ['438307c4e3aa27f4759c48016fac83193b0281599aad67a8cb88b3d71a59d55a', '78e54b522c762f53578adad4b9964493920436fa17e37bc2f3e9fd4bd87580ed'],
] as const;

type LevelChange = { id: number; field: 'hpScale' | 'startGold' | 'hpGrowthStart'; from: number; to: number };
const changes: readonly LevelChange[] = [];

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('C7: bounded campaign retune and no-barrel parity', () => {
  it('accounts for every changed field in each complete level definition', () => {
    expect(LEVELS).toHaveLength(original.length);
    for (const [index, level] of LEVELS.entries()) {
      const previous = { ...level };
      for (const change of changes.filter(row => row.id === level.id)) {
        expect(level.allowedSpecials, `level ${level.id}`).toContain('tarBarrel');
        expect(level[change.field]).toBe(change.to);
        expect(Math.abs(change.to - change.from)).toBeLessThanOrEqual(change.from * 0.15);
        previous[change.field] = change.from;
      }
      expect(digest(previous), `level ${level.id}`).toBe(original[index][0]);
    }
  });

  it.each(LEVELS.filter(level => !changes.some(change => change.id === level.id)))(
    'unchanged level $id without a barrel cast reproduces its original runs byte for byte', (level: LevelDef) => {
      const runs = [botGood, botPerson, botBeginner].map(player => runBot(createGame({ level }), {
        ...player,
        special(state, lastZone) {
          const choice = player.special(state, lastZone);
          return choice?.special === 'tarBarrel' ? undefined : choice;
        },
      }));
      expect(digest(runs)).toBe(original[level.id - 1][1]);
    }, 60_000,
  );
});

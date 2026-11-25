import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MATRIX_ARCHETYPES, balanceRun, runsOn } from './balanceRuns';
import { botBeginner, botFeathers, botGood, botGoodFeat, botPerson, botPersonFeat, preferFeathers, runBot } from './bots';
import { DIFFICULTIES } from './difficulty';
import { createGame } from './game';
import { LEVELS } from './levels';
import type { GroupDef } from './types';

// Captured on main at dca7edf. Hash the raw JSON of each complete result in
// order, including action logs and terminal state. No fields are projected out.
const players = [botGood, botPerson, botBeginner, botFeathers, botGoodFeat, botPersonFeat];
const forcedPlayers = [preferFeathers(botGood), preferFeathers(botPerson)];
const firstAct = [
  '1a220bf1ca88145ae9e4408bc66f167c557f9ab8a54217026093407b2facfcf7',
  'ead16d2486359333afa0570c21a5e3e7f310a8c259a024242c5043d969b52971',
  '15f9fc1ac8c7439a0b1d01bd4e8184eec660d6fdf3c117bd7d0c8a236695eb0e',
  'df7ce60bba5e802e6d28ad953c370e7dcb1acf495da3baa8065f71f93dc1e83e',
  '1ebb32a1886c6b350e85d5d4e3a2b58152ef69482ccffac1de0d23a4a4ca6d36',
  'c8974b6e3f3d8a546ef6e631f375edabdc3b1f5410e538b4a81b06cf421607c3',
  '26c51dfecf01371aa8b10cad1d701f0aa2d6298e60888b4746d1e9962617fc6c',
  '28b4f4db2e23323afa9183285ba3df2a67df32b5b43c6de7143fafb2d7ea0078',
  '76a7118fefd9c88c1021658289180565a452477a9fcd9615f66f795f3f022189',
  '66ee640e5c0eb5fd423a70dd84202b2e753e156d5c9b50f26d44d08f06405902',
] as const;

// The two new policy wrappers run against main's engine with the same purchases and aim.
const firstActForced = [
  '1b5268d132c020044ff5f7edbed5ee6dce976db4cf975a379a59f555ebba2cce',
  '16e528e428f267a594924edfad132da2606a3d0f9c5aa43de2b1f925a7b1d8ba',
  '8ddfde90b1f4365931870334019f94e127eaa560b3a11517bfc541ef66be8440',
  'd70066e0d0b5976420253a0acf8362c92e5ecf83ef8ea92498507040f140a4a5',
  'e54169912ed13312de63dac04e521dded8904a83b7ea3d33a054f4d982080fa6',
  '5c59f1a9466a11f69b65039058acd6db353df2efef63ec49f24cda3b6b3cbde0',
  '1ac0e8662f2270eec58aec1e65d057bf180ebbce38fd4cf88a62c29a424e14ae',
  '1b4c9cf761c8b46cbe01ca72e9d019ac59838c36e421c8e42d3319d8decdd5ae',
  '4de07527e9f568612e695f71f1c2179ff568bb68b180e764d19b948ee04f9e18',
  'a18505bf38fe5c4dc36657ba0a6f2229550be3c1c3ac460d98fc1a28df481284',
] as const;

const freePlay = [
  { map: 'meadow',
    bots: '0c640ae4113ad4576fa4485b7df2cd02e15547050aafc3bd7fcdd5078536f983',
    forced: 'd8cb5266eed042fda8e9ca77ffea8da2000da38bdd836bfd80a904ab44c9def7',
    matrix: 'fde898bc398539297a3daba58b9190c8520f406514b71b61d37ed3df4bdaa366' },
  { map: 'switchback',
    bots: '6718c5be68dc8c56a532bc0abbb41a155616a6ba1fce3b5873a136d41942b2aa',
    forced: 'ee65684c9e906bbd5789fcbc3abb265e7abaebeec78b02139c9df84b1366abdf',
    matrix: 'cdb3538e39e8486b0fe817e3b80de9c3d5814b36ddbbb4a1262ee22fd1c4d042' },
  { map: 'riverbend',
    bots: 'e14a34242e5fdd5a0cb818d800530d5e1f7438e0edfd971eebfc780e95bc68b9',
    forced: '16ab5cf3885f550fa2078578fb7f6bd104191c6daf996c0fe4590fb57a9cb1c5',
    matrix: 'f19343b5d2cd388c788d34a44868e189097d38fffadec2f6be1b8c2973ad948c' },
] as const;

function digest(values: readonly unknown[]): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(JSON.stringify(value));
  return hash.digest('hex');
}

it.each(LEVELS.slice(0, 10))('C7: all six main bots and both forced policies on level $id match byte for byte', level => {
  const runs = players.map(bot => runBot(createGame({ level }), bot));
  expect(digest(runs)).toBe(firstAct[level.id - 1]);
  const forced = forcedPlayers.map(bot => runBot(createGame({ level }), bot));
  expect(digest(forced)).toBe(firstActForced[level.id - 1]);
}, 60_000);

describe.each(freePlay)('C4: Free play on $map', ({ map, bots, forced, matrix }) => {
  it('keeps the complete runs of every bot on each difficulty', () => {
    const runs = DIFFICULTIES.flatMap(difficulty => players.map(bot => runBot(createGame({ map, difficulty }), bot)));
    expect(digest(runs)).toBe(bots);
    const forcedRuns = DIFFICULTIES.flatMap(difficulty => forcedPlayers.map(bot => runBot(createGame({ map, difficulty }), bot)));
    expect(digest(forcedRuns)).toBe(forced);
  }, 120_000);

  it('keeps the complete balance matrix on each difficulty', () => {
    const runs = DIFFICULTIES.flatMap(difficulty => MATRIX_ARCHETYPES.filter(name => runsOn(name, map))
      .map(name => balanceRun(name, map, difficulty)));
    expect(digest(runs)).toBe(matrix);
  }, 240_000);
});

// Reversing the listed changes must reconstruct the complete main definitions,
// including every wave group, rule, tax, unlock and field order.
const definitions = [
  'd4f7450abea445096aac2469dbb177b02b7530d2ac1b7acf92c869d6677eae0e',
  '2a64af57c3fa435854c1d9f071caf38c56e14fd22ba08cb8b0661371ced886d9',
  'fc4ce03be9250adc1776a26497f22d91ab1ec9eef63d86350e0cd97658784e42',
  '8844b18a84e1cb05675883fb2a65028fb4888e3ff40140c6d98ae4ed40617d09',
  '106be9d72567c6775b74f37ba34ead962a1fcfdd19936b02209459b7b6bac213',
  'e8a6e649803223e3e111930d1b978bc79fed6859203ec5def0e6c3fcfbf8ef07',
  '12238a1da261fff935b9e73b230986430a6c9f57ad732f6a1315943615749710',
  '34d8d99fc0a4e30b79692778767727037a8696389c49ce542cb379365fcb5bad',
  'e5da0d84b1b614015382166224076a8f31399cb052ddf216a5531ccbf7a26a1b',
  '5cd7114a88aa01aec5577db46e8b72cd86d919f02f3ddc4a93e13ed484ec106a',
  'e8fa576429f97985b9841ded8893518373493c6c2ca9a01a7c92d1141fd49c0f',
  '25e8c3969f722a0941978476676fa163b629387c5b79bec7f63fbb05c55a8cab',
  '36769e0c9068a6ed8ca1c7b379835e14991c431344b1b2b5d177c992c6a9e1e0',
  '9c94df9c3229eca76615a6b1a6e95445781e7b5a4fa34f72179c68909d54f529',
  '784ef2cd548e17268abc90f6a047e84c4694474e87c1a4dfef396f39a6c9e2a5',
  '5dd657438d0524f7c9dfe6da071bf4d97ed536bd437931820c63a4ca3d182b83',
  'd992d586a34840f685265bcc3269d6373bc5979473766d0eceedd2451097054c',
  'a5f309f8f9316b8709b95c050c439060eb98a969e113cf9d0275ed822ba6549d',
  '873c5df39e96493240cc14b6560e583f9add2085a33c625b593eb3b368d99aa7',
  '438307c4e3aa27f4759c48016fac83193b0281599aad67a8cb88b3d71a59d55a',
] as const;

const goldChanges = [
  { id: 12, from: 260, to: 269 },
  { id: 18, from: 260, to: 275 },
  { id: 20, from: 245, to: 270 },
];

type WaveChange = {
  id: number;
  wave: number;
  group: number;
  from: Partial<GroupDef>;
  to: Partial<GroupDef>;
};
const waveChanges: readonly WaveChange[] = [
  { id: 11, wave: 6, group: 1, from: { count: 21 }, to: { count: 19 } },
  { id: 12, wave: 1, group: 1, from: { interval: 1.15 }, to: { interval: 1.265 } },
  { id: 12, wave: 6, group: 1, from: { interval: 0.8 }, to: { interval: 0.79 } },
  { id: 12, wave: 6, group: 2, from: { count: 21 }, to: { count: 22 } },
  { id: 13, wave: 3, group: 2, from: { count: 39 }, to: { count: 34 } },
  { id: 13, wave: 5, group: 1, from: { count: 15 }, to: { count: 13 } },
  { id: 17, wave: 2, group: 1, from: { count: 30 }, to: { count: 27 } },
  { id: 17, wave: 5, group: 2, from: { type: 'harpy' }, to: { type: 'goblin' } },
  { id: 19, wave: 2, group: 2, from: { interval: 1.08 }, to: { interval: 1.2312 } },
  { id: 19, wave: 3, group: 1, from: { interval: 1.75 }, to: { interval: 1.61 } },
  { id: 20, wave: 2, group: 2, from: { type: 'harpy' }, to: { type: 'goblin' } },
  { id: 20, wave: 6, group: 1, from: { interval: 3 }, to: { interval: 2.85 } },
];

it('C7: every changed level number is accounted for', () => {
  expect(LEVELS).toHaveLength(definitions.length);
  for (const level of LEVELS) {
    const { featherBarrels, ...original } = structuredClone(level);
    expect(featherBarrels, `level ${level.id}`).toBe(level.id > 10 ? true : undefined);
    for (const change of goldChanges.filter(row => row.id === level.id)) {
      expect(level.id).toBeGreaterThan(10);
      expect(original.startGold).toBe(change.to);
      expect(Math.abs(change.to - change.from)).toBeLessThanOrEqual(change.from * 0.15);
      original.startGold = change.from;
    }
    for (const change of waveChanges.filter(row => row.id === level.id)) {
      expect(level.id).toBeGreaterThan(10);
      const group = original.waves[change.wave - 1].groups[change.group - 1];
      expect(group, `level ${level.id} wave ${change.wave} group ${change.group}`).toMatchObject(change.to);
      Object.assign(group, change.from);
    }
    expect(digest([original]), `level ${level.id}`).toBe(definitions[level.id - 1]);
  }
});

// Local high score (milestone 26, docs/SCOPE-v4.md "Endless mode and high
// score"): the best "waves cleared" per map and difficulty, kept in
// localStorage under `tarpit.best` as
//   { "v": 1, "best": { "meadow": { "easy": 12, "normal": 10 } } }
// keyed by map then level, so later maps need no migration. Pure functions
// parse, merge and serialize the table; HighScoreStore wraps the storage in
// try/catch and keeps the table in memory too, so private mode or a full
// quota never throws and the best still shows for the page session. No
// Phaser here, so it is unit tested.

import { DIFFICULTIES, type Difficulty } from '../sim';

/** The localStorage key. */
export const HIGH_SCORE_KEY = 'tarpit.best';
/** The stored shape's version. */
export const HIGH_SCORE_VERSION = 1;
/** Today's only map (milestone 27 adds more). */
export const DEFAULT_MAP_ID = 'meadow';

/** Best waves cleared, by map id, then level. A missing entry means no score. */
export type BestTable = Record<string, Partial<Record<Difficulty, number>>>;

/** A score worth keeping: a whole number of waves, at least 1 (a score is only saved after a clear). */
function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a stored string into a table. Anything malformed is ignored, part by
 * part: bad JSON, a missing or other version, or a non-object gives an
 * empty table; a map entry that is not an object, an unknown level, and a
 * score that is not a whole number of at least 1 are dropped; unknown keys
 * are ignored. Never throws.
 */
export function parseBest(raw: string | null | undefined): BestTable {
  if (typeof raw !== 'string') return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(data) || data.v !== HIGH_SCORE_VERSION || !isRecord(data.best)) return {};
  const table: BestTable = {};
  for (const [mapId, levels] of Object.entries(data.best)) {
    if (!isRecord(levels) || mapId === '__proto__') continue;
    const entry: Partial<Record<Difficulty, number>> = {};
    for (const level of DIFFICULTIES) {
      const score = levels[level];
      if (Object.hasOwn(levels, level) && isScore(score)) entry[level] = score;
    }
    if (Object.keys(entry).length > 0) table[mapId] = entry;
  }
  return table;
}

/** The best score for this map and level, or undefined if there is none. */
export function bestFor(table: BestTable, mapId: string, difficulty: Difficulty): number | undefined {
  return Object.hasOwn(table, mapId) ? table[mapId][difficulty] : undefined;
}

function copyTable(table: BestTable): BestTable {
  const out: BestTable = {};
  for (const [id, levels] of Object.entries(table)) out[id] = { ...levels };
  return out;
}

/**
 * A copy of `table` with `score` kept for this map and level if it beats
 * the stored one (keep the larger). A score that is not a whole number of
 * at least 1 changes nothing.
 */
export function mergeBest(table: BestTable, mapId: string, difficulty: Difficulty, score: number): BestTable {
  const out = copyTable(table);
  if (!isScore(score)) return out;
  const old = bestFor(out, mapId, difficulty);
  if (old === undefined || score > old) out[mapId] = { ...out[mapId], [difficulty]: score };
  return out;
}

/** Every score of `b` merged into `a`, keeping the larger. */
function mergeTables(a: BestTable, b: BestTable): BestTable {
  let out = copyTable(a);
  for (const [mapId, levels] of Object.entries(b)) {
    for (const level of DIFFICULTIES) {
      const score = levels[level];
      if (score !== undefined) out = mergeBest(out, mapId, level, score);
    }
  }
  return out;
}

/** The stored string for a table: `{"v":1,"best":{...}}`. */
export function serializeBest(table: BestTable): string {
  return JSON.stringify({ v: HIGH_SCORE_VERSION, best: table });
}

/** The part of the Web Storage API the store uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The high score table behind localStorage. `getStorage` may return
 * undefined or throw (storage blocked); reads and writes that fail are
 * ignored, and the table also lives in memory for the page session, so a
 * best recorded while storage fails still shows until the page reloads.
 */
export class HighScoreStore {
  private memory: BestTable = {};

  constructor(private readonly getStorage: () => StorageLike | undefined | null) {}

  /** The stored table merged with the in-memory one. Never throws. */
  table(): BestTable {
    let stored: BestTable = {};
    try {
      stored = parseBest(this.getStorage()?.getItem(HIGH_SCORE_KEY));
    } catch {
      stored = {};
    }
    return mergeTables(stored, this.memory);
  }

  /** The best waves cleared on this map and level, or undefined. */
  best(difficulty: Difficulty, mapId = DEFAULT_MAP_ID): number | undefined {
    return bestFor(this.table(), mapId, difficulty);
  }

  /**
   * Keep `score` if it beats the best for this map and level; write the
   * table back to storage (failures ignored). Returns whether it was a new
   * best.
   */
  record(difficulty: Difficulty, score: number, mapId = DEFAULT_MAP_ID): boolean {
    const table = this.table();
    const old = bestFor(table, mapId, difficulty);
    if (!isScore(score) || (old !== undefined && score <= old)) return false;
    const next = mergeBest(table, mapId, difficulty, score);
    this.memory = next;
    try {
      this.getStorage()?.setItem(HIGH_SCORE_KEY, serializeBest(next));
    } catch {
      // Private mode or a full quota: the best stays in memory for this page session.
    }
    return true;
  }
}

/** The game's store, on window.localStorage when there is one. */
export const highScores = new HighScoreStore(() => (typeof window === 'undefined' ? undefined : window.localStorage));

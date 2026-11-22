import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../highScore';
import { MUTE_KEY, MuteStore, parseMuted, serializeMuted } from './muteSetting';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

describe('parseMuted', () => {
  it('is muted only for "1"; missing, "0" and junk mean sound on', () => {
    expect(parseMuted('1')).toBe(true);
    expect(parseMuted(' 1 ')).toBe(true);
    for (const raw of [null, undefined, '', '0', 'true', 'yes', '{"muted":true}', '11']) expect(parseMuted(raw)).toBe(false);
  });

  it('round-trips through serializeMuted', () => {
    expect(parseMuted(serializeMuted(true))).toBe(true);
    expect(parseMuted(serializeMuted(false))).toBe(false);
  });
});

describe('MuteStore', () => {
  it('defaults to sound on and stores the choice under its own key', () => {
    const storage = memoryStorage();
    const store = new MuteStore(() => storage);
    expect(store.get()).toBe(false);
    store.set(true);
    expect(storage.data[MUTE_KEY]).toBe('1');
    expect(new MuteStore(() => storage).get()).toBe(true);
    store.set(false);
    expect(storage.data[MUTE_KEY]).toBe('0');
  });

  it('never throws when storage is missing, blocked or full, and keeps the choice in memory', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    for (const get of [() => undefined, () => null, () => throwing, () => {
      throw new Error('blocked');
    }]) {
      const store = new MuteStore(get);
      expect(store.get()).toBe(false);
      expect(() => store.set(true)).not.toThrow();
      expect(store.get()).toBe(true);
    }
  });

  it('leaves the best scores alone', () => {
    const storage = memoryStorage({ 'tarpit.best': '{"v":1,"best":{}}' });
    new MuteStore(() => storage).set(true);
    expect(storage.data['tarpit.best']).toBe('{"v":1,"best":{}}');
  });
});

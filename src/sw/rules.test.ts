import { describe, expect, it } from 'vitest';
import { cacheName, isOldCache, isOwnCache, requestKind, shouldRegister } from './rules';

describe('service worker rules', () => {
  it('names one cache per build and copy, and treats only that copy\'s other builds as old', () => {
    const scope = 'https://ancap08.github.io/tarpit/';
    const current = cacheName(scope, 'abc123');
    expect(current).toBe('tarpit|/tarpit/|abc123');
    expect(cacheName('http://localhost:4173/', 'abc123')).toBe('tarpit|/|abc123');
    expect(isOldCache('tarpit|/tarpit/|old', scope, current)).toBe(true);
    expect(isOldCache(current, scope, current)).toBe(false);
    // Other sites and other copies of the game on the same origin are never this copy's.
    for (const other of ['someone-else', 'other-v1', 'tarpit|/|old', 'tarpit|/tarpit-preview/|old', 'tarpit|/tarpit/x/|old', 'tarpit-old']) {
      expect(isOldCache(other, scope, current), other).toBe(false);
      expect(isOwnCache(other, scope), other).toBe(false);
    }
    // The root copy does not own a /tarpit/ copy's caches either.
    expect(isOwnCache('tarpit|/tarpit/|abc123', 'http://localhost:4173/')).toBe(false);
  });

  for (const scope of ['http://localhost:4173/', 'https://ancap08.github.io/tarpit/']) {
    const base = new URL(scope);
    const at = (p: string) => new URL(p, scope).href;
    it(`sorts requests under ${base.pathname}`, () => {
      expect(requestKind({ method: 'GET', url: at('./'), mode: 'navigate' }, scope)).toBe('page');
      expect(requestKind({ method: 'GET', url: at('./?test=1'), mode: 'navigate' }, scope)).toBe('page');
      expect(requestKind({ method: 'GET', url: at('index.html') }, scope)).toBe('page');
      expect(requestKind({ method: 'GET', url: at('assets/index-Ab12.js') }, scope)).toBe('hashed');
      expect(requestKind({ method: 'GET', url: at('icons/icon-192.png') }, scope)).toBe('other');
      expect(requestKind({ method: 'GET', url: at('manifest.webmanifest') }, scope)).toBe('other');
      expect(requestKind({ method: 'GET', url: at('sw.js') }, scope)).toBe('pass');
      expect(requestKind({ method: 'POST', url: at('./') }, scope)).toBe('pass');
      expect(requestKind({ method: 'GET', url: 'https://example.com/x.js' }, scope)).toBe('pass');
    });
  }

  it('passes requests outside a /tarpit/ scope on the same origin', () => {
    const scope = 'https://ancap08.github.io/tarpit/';
    expect(requestKind({ method: 'GET', url: 'https://ancap08.github.io/other/index.html' }, scope)).toBe('pass');
    expect(requestKind({ method: 'GET', url: 'https://ancap08.github.io/tarpit' }, scope)).toBe('pass');
  });

  it('registers only in production and never in test or perf mode', () => {
    expect(shouldRegister(true, '')).toBe(true);
    expect(shouldRegister(true, '?renderer=canvas')).toBe(true);
    expect(shouldRegister(false, '')).toBe(false);
    expect(shouldRegister(true, '?test=1')).toBe(false);
    expect(shouldRegister(true, '?perf=1')).toBe(false);
  });
});

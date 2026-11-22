import { describe, expect, it } from 'vitest';
import { cacheName, isOldCache, requestKind, shouldRegister } from './rules';

describe('service worker rules', () => {
  it('names one cache per build and treats only other tarpit caches as old', () => {
    expect(cacheName('abc123')).toBe('tarpit-abc123');
    expect(isOldCache('tarpit-old', 'tarpit-abc123')).toBe(true);
    expect(isOldCache('tarpit-abc123', 'tarpit-abc123')).toBe(false);
    expect(isOldCache('someone-else', 'tarpit-abc123')).toBe(false);
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

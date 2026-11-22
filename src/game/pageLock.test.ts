import { describe, expect, it } from 'vitest';
import { recoveryFor } from './pageLock';

const at = (scale: number, offsetLeft = 0, offsetTop = 0, scrollX = 0, scrollY = 0) => ({ scale, offsetLeft, offsetTop, scrollX, scrollY });

describe('recoveryFor', () => {
  it('does nothing when the page is at scale 1 and the origin', () => {
    expect(recoveryFor(at(1))).toBeNull();
    expect(recoveryFor(at(1.005, 0.3, 0.2))).toBeNull();
  });
  it('scrolls back when the visual viewport or the window is offset', () => {
    expect(recoveryFor(at(1, 12, 0))).toEqual({ scroll: true, rescale: false });
    expect(recoveryFor(at(1, 0, 40))).toEqual({ scroll: true, rescale: false });
    expect(recoveryFor(at(1, 0, 0, 0, 3))).toEqual({ scroll: true, rescale: false });
  });
  it('rescales a zoom in or out, with or without an offset', () => {
    expect(recoveryFor(at(0.8))).toEqual({ scroll: false, rescale: true });
    expect(recoveryFor(at(2.4, 100, 300))).toEqual({ scroll: true, rescale: true });
  });
});

import { describe, expect, it } from 'vitest';
import { boxFitFor, recoveryFor } from './pageLock';

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

describe('boxFitFor', () => {
  const layout = { width: 390, height: 844 };
  it('keeps the CSS at scale 1, no offset, the layout size', () => {
    expect(boxFitFor({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 390, height: 844 }, layout)).toEqual({ kind: 'css' });
    expect(boxFitFor(null, layout)).toEqual({ kind: 'css' });
  });
  it('fits the visible rectangle when zoomed in or out, or offset', () => {
    expect(boxFitFor({ scale: 1.4, offsetLeft: 30, offsetTop: 60, width: 278.6, height: 602.9 }, layout)).toEqual({ kind: 'visible', left: 30, top: 60, width: 278.6, height: 602.9, scale: 1.4 });
    expect(boxFitFor({ scale: 0.8, offsetLeft: -20, offsetTop: -40, width: 487.5, height: 1055 }, layout)).toMatchObject({ kind: 'visible', width: 487.5, scale: 0.8 });
    expect(boxFitFor({ scale: 1, offsetLeft: 0, offsetTop: 12, width: 390, height: 844 }, layout)).toMatchObject({ kind: 'visible', top: 12 });
  });
  it('fits the visible size at scale 1 when a toolbar changed it', () => {
    expect(boxFitFor({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 390, height: 760 }, layout)).toMatchObject({ kind: 'visible', height: 760 });
  });
});

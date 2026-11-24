import { describe, expect, it } from 'vitest';
import { createGame } from '../../sim';
import { FieldMemory, MARK_CAP, WEAR_BINS, memoryFor } from './battleField';

function mark(born: number) {
  return { kind: 'hat' as const, start: { x: 250, y: 122 }, end: { x: 261, y: 127 },
    born, lift: 14, duration: 580, turn: 0.32 };
}

describe('a Meadow battlefield', () => {
  it('recycles its oldest landing while retaining the most recent impacts', () => {
    const memory = new FieldMemory();
    const count = MARK_CAP * 100 + 3;
    for (let i = 0; i < count; i++) memory.add(mark(i));
    expect(memory.marks.map(m => m.born).sort((a, b) => a - b))
      .toEqual(Array.from({ length: MARK_CAP }, (_, i) => count - MARK_CAP + i));
  });

  it('saturates trampled stretches without darkening unused stretches', () => {
    const memory = new FieldMemory();
    for (let visit = 0; visit < 1000; visit++) {
      memory.tread(2);
      memory.tread(-1);
      memory.tread(WEAR_BINS);
    }
    expect(memory.traffic.length).toBe(WEAR_BINS);
    expect(memory.traffic[2]).toBe(18);
    expect([...memory.traffic].filter(Boolean)).toEqual([18]);
  });

  it('carries world-space landings across layouts and releases them on replay', () => {
    const game = createGame();
    memoryFor(game).add(mark(100));
    const restored = memoryFor(game);
    expect(restored.marks).toEqual([mark(100)]);
    expect(memoryFor(createGame()).marks).toEqual([]);
  });
});

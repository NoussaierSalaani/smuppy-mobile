import { secureRandomInt, shuffleInPlace, computeInsertIndex } from '../../services/moodRecommendation';

const originalCrypto = global.crypto;

function mockCrypto(sequence: number[]) {
  let idx = 0;
  const mock = {
    getRandomValues: (arr: Uint32Array) => {
      const next = sequence[idx % sequence.length];
      idx += 1;
      arr[0] = next;
      return arr;
    },
  } as Crypto;

  (global as typeof globalThis).crypto = mock;
}

afterEach(() => {
  (global as typeof globalThis).crypto = originalCrypto;
});

describe('secureRandomInt', () => {
  it('returns value within range using crypto', () => {
    mockCrypto([0]);
    expect(secureRandomInt(5)).toBe(0);
  });

  it('returns upper bound minus one when crypto provides near-limit value', () => {
    mockCrypto([2]);
    expect(secureRandomInt(3)).toBe(2);
  });
});

describe('shuffleInPlace', () => {
  it('returns a permutation using secure randomness', () => {
    mockCrypto([0, 0, 0, 0]);
    const arr = [1, 2, 3, 4];
    const shuffled = shuffleInPlace([...arr]);
    expect(shuffled).toEqual([2, 3, 4, 1]); // deterministic with mocked zeros
    expect(shuffled.sort()).toEqual(arr.sort());
  });
});

describe('computeInsertIndex', () => {
  it('returns 3 when length is 3 or less', () => {
    mockCrypto([0]);
    expect(computeInsertIndex(3)).toBe(3);
    expect(computeInsertIndex(2)).toBe(3);
  });

  it('is at least 3 and below length when length > 3', () => {
    mockCrypto([0]);
    expect(computeInsertIndex(6)).toBeGreaterThanOrEqual(3);
    expect(computeInsertIndex(6)).toBeLessThanOrEqual(5);
  });

  it('can hit upper bound when randomness is max in range', () => {
    mockCrypto([2]);
    expect(computeInsertIndex(6)).toBe(5);
  });

  it('returns a value within [3, length-1] for length 10 with deterministic rng', () => {
    // range = length - 3 = 7; mock returns 4 -> insertIndex = 7
    mockCrypto([4]);
    const idx = computeInsertIndex(10);
    expect(idx).toBe(7);
    expect(idx).toBeGreaterThanOrEqual(3);
    expect(idx).toBeLessThan(10);
  });
});

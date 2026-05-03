import { describe, expect, it } from 'vitest';
import { equalSplitMinor, fromMinor, toMinor } from '@buddysplit/shared';

describe('equalSplitMinor', () => {
  it('exact division', () => {
    const shares = equalSplitMinor(900, 3);
    expect(shares).toEqual([300, 300, 300]);
    expect(shares.reduce((s, n) => s + n, 0)).toBe(900);
  });

  it('distributes remainder to first N members', () => {
    const shares = equalSplitMinor(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((s, n) => s + n, 0)).toBe(1000);
  });

  it('handles zero', () => {
    expect(equalSplitMinor(0, 3)).toEqual([0, 0, 0]);
  });

  it('handles n=0', () => {
    expect(equalSplitMinor(100, 0)).toEqual([]);
  });
});

describe('toMinor / fromMinor', () => {
  it('round trips EUR', () => {
    expect(toMinor(12.34, 'EUR')).toBe(1234);
    expect(fromMinor(1234, 'EUR')).toBe(12.34);
  });

  it('round trips JPY', () => {
    expect(toMinor(1234, 'JPY')).toBe(1234);
    expect(fromMinor(1234, 'JPY')).toBe(1234);
  });

  it('rounds half cents', () => {
    expect(toMinor(0.005, 'EUR')).toBe(1);
  });
});

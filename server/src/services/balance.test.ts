import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  type GroupSnapshot,
  type Invoice,
} from '@buddysplit/shared';
import { computeActivityBalance, computeGroupBalance, validateSplit } from './balance.js';

function snap(invoices: Invoice[], opts?: { balanced?: boolean }): GroupSnapshot {
  return {
    meta: {
      id: 'g1',
      name: 'Test',
      ownerUserId: 'u1',
      currency: 'EUR',
      createdAt: '2025-01-01T00:00:00Z',
      schemaVersion: SCHEMA_VERSION,
    },
    members: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Carol' },
    ],
    activities: [{ id: 'act1', name: 'Trip', balanced: opts?.balanced ?? false }],
    invoicesByActivity: { act1: invoices },
  };
}

describe('balance', () => {
  it('equal split: payer is owed by others', () => {
    const inv: Invoice = {
      id: 'i1',
      date: '2025-01-01',
      concept: 'Dinner',
      description: '',
      amount: 30,
      payerId: 'a',
      balanced: false,
      split: { a: 10, b: 10, c: 10 },
    };
    const bal = computeGroupBalance(snap([inv]));
    expect(bal.totals.find((m) => m.memberId === 'a')!.net).toBeCloseTo(20, 5);
    expect(bal.totals.find((m) => m.memberId === 'b')!.net).toBeCloseTo(-10, 5);
    expect(bal.totals.find((m) => m.memberId === 'c')!.net).toBeCloseTo(-10, 5);
    const sum = bal.totals.reduce((s, m) => s + m.net, 0);
    expect(sum).toBeCloseTo(0, 5);
  });

  it('balanced activity is excluded from totals but visible per-activity', () => {
    const inv: Invoice = {
      id: 'i1',
      date: '2025-01-01',
      concept: 'Dinner',
      description: '',
      amount: 30,
      payerId: 'a',
      balanced: true,
      split: { a: 10, b: 10, c: 10 },
    };
    const bal = computeGroupBalance(snap([inv], { balanced: true }));
    expect(bal.totals.every((m) => m.net === 0)).toBe(true);
    expect(bal.perActivity[0]?.balanced).toBe(true);
    // per-activity members all show 0 because activity is balanced
    expect(bal.perActivity[0]?.members.every((m) => m.net === 0)).toBe(true);
  });

  it('multiple invoices accumulate', () => {
    const invs: Invoice[] = [
      {
        id: 'i1',
        date: '2025-01-01',
        concept: 'Dinner',
        description: '',
        amount: 30,
        payerId: 'a',
        balanced: false,
        split: { a: 10, b: 10, c: 10 },
      },
      {
        id: 'i2',
        date: '2025-01-02',
        concept: 'Taxi',
        description: '',
        amount: 12,
        payerId: 'b',
        balanced: false,
        split: { a: 4, b: 4, c: 4 },
      },
    ];
    const bal = computeGroupBalance(snap(invs));
    // a: paid 30, owed 14 -> +16
    // b: paid 12, owed 14 -> -2
    // c: paid  0, owed 14 -> -14
    expect(bal.totals.find((m) => m.memberId === 'a')!.net).toBeCloseTo(16, 5);
    expect(bal.totals.find((m) => m.memberId === 'b')!.net).toBeCloseTo(-2, 5);
    expect(bal.totals.find((m) => m.memberId === 'c')!.net).toBeCloseTo(-14, 5);
  });

  it('custom split where payer is excluded', () => {
    const inv: Invoice = {
      id: 'i1',
      date: '2025-01-01',
      concept: 'Cab for B+C',
      description: '',
      amount: 20,
      payerId: 'a',
      balanced: false,
      split: { a: 0, b: 10, c: 10 },
    };
    const bal = computeGroupBalance(snap([inv]));
    expect(bal.totals.find((m) => m.memberId === 'a')!.net).toBeCloseTo(20, 5);
    expect(bal.totals.find((m) => m.memberId === 'b')!.net).toBeCloseTo(-10, 5);
    expect(bal.totals.find((m) => m.memberId === 'c')!.net).toBeCloseTo(-10, 5);
  });

  it('individual invoice balanced flag is respected even if activity is open', () => {
    const invs: Invoice[] = [
      {
        id: 'i1',
        date: '2025-01-01',
        concept: 'Old',
        description: '',
        amount: 30,
        payerId: 'a',
        balanced: true,
        split: { a: 10, b: 10, c: 10 },
      },
      {
        id: 'i2',
        date: '2025-01-02',
        concept: 'New',
        description: '',
        amount: 12,
        payerId: 'b',
        balanced: false,
        split: { a: 4, b: 4, c: 4 },
      },
    ];
    const bal = computeActivityBalance(snap(invs), 'act1')!;
    expect(bal.members.find((m) => m.memberId === 'a')!.net).toBeCloseTo(-4, 5);
    expect(bal.members.find((m) => m.memberId === 'b')!.net).toBeCloseTo(8, 5);
    expect(bal.members.find((m) => m.memberId === 'c')!.net).toBeCloseTo(-4, 5);
  });
});

describe('validateSplit', () => {
  it('accepts shares that sum to amount', () => {
    expect(validateSplit(30, { a: 10, b: 10, c: 10 }, 'EUR')).toBeNull();
  });

  it('rejects shares that do not sum', () => {
    expect(validateSplit(30, { a: 10, b: 10, c: 11 }, 'EUR')).toMatch(/do not sum/);
  });

  it('rejects negative shares', () => {
    expect(validateSplit(10, { a: 11, b: -1 }, 'EUR')).toMatch(/non-negative/);
  });

  it('handles JPY (no minor units)', () => {
    expect(validateSplit(300, { a: 100, b: 100, c: 100 }, 'JPY')).toBeNull();
  });
});

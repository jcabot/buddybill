import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type GroupSnapshot } from '@buddysplit/shared';
import {
  buildEmptyWorkbook,
  snapshotFromWorkbook,
  workbookFromBuffer,
  workbookFromSnapshot,
  workbookToBuffer,
} from './excelSchema.js';

describe('excelSchema round-trip', () => {
  it('builds an empty workbook with required sheets', () => {
    const wb = buildEmptyWorkbook({
      id: 'g1',
      name: 'Test',
      ownerUserId: 'u1',
      currency: 'EUR',
      createdAt: '2025-01-01T00:00:00Z',
      schemaVersion: SCHEMA_VERSION,
    });
    expect(wb.SheetNames).toContain('Meta');
    expect(wb.SheetNames).toContain('Members');
    expect(wb.SheetNames).toContain('Activities');
  });

  it('round-trips a populated snapshot through write/read', () => {
    const original: GroupSnapshot = {
      meta: {
        id: 'g1',
        name: 'Lisbon Trip',
        ownerUserId: 'u1',
        currency: 'EUR',
        createdAt: '2025-01-01T00:00:00Z',
        schemaVersion: SCHEMA_VERSION,
      },
      members: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
      activities: [{ id: 'act1', name: 'Day 1', balanced: false }],
      invoicesByActivity: {
        act1: [
          {
            id: 'i1',
            date: '2025-01-02',
            concept: 'Lunch',
            description: 'pasteis',
            amount: 24,
            payerId: 'a',
            balanced: false,
            split: { a: 12, b: 12 },
          },
        ],
      },
    };
    const wb = workbookFromSnapshot(original);
    const buf = workbookToBuffer(wb);
    const wb2 = workbookFromBuffer(buf);
    const round = snapshotFromWorkbook(wb2);

    expect(round.meta).toEqual(original.meta);
    expect(round.members).toEqual(original.members);
    expect(round.activities).toEqual(original.activities);
    expect(round.invoicesByActivity.act1).toHaveLength(1);
    const inv = round.invoicesByActivity.act1![0]!;
    expect(inv.id).toBe('i1');
    expect(inv.amount).toBe(24);
    expect(inv.payerId).toBe('a');
    expect(inv.split.a).toBe(12);
    expect(inv.split.b).toBe(12);
  });
});

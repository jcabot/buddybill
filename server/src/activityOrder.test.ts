import { describe, expect, it } from 'vitest';
import { latestInvoiceDate, sortActivitiesForList } from '@buddysplit/shared';

describe('latestInvoiceDate', () => {
  it('returns null when there are no invoices', () => {
    expect(latestInvoiceDate([])).toBeNull();
  });

  it('returns the most recent date', () => {
    expect(
      latestInvoiceDate([{ date: '2026-08-01' }, { date: '2026-08-20' }, { date: '2026-08-10' }]),
    ).toBe('2026-08-20');
  });
});

describe('sortActivitiesForList', () => {
  const item = (
    id: string,
    opts: { balanced: boolean; latestInvoiceDate: string | null },
  ) => ({ id, name: id, balanced: opts.balanced, latestInvoiceDate: opts.latestInvoiceDate });

  it('keeps open activities above balanced ones', () => {
    const sorted = sortActivitiesForList([
      item('old-balanced', { balanced: true, latestInvoiceDate: '2026-08-28' }),
      item('open', { balanced: false, latestInvoiceDate: '2026-08-01' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['open', 'old-balanced']);
  });

  it('orders open trips by latest invoice, newest first', () => {
    const sorted = sortActivitiesForList([
      item('paris', { balanced: false, latestInvoiceDate: '2026-08-10' }),
      item('rome', { balanced: false, latestInvoiceDate: '2026-08-20' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['rome', 'paris']);
  });

  it('orders balanced trips by latest invoice, newest first', () => {
    const sorted = sortActivitiesForList([
      item('lisbon', { balanced: true, latestInvoiceDate: '2026-07-01' }),
      item('madrid', { balanced: true, latestInvoiceDate: '2026-08-15' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['madrid', 'lisbon']);
  });

  it('puts trips with no invoices after trips that have one, within the same group', () => {
    const sorted = sortActivitiesForList([
      item('empty', { balanced: false, latestInvoiceDate: null }),
      item('rome', { balanced: false, latestInvoiceDate: '2026-08-20' }),
      item('balanced-empty', { balanced: true, latestInvoiceDate: null }),
      item('lisbon', { balanced: true, latestInvoiceDate: '2026-07-01' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['rome', 'empty', 'lisbon', 'balanced-empty']);
  });
});

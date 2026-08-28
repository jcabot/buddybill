import type { Activity } from './types.js';

export interface ActivityListItem extends Activity {
  latestInvoiceDate: string | null;
}

export function latestInvoiceDate(invoices: readonly { date: string }[]): string | null {
  let max: string | null = null;
  for (const inv of invoices) {
    if (!max || inv.date > max) max = inv.date;
  }
  return max;
}

export function sortActivitiesForList<T extends ActivityListItem>(activities: readonly T[]): T[] {
  return [...activities].sort((a, b) => {
    const byOpen = Number(a.balanced) - Number(b.balanced);
    if (byOpen !== 0) return byOpen;
    const da = a.latestInvoiceDate;
    const db = b.latestInvoiceDate;
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });
}

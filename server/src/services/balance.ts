import {
  toMinor,
  fromMinor,
  type Activity,
  type ActivityBalance,
  type Currency,
  type GroupBalance,
  type GroupSnapshot,
  type Invoice,
  type Member,
  type MemberBalance,
} from '@buddysplit/shared';

interface MinorBalance {
  paid: number;
  contribution: number;
}

function emptyMap(members: Member[]): Map<string, MinorBalance> {
  return new Map(members.map((m) => [m.id, { paid: 0, contribution: 0 }]));
}

function computeActivityMinor(
  activity: Activity,
  invoices: Invoice[],
  members: Member[],
  currency: Currency,
): Map<string, MinorBalance> {
  const map = emptyMap(members);
  if (activity.balanced) return map;
  for (const inv of invoices) {
    if (inv.balanced) continue;
    const payer = map.get(inv.payerId);
    if (payer) payer.paid += toMinor(inv.amount, currency);
    for (const m of members) {
      const share = inv.split[m.id] ?? 0;
      if (share <= 0) continue;
      const entry = map.get(m.id);
      if (entry) entry.contribution += toMinor(share, currency);
    }
  }
  return map;
}

function toMemberBalances(
  map: Map<string, MinorBalance>,
  members: Member[],
  currency: Currency,
): MemberBalance[] {
  return members.map((m) => {
    const b = map.get(m.id) ?? { paid: 0, contribution: 0 };
    const netMinor = b.paid - b.contribution;
    return {
      memberId: m.id,
      memberName: m.name,
      paid: fromMinor(b.paid, currency),
      contribution: fromMinor(b.contribution, currency),
      net: fromMinor(netMinor, currency),
    };
  });
}

export function computeGroupBalance(snap: GroupSnapshot): GroupBalance {
  const { meta, members, activities, invoicesByActivity } = snap;
  const totals = emptyMap(members);
  const perActivity: ActivityBalance[] = [];

  for (const a of activities) {
    const invs = invoicesByActivity[a.id] ?? [];
    const actMap = computeActivityMinor(a, invs, members, meta.currency);
    perActivity.push({
      activityId: a.id,
      activityName: a.name,
      balanced: a.balanced,
      members: toMemberBalances(actMap, members, meta.currency),
    });
    if (!a.balanced) {
      for (const m of members) {
        const src = actMap.get(m.id);
        const dst = totals.get(m.id);
        if (src && dst) {
          dst.paid += src.paid;
          dst.contribution += src.contribution;
        }
      }
    }
  }

  return {
    groupId: meta.id,
    currency: meta.currency,
    perActivity,
    totals: toMemberBalances(totals, members, meta.currency),
  };
}

export function computeActivityBalance(
  snap: GroupSnapshot,
  activityId: string,
): ActivityBalance | null {
  const activity = snap.activities.find((a) => a.id === activityId);
  if (!activity) return null;
  const invs = snap.invoicesByActivity[activityId] ?? [];
  const map = computeActivityMinor(activity, invs, snap.members, snap.meta.currency);
  return {
    activityId: activity.id,
    activityName: activity.name,
    balanced: activity.balanced,
    members: toMemberBalances(map, snap.members, snap.meta.currency),
  };
}

/**
 * Validates that the per-member shares sum to the invoice amount within
 * 0.5 minor units (i.e. half a cent, accounting for floating-point input).
 * Returns null if valid, or an error message.
 */
export function validateSplit(
  amount: number,
  split: Record<string, number>,
  currency: Currency,
): string | null {
  const totalMinor = toMinor(amount, currency);
  let sumMinor = 0;
  for (const v of Object.values(split)) {
    if (v < 0 || !Number.isFinite(v)) return 'split shares must be non-negative numbers';
    sumMinor += toMinor(v, currency);
  }
  if (Math.abs(sumMinor - totalMinor) > 0) {
    return `split shares (${fromMinor(sumMinor, currency)}) do not sum to amount (${amount})`;
  }
  return null;
}

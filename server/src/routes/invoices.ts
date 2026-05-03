import { Router } from 'express';
import { invoiceInputSchema, equalSplitMinor, fromMinor } from '@buddysplit/shared';
import type { Invoice, Split } from '@buddysplit/shared';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { groupRepo } from '../repositories/groupRepo.js';
import { getGroupEntry } from '../repositories/groupsIndexRepo.js';
import { withGroupLock } from '../services/lock.js';
import { computeActivityBalance, validateSplit } from '../services/balance.js';
import { newInvoiceId } from '../util/ids.js';
import { toMinor } from '@buddysplit/shared';

export const invoicesRouter = Router({ mergeParams: true });

invoicesRouter.use(authRequired);

async function ensureOwner(userId: string, gid: string): Promise<void> {
  const entry = await getGroupEntry(userId, gid);
  if (!entry) throw notFound('group not found');
}

function buildSplit(
  amount: number,
  customSplit: Split | undefined,
  memberIds: string[],
  currency: import('@buddysplit/shared').Currency,
): Split {
  if (customSplit) {
    const split: Split = {};
    for (const id of memberIds) split[id] = customSplit[id] ?? 0;
    const err = validateSplit(amount, split, currency);
    if (err) throw badRequest(err);
    return split;
  }
  // equal split among all members in minor units
  const totalMinor = toMinor(amount, currency);
  const shares = equalSplitMinor(totalMinor, memberIds.length);
  const split: Split = {};
  memberIds.forEach((id, i) => {
    split[id] = fromMinor(shares[i] ?? 0, currency);
  });
  return split;
}

invoicesRouter.post(
  '/',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    await ensureOwner(userId, gid);
    const input = invoiceInputSchema.parse(req.body);

    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      const activity = snap.activities.find((a) => a.id === aid);
      if (!activity) throw notFound('activity not found');
      if (activity.balanced) throw badRequest('activity is balanced; cannot add invoices');
      if (!snap.members.some((m) => m.id === input.payerId)) {
        throw badRequest('payerId is not a member of this group');
      }
      if (snap.members.length === 0) throw badRequest('group has no members yet');
      const split = buildSplit(
        input.amount,
        input.split,
        snap.members.map((m) => m.id),
        snap.meta.currency,
      );
      const invoice: Invoice = {
        id: newInvoiceId(),
        date: input.date,
        concept: input.concept,
        description: input.description ?? '',
        amount: input.amount,
        payerId: input.payerId,
        balanced: false,
        split,
      };
      return groupRepo.addInvoice(gid, aid, invoice);
    });
    const invoices = next.invoicesByActivity[aid] ?? [];
    res.status(201).json({
      invoice: invoices[invoices.length - 1],
      balance: computeActivityBalance(next, aid),
    });
  }),
);

invoicesRouter.patch(
  '/:iid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    const iid = req.params.iid;
    await ensureOwner(userId, gid);
    const input = invoiceInputSchema.parse(req.body);

    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      const activity = snap.activities.find((a) => a.id === aid);
      if (!activity) throw notFound('activity not found');
      if (activity.balanced) throw badRequest('activity is balanced; cannot edit invoices');
      const invs = snap.invoicesByActivity[aid] ?? [];
      const existing = invs.find((i) => i.id === iid);
      if (!existing) throw notFound('invoice not found');
      if (existing.balanced) throw badRequest('invoice is balanced; cannot edit');
      if (!snap.members.some((m) => m.id === input.payerId)) {
        throw badRequest('payerId is not a member of this group');
      }
      const split = buildSplit(
        input.amount,
        input.split,
        snap.members.map((m) => m.id),
        snap.meta.currency,
      );
      return groupRepo.updateInvoice(gid, aid, iid, {
        date: input.date,
        concept: input.concept,
        description: input.description ?? '',
        amount: input.amount,
        payerId: input.payerId,
        split,
      });
    });
    const invs = next.invoicesByActivity[aid] ?? [];
    res.json({
      invoice: invs.find((i) => i.id === iid),
      balance: computeActivityBalance(next, aid),
    });
  }),
);

invoicesRouter.delete(
  '/:iid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    const iid = req.params.iid;
    await ensureOwner(userId, gid);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      const activity = snap.activities.find((a) => a.id === aid);
      if (!activity) throw notFound('activity not found');
      if (activity.balanced) throw badRequest('activity is balanced; cannot delete invoices');
      const invs = snap.invoicesByActivity[aid] ?? [];
      const existing = invs.find((i) => i.id === iid);
      if (!existing) throw notFound('invoice not found');
      return groupRepo.removeInvoice(gid, aid, iid);
    });
    res.json({
      invoices: next.invoicesByActivity[aid] ?? [],
      balance: computeActivityBalance(next, aid),
    });
  }),
);

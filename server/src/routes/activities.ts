import { Router } from 'express';
import { activityInputSchema } from '@buddysplit/shared';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { forbidden, notFound } from '../errors.js';
import { groupRepo } from '../repositories/groupRepo.js';
import { getGroupEntry } from '../repositories/groupsIndexRepo.js';
import { withGroupLock } from '../services/lock.js';
import { newActivityId } from '../util/ids.js';
import { computeActivityBalance } from '../services/balance.js';

export const activitiesRouter = Router({ mergeParams: true });

activitiesRouter.use(authRequired);

async function ensureOwner(userId: string, gid: string): Promise<void> {
  const entry = await getGroupEntry(userId, gid);
  if (!entry) throw notFound('group not found');
}

activitiesRouter.post(
  '/',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    await ensureOwner(userId, gid);
    const { name } = activityInputSchema.parse(req.body);
    const id = newActivityId();
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      return groupRepo.addActivity(gid, { id, name, balanced: false });
    });
    res.status(201).json({ activities: next.activities });
  }),
);

activitiesRouter.get(
  '/:aid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    await ensureOwner(userId, gid);
    const snap = await withGroupLock(gid, () => groupRepo.readSnapshot(gid));
    if (snap.meta.ownerUserId !== userId) throw forbidden();
    const activity = snap.activities.find((a) => a.id === aid);
    if (!activity) throw notFound('activity not found');
    const invoices = snap.invoicesByActivity[aid] ?? [];
    const balance = computeActivityBalance(snap, aid);
    res.json({ activity, invoices, balance, members: snap.members, currency: snap.meta.currency });
  }),
);

activitiesRouter.patch(
  '/:aid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    await ensureOwner(userId, gid);
    const { name } = activityInputSchema.parse(req.body);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      if (!snap.activities.some((a) => a.id === aid)) throw notFound('activity not found');
      return groupRepo.renameActivity(gid, aid, name);
    });
    res.json({ activities: next.activities });
  }),
);

activitiesRouter.delete(
  '/:aid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    await ensureOwner(userId, gid);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      if (!snap.activities.some((a) => a.id === aid)) throw notFound('activity not found');
      return groupRepo.removeActivity(gid, aid);
    });
    res.json({ activities: next.activities });
  }),
);

activitiesRouter.post(
  '/:aid/balance',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const aid = req.params.aid;
    await ensureOwner(userId, gid);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      if (!snap.activities.some((a) => a.id === aid)) throw notFound('activity not found');
      return groupRepo.markActivityBalanced(gid, aid);
    });
    res.json({
      activities: next.activities,
      invoices: next.invoicesByActivity[aid] ?? [],
    });
  }),
);

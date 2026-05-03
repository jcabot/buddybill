import { Router } from 'express';
import { memberInputSchema } from '@buddysplit/shared';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { forbidden, notFound } from '../errors.js';
import { groupRepo } from '../repositories/groupRepo.js';
import { getGroupEntry } from '../repositories/groupsIndexRepo.js';
import { withGroupLock } from '../services/lock.js';
import { newMemberId } from '../util/ids.js';

export const membersRouter = Router({ mergeParams: true });

membersRouter.use(authRequired);

async function ensureOwner(userId: string, gid: string): Promise<void> {
  const entry = await getGroupEntry(userId, gid);
  if (!entry) throw notFound('group not found');
}

membersRouter.post(
  '/',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    await ensureOwner(userId, gid);
    const { name } = memberInputSchema.parse(req.body);
    const id = newMemberId();
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      return groupRepo.addMember(gid, { id, name });
    });
    res.status(201).json({ members: next.members });
  }),
);

membersRouter.patch(
  '/:mid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const mid = req.params.mid;
    await ensureOwner(userId, gid);
    const { name } = memberInputSchema.parse(req.body);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      if (!snap.members.some((m) => m.id === mid)) throw notFound('member not found');
      return groupRepo.updateMember(gid, mid, name);
    });
    res.json({ members: next.members });
  }),
);

membersRouter.delete(
  '/:mid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const mid = req.params.mid;
    await ensureOwner(userId, gid);
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      if (!snap.members.some((m) => m.id === mid)) throw notFound('member not found');
      return groupRepo.removeMember(gid, mid);
    });
    res.json({ members: next.members });
  }),
);

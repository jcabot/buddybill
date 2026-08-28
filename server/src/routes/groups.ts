import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import {
  SCHEMA_VERSION,
  createGroupSchema,
  latestInvoiceDate,
  renameGroupSchema,
} from '@buddysplit/shared';
import { authRequired } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import {
  addGroup,
  getGroupEntry,
  listGroups,
  removeGroup,
  updateGroup,
} from '../repositories/groupsIndexRepo.js';
import { groupRepo } from '../repositories/groupRepo.js';
import { withGroupLock } from '../services/lock.js';
import { newGroupId } from '../util/ids.js';
import { env } from '../env.js';
import {
  snapshotFromExportWorkbook,
  workbookForExport,
  workbookToBuffer,
} from '../services/excelSchema.js';
import { computeGroupBalance } from '../services/balance.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const groupsRouter = Router();

groupsRouter.use(authRequired);

groupsRouter.get(
  '/',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const groups = await listGroups(userId);
    res.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        currency: g.currency,
        createdAt: g.createdAt,
      })),
    });
  }),
);

groupsRouter.post(
  '/',
  ah(async (req, res) => {
    const { name, currency } = createGroupSchema.parse(req.body);
    const userId = req.user!.uid;
    const id = newGroupId();
    const createdAt = new Date().toISOString();
    await withGroupLock(id, async () => {
      await groupRepo.create({
        id,
        name,
        ownerUserId: userId,
        currency,
        createdAt,
        schemaVersion: SCHEMA_VERSION,
      });
      await addGroup(userId, {
        id,
        name,
        currency,
        createdAt,
        xlsxPath: path.join(env.dataDir, 'groups', `${id}.xlsx`),
      });
    });
    res.status(201).json({ group: { id, name, currency, createdAt } });
  }),
);

groupsRouter.get(
  '/:gid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const entry = await getGroupEntry(userId, gid);
    if (!entry) throw notFound('group not found');
    const snap = await withGroupLock(gid, () => groupRepo.readSnapshot(gid));
    if (snap.meta.ownerUserId !== userId) throw forbidden();
    res.json({
      group: {
        id: snap.meta.id,
        name: snap.meta.name,
        currency: snap.meta.currency,
        createdAt: snap.meta.createdAt,
        members: snap.members,
        activities: snap.activities.map((a) => ({
          ...a,
          latestInvoiceDate: latestInvoiceDate(snap.invoicesByActivity[a.id] ?? []),
        })),
      },
    });
  }),
);

groupsRouter.patch(
  '/:gid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const { name } = renameGroupSchema.parse(req.body);
    const entry = await getGroupEntry(userId, gid);
    if (!entry) throw notFound('group not found');
    const next = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      return groupRepo.renameGroup(gid, name);
    });
    await updateGroup(userId, gid, { name });
    res.json({ group: { id: next.meta.id, name: next.meta.name, currency: next.meta.currency } });
  }),
);

groupsRouter.delete(
  '/:gid',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const entry = await getGroupEntry(userId, gid);
    if (!entry) throw notFound('group not found');
    await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      await groupRepo.delete(gid);
    });
    await removeGroup(userId, gid);
    res.json({ ok: true });
  }),
);

groupsRouter.get(
  '/:gid/balance',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const snap = await withGroupLock(gid, () => groupRepo.readSnapshot(gid));
    if (snap.meta.ownerUserId !== userId) throw forbidden();
    res.json({ balance: computeGroupBalance(snap) });
  }),
);

groupsRouter.get(
  '/:gid/export',
  ah(async (req, res) => {
    const userId = req.user!.uid;
    const gid = req.params.gid;
    const { buf, name } = await withGroupLock(gid, async () => {
      const snap = await groupRepo.readSnapshot(gid);
      if (snap.meta.ownerUserId !== userId) throw forbidden();
      const balance = computeGroupBalance(snap);
      const wb = workbookForExport(snap, balance);
      return { buf: workbookToBuffer(wb), name: snap.meta.name };
    });
    const safe = name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'group';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="buddysplit-${safe}.xlsx"`);
    res.send(buf);
  }),
);

/**
 * Import a group from a workbook produced by `/export`. Strict: only accepts
 * the format we ourselves emit. Intended for migrating data between
 * deployments, not for ingesting arbitrary spreadsheets. The imported group
 * gets a fresh group_id; member/activity/invoice ids are preserved.
 */
groupsRouter.post(
  '/import',
  upload.single('file'),
  ah(async (req, res) => {
    const userId = req.user!.uid;
    if (!req.file) throw badRequest('no file uploaded; use form field "file"');

    let wb;
    try {
      wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch {
      throw badRequest('not a valid .xlsx file');
    }

    const snap = snapshotFromExportWorkbook(wb);

    const id = newGroupId();
    const createdAt = snap.meta.createdAt || new Date().toISOString();
    const finalSnap = {
      ...snap,
      meta: {
        ...snap.meta,
        id,
        ownerUserId: userId,
        createdAt,
        schemaVersion: SCHEMA_VERSION,
      },
    };
    await withGroupLock(id, async () => {
      await groupRepo.createFromSnapshot(finalSnap);
      await addGroup(userId, {
        id,
        name: finalSnap.meta.name,
        currency: finalSnap.meta.currency,
        createdAt,
        xlsxPath: path.join(env.dataDir, 'groups', `${id}.xlsx`),
      });
    });
    res.status(201).json({
      group: {
        id,
        name: finalSnap.meta.name,
        currency: finalSnap.meta.currency,
        createdAt,
      },
    });
  }),
);


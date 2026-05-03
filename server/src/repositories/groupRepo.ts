import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  SCHEMA_VERSION,
  type Activity,
  type GroupMeta,
  type GroupSnapshot,
  type Invoice,
  type Member,
} from '@buddysplit/shared';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { writeFileAtomic } from '../util/fsAtomic.js';
import {
  buildEmptyWorkbook,
  dropActivitySheet,
  snapshotFromWorkbook,
  workbookFromBuffer,
  workbookFromSnapshot,
  workbookToBuffer,
} from '../services/excelSchema.js';

const groupPath = (groupId: string) =>
  path.join(env.dataDir, 'groups', `${groupId}.xlsx`);

async function loadSnapshot(groupId: string): Promise<GroupSnapshot> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(groupPath(groupId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw notFound(`group ${groupId} not found`);
    }
    throw err;
  }
  const wb = workbookFromBuffer(buf);
  return snapshotFromWorkbook(wb);
}

async function saveSnapshot(snap: GroupSnapshot): Promise<void> {
  const wb = workbookFromSnapshot({ ...snap, meta: { ...snap.meta, schemaVersion: SCHEMA_VERSION } });
  const buf = workbookToBuffer(wb);
  await writeFileAtomic(groupPath(snap.meta.id), buf);
}

async function modify(
  groupId: string,
  fn: (snap: GroupSnapshot) => Promise<GroupSnapshot> | GroupSnapshot,
): Promise<GroupSnapshot> {
  const snap = await loadSnapshot(groupId);
  const next = await fn(snap);
  await saveSnapshot(next);
  return next;
}

export const groupRepo = {
  async create(meta: GroupMeta): Promise<void> {
    const wb = buildEmptyWorkbook({ ...meta, schemaVersion: SCHEMA_VERSION });
    const buf = workbookToBuffer(wb);
    await writeFileAtomic(groupPath(meta.id), buf);
  },

  async createFromSnapshot(snap: GroupSnapshot): Promise<void> {
    await saveSnapshot(snap);
  },

  async readSnapshot(groupId: string): Promise<GroupSnapshot> {
    return loadSnapshot(groupId);
  },

  async delete(groupId: string): Promise<void> {
    try {
      await fs.unlink(groupPath(groupId));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  },

  async renameGroup(groupId: string, name: string): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => ({ ...snap, meta: { ...snap.meta, name } }));
  },

  async addMember(groupId: string, member: Member): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => ({
      ...snap,
      members: [...snap.members, member],
    }));
  },

  async updateMember(groupId: string, memberId: string, name: string): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => ({
      ...snap,
      members: snap.members.map((m) => (m.id === memberId ? { ...m, name } : m)),
    }));
  },

  async removeMember(groupId: string, memberId: string): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => {
      const stillReferenced = snap.activities.some((a) => {
        if (a.balanced) return false;
        const invs = snap.invoicesByActivity[a.id] ?? [];
        return invs.some((inv) => {
          if (inv.balanced) return false;
          if (inv.payerId === memberId) return true;
          const share = inv.split[memberId] ?? 0;
          return share > 0;
        });
      });
      if (stillReferenced) {
        const err = new Error(
          'cannot delete member: referenced by an unbalanced invoice (as payer or share)',
        );
        (err as Error & { status?: number; code?: string }).status = 409;
        (err as Error & { status?: number; code?: string }).code = 'member_in_use';
        throw err;
      }
      return {
        ...snap,
        members: snap.members.filter((m) => m.id !== memberId),
        invoicesByActivity: Object.fromEntries(
          Object.entries(snap.invoicesByActivity).map(([aid, invs]) => [
            aid,
            invs.map((inv) => {
              const next = { ...inv.split };
              delete next[memberId];
              return { ...inv, split: next };
            }),
          ]),
        ),
      };
    });
  },

  async addActivity(groupId: string, activity: Activity): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => ({
      ...snap,
      activities: [...snap.activities, activity],
      invoicesByActivity: { ...snap.invoicesByActivity, [activity.id]: [] },
    }));
  },

  async renameActivity(
    groupId: string,
    activityId: string,
    name: string,
  ): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => ({
      ...snap,
      activities: snap.activities.map((a) => (a.id === activityId ? { ...a, name } : a)),
    }));
  },

  async removeActivity(groupId: string, activityId: string): Promise<GroupSnapshot> {
    const snap = await loadSnapshot(groupId);
    const next: GroupSnapshot = {
      ...snap,
      activities: snap.activities.filter((a) => a.id !== activityId),
      invoicesByActivity: Object.fromEntries(
        Object.entries(snap.invoicesByActivity).filter(([aid]) => aid !== activityId),
      ),
    };
    const wb = workbookFromSnapshot(next);
    dropActivitySheet(wb, activityId);
    const buf = workbookToBuffer(wb);
    await writeFileAtomic(groupPath(groupId), buf);
    return next;
  },

  async markActivityBalanced(groupId: string, activityId: string): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => {
      const invs = snap.invoicesByActivity[activityId] ?? [];
      return {
        ...snap,
        activities: snap.activities.map((a) =>
          a.id === activityId ? { ...a, balanced: true } : a,
        ),
        invoicesByActivity: {
          ...snap.invoicesByActivity,
          [activityId]: invs.map((inv) => ({ ...inv, balanced: true })),
        },
      };
    });
  },

  async addInvoice(
    groupId: string,
    activityId: string,
    invoice: Invoice,
  ): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => {
      const invs = snap.invoicesByActivity[activityId] ?? [];
      return {
        ...snap,
        invoicesByActivity: {
          ...snap.invoicesByActivity,
          [activityId]: [...invs, invoice],
        },
      };
    });
  },

  async updateInvoice(
    groupId: string,
    activityId: string,
    invoiceId: string,
    patch: Partial<Invoice>,
  ): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => {
      const invs = snap.invoicesByActivity[activityId] ?? [];
      return {
        ...snap,
        invoicesByActivity: {
          ...snap.invoicesByActivity,
          [activityId]: invs.map((inv) =>
            inv.id === invoiceId ? { ...inv, ...patch, id: inv.id } : inv,
          ),
        },
      };
    });
  },

  async removeInvoice(
    groupId: string,
    activityId: string,
    invoiceId: string,
  ): Promise<GroupSnapshot> {
    return modify(groupId, (snap) => {
      const invs = snap.invoicesByActivity[activityId] ?? [];
      return {
        ...snap,
        invoicesByActivity: {
          ...snap.invoicesByActivity,
          [activityId]: invs.filter((inv) => inv.id !== invoiceId),
        },
      };
    });
  },
};

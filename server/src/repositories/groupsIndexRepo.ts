import path from 'node:path';
import { Mutex } from 'async-mutex';
import type { Currency } from '@buddysplit/shared';
import { env } from '../env.js';
import { readJson, writeJson } from '../util/fsAtomic.js';

export interface GroupIndexEntry {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
  xlsxPath: string;
}

interface IndexFile {
  groups: GroupIndexEntry[];
}

const indexPath = (userId: string) =>
  path.join(env.dataDir, 'users', userId, 'groups-index.json');

const userMutexes = new Map<string, Mutex>();
function userMutex(userId: string): Mutex {
  let m = userMutexes.get(userId);
  if (!m) {
    m = new Mutex();
    userMutexes.set(userId, m);
  }
  return m;
}

async function load(userId: string): Promise<IndexFile> {
  return readJson<IndexFile>(indexPath(userId), { groups: [] });
}

async function save(userId: string, file: IndexFile): Promise<void> {
  await writeJson(indexPath(userId), file);
}

export async function listGroups(userId: string): Promise<GroupIndexEntry[]> {
  const file = await load(userId);
  return file.groups.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getGroupEntry(
  userId: string,
  groupId: string,
): Promise<GroupIndexEntry | null> {
  const file = await load(userId);
  return file.groups.find((g) => g.id === groupId) ?? null;
}

export async function addGroup(userId: string, entry: GroupIndexEntry): Promise<void> {
  await userMutex(userId).runExclusive(async () => {
    const file = await load(userId);
    if (file.groups.some((g) => g.id === entry.id)) return;
    file.groups.push(entry);
    await save(userId, file);
  });
}

export async function updateGroup(
  userId: string,
  groupId: string,
  patch: Partial<Pick<GroupIndexEntry, 'name' | 'currency'>>,
): Promise<void> {
  await userMutex(userId).runExclusive(async () => {
    const file = await load(userId);
    const g = file.groups.find((x) => x.id === groupId);
    if (!g) return;
    if (patch.name !== undefined) g.name = patch.name;
    if (patch.currency !== undefined) g.currency = patch.currency;
    await save(userId, file);
  });
}

export async function removeGroup(userId: string, groupId: string): Promise<void> {
  await userMutex(userId).runExclusive(async () => {
    const file = await load(userId);
    file.groups = file.groups.filter((g) => g.id !== groupId);
    await save(userId, file);
  });
}

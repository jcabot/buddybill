import path from 'node:path';
import { Mutex } from 'async-mutex';
import { env } from '../env.js';
import { readJson, writeJson } from '../util/fsAtomic.js';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface UsersFile {
  users: UserRecord[];
}

const USERS_FILE = () => path.join(env.dataDir, 'auth', 'users.json');
const usersMutex = new Mutex();

async function loadUsers(): Promise<UsersFile> {
  return readJson<UsersFile>(USERS_FILE(), { users: [] });
}

async function saveUsers(file: UsersFile): Promise<void> {
  await writeJson(USERS_FILE(), file);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const file = await loadUsers();
  return file.users.find((u) => u.email === email) ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const file = await loadUsers();
  return file.users.find((u) => u.id === id) ?? null;
}

export async function createUser(record: UserRecord): Promise<void> {
  await usersMutex.runExclusive(async () => {
    const file = await loadUsers();
    if (file.users.some((u) => u.email === record.email)) {
      throw new Error('email already registered');
    }
    file.users.push(record);
    await saveUsers(file);
  });
}

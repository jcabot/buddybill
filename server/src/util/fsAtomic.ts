import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Atomic-on-rename file write: writes to <file>.tmp then renames over the
 * destination. Safe against partial writes on the same filesystem.
 */
export async function writeFileAtomic(filePath: string, data: Buffer | string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(filePath, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

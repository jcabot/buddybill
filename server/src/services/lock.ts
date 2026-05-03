import { Mutex } from 'async-mutex';

const locks = new Map<string, Mutex>();

function getMutex(key: string): Mutex {
  let m = locks.get(key);
  if (!m) {
    m = new Mutex();
    locks.set(key, m);
  }
  return m;
}

/**
 * Serialize all reads/writes for a given group. In v1 we run on a single
 * Fly machine, so an in-memory mutex is sufficient. Reads are also serialized
 * because xlsx parsing is not cheap and we want to avoid torn reads while a
 * write is mid-flight.
 */
export async function withGroupLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const mutex = getMutex(groupId);
  const release = await mutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

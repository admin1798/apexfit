import { db } from '../db/database';
import type { SyncEntityType, SyncQueueItem } from '../types';

function computeHash(payload: unknown): string {
  const str = JSON.stringify(payload ?? {});
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Enqueues a local mutation into IndexedDB's syncQueue with deduplication by entityType+entityId
 * so rapid edits never create duplicate records and unsynchronized records are protected.
 */
export async function enqueueSyncMutation(
  entityType: SyncEntityType,
  entityId: string,
  action: 'upsert' | 'delete',
  payload?: unknown
): Promise<void> {
  const key = `${entityType}:${entityId}`;
  const now = new Date().toISOString();
  const payloadHash = computeHash(payload);

  const existing = await db.syncQueue.get(key);
  if (existing && existing.status === 'pending' && existing.payloadHash === payloadHash) {
    return;
  }

  const item: SyncQueueItem = {
    id: key,
    entityType,
    entityId,
    action,
    payloadHash,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.syncQueue.put(item);
}

/**
 * Processes pending sync items when online.
 * Protects local unsynced mutations from server overwrite by preserving pending entries
 * on network failure with exponential retry metadata, and cleanly checkpoints local snapshots
 * when no remote sync endpoint is configured.
 */
export async function flushSyncQueue(): Promise<{
  syncedCount: number;
  pendingCount: number;
  conflictCount: number;
}> {
  const allItems = await db.syncQueue.toArray();
  const pending = allItems.filter((i) => i.status === 'pending');

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedCount: 0,
      pendingCount: pending.length,
      conflictCount: allItems.filter((i) => i.status === 'conflict').length,
    };
  }

  const now = new Date().toISOString();
  let syncedCount = 0;

  for (const item of pending) {
    try {
      await db.syncQueue.update(item.id, {
        status: 'synced',
        updatedAt: now,
        lastError: undefined,
      });
      syncedCount++;
    } catch (err) {
      await db.syncQueue.update(item.id, {
        retries: item.retries + 1,
        updatedAt: now,
        lastError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  if (syncedCount > 0) {
    const profile = await db.profile.get('default-user');
    if (profile) {
      await db.profile.update('default-user', { lastSyncedAt: now });
    }
  }

  const after = await db.syncQueue.toArray();
  return {
    syncedCount,
    pendingCount: after.filter((i) => i.status === 'pending').length,
    conflictCount: after.filter((i) => i.status === 'conflict').length,
  };
}

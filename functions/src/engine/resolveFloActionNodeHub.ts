/**
 * Load tenant FloActionNodes registry docs for runtime floActionNode execution.
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  hubFloActionNodeDocId,
  mergeFloActionRuntimeFields,
  type FloActionRuntimeFields,
} from '@floplug/shared';

const db = getFirestore();

export type HubFloActionDocCache = Map<string, Record<string, unknown> | null>;

function cacheKey(hubId: string, tenantId: string, floKitId: string): string {
  return `${hubId}:${tenantId}:${floKitId}`;
}

export async function loadHubFloActionNodeDoc(
  hubId: string,
  tenantId: string,
  floKitId: string,
  cache?: HubFloActionDocCache,
): Promise<Record<string, unknown> | null> {
  if (!floKitId) return null;

  const key = cacheKey(hubId, tenantId, floKitId);
  if (cache?.has(key)) return cache.get(key) ?? null;

  const col = db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.FLOACTIONNODES);

  const byId = await col.doc(hubFloActionNodeDocId(floKitId)).get();
  if (byId.exists) {
    const data = byId.data() as Record<string, unknown>;
    cache?.set(key, data);
    return data;
  }

  const q = await col
    .where('floKitId', '==', floKitId)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  const data = q.empty ? null : (q.docs[0].data() as Record<string, unknown>);
  cache?.set(key, data);
  return data;
}

export async function resolveFloActionRuntimeFromHub(
  hubId: string,
  tenantId: string,
  canvas: Record<string, unknown>,
  cache?: HubFloActionDocCache,
): Promise<FloActionRuntimeFields> {
  const floKitId = String(canvas.floKitId ?? '');
  const partial = mergeFloActionRuntimeFields(canvas, null);

  if (partial.actionId && partial.connectorId && partial.connectionId) {
    return partial;
  }

  if (!floKitId) return partial;

  const hubDoc = await loadHubFloActionNodeDoc(hubId, tenantId, floKitId, cache);
  return mergeFloActionRuntimeFields(canvas, hubDoc);
}

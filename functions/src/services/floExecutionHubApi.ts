/**
 * Execution Hub read APIs — list runs, run detail, validation snapshots.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  type FloExecutionNodeRecord,
  type FloExecutionRunSummary,
  extractRunErrorFromLog,
  getDraftGraph,
  getPublishedGraph,
} from '@floplug/shared';
import {
  readNodeExecutionFromStorage,
  getSignedDownloadUrl,
  runManifestStoragePath,
} from './executionHubStorageService.js';
import { db } from '../utils/firebase.js';

function requireAuth(request: { auth?: unknown }): void {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
}

function requireSameHub(
  request: { auth?: { token?: Record<string, unknown> } },
  hubId: string,
  tenantId: string,
): void {
  const token = request.auth?.token ?? {};
  if (token.hubId !== hubId || token.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Token hub/tenant mismatch.');
  }
}

function tenantBase(hubId: string, tenantId: string): string {
  return `${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}`;
}

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch { /* ignore */ }
  }
  return undefined;
}

function mapRunDoc(id: string, data: Record<string, unknown>): FloExecutionRunSummary {
  const started = tsToIso(data.startedAt ?? data.timestamp);
  const completed = tsToIso(data.completedAt);
  let durationMs: number | undefined;
  if (started && completed) {
    durationMs = new Date(completed).getTime() - new Date(started).getTime();
  }
  const log = data.log;
  const logArr = Array.isArray(log) ? (log as string[]) : undefined;
  const errorMessage = typeof data.errorMessage === 'string'
    ? data.errorMessage
    : (logArr ? extractRunErrorFromLog(logArr) : undefined);
  return {
    runId:        id,
    floId:        String(data.floId ?? ''),
    floVersion:   typeof data.floVersion === 'number' ? data.floVersion : undefined,
    executedGraph: data.executedGraph === 'draft' || data.executedGraph === 'published'
      ? data.executedGraph
      : undefined,
    status:       String(data.status ?? 'unknown'),
    source:       data.source ? String(data.source) : undefined,
    startedAt:    started,
    completedAt:  completed,
    durationMs,
    nodeCount:    typeof data.nodeCount === 'number' ? data.nodeCount : undefined,
    logLineCount: logArr?.length,
    errorMessage,
  };
}

async function queryRunsCollection(
  collectionName: string,
  hubId: string,
  tenantId: string,
  limit: number,
): Promise<FloExecutionRunSummary[]> {
  const col = db.collection(`${tenantBase(hubId, tenantId)}/${collectionName}`);
  try {
    const snap = await col.orderBy('startedAt', 'desc').limit(limit).get();
    return snap.docs.map(d => mapRunDoc(d.id, d.data() as Record<string, unknown>));
  } catch {
    const snap = await col.limit(limit).get();
    return snap.docs
      .map(d => mapRunDoc(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  }
}

async function loadFloNameMap(hubId: string, tenantId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const wsSnap = await db.collection(`${tenantBase(hubId, tenantId)}/${HUB_COLLECTIONS.WORKSPACES}`).get();
  for (const ws of wsSnap.docs) {
    const fSnap = await ws.ref.collection(HUB_COLLECTIONS.FLOS).get();
    for (const f of fSnap.docs) {
      const name = String((f.data() as Record<string, unknown>).name ?? f.id);
      map.set(f.id, name);
    }
  }
  return map;
}

/** List recent runs for Pulse / Dashboard (FloExecutionLog + legacy ExecutionLog). */
export const listFloExecutionRuns = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, limit = 50 } = request.data as {
    hubId: string; tenantId: string; limit?: number;
  };
  if (!hubId || !tenantId) {
    throw new HttpsError('invalid-argument', 'hubId and tenantId required.');
  }
  requireSameHub(request, hubId, tenantId);

  const cap = Math.min(Math.max(limit, 1), 100);
  const [primary, legacy, floNames] = await Promise.all([
    queryRunsCollection(HUB_COLLECTIONS.EXEC_LOG, hubId, tenantId, cap),
    queryRunsCollection('ExecutionLog', hubId, tenantId, cap),
    loadFloNameMap(hubId, tenantId),
  ]);

  const seen = new Set<string>();
  const merged: FloExecutionRunSummary[] = [];
  for (const r of [...primary, ...legacy]) {
    if (seen.has(r.runId)) continue;
    seen.add(r.runId);
    merged.push({
      ...r,
      floName: floNames.get(r.floId) ?? r.floId,
    });
  }
  merged.sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.runId.localeCompare(a.runId);
  });
  return { runs: merged.slice(0, cap) };
});

async function loadFloGraphForRun(
  hubId: string,
  tenantId: string,
  floId: string,
  executedGraph?: string,
): Promise<{ nodes: unknown[]; edges: unknown[]; workspaceId?: string } | null> {
  const wsSnap = await db
    .collection(`${tenantBase(hubId, tenantId)}/${HUB_COLLECTIONS.WORKSPACES}`)
    .get();

  for (const ws of wsSnap.docs) {
    const floSnap = await ws.ref.collection(HUB_COLLECTIONS.FLOS).doc(floId).get();
    if (!floSnap.exists) continue;
    const floData = floSnap.data() as Record<string, unknown>;
    const useDraft = executedGraph === 'draft';
    const graph = useDraft
      ? getDraftGraph(floData)
      : (getPublishedGraph(floData) ?? getDraftGraph(floData));
    return {
      nodes: graph.nodes ?? [],
      edges: graph.edges ?? [],
      workspaceId: ws.id,
    };
  }
  return null;
}

async function resolveRunRef(hubId: string, tenantId: string, runId: string) {
  const primary = db.doc(`${tenantBase(hubId, tenantId)}/${HUB_COLLECTIONS.EXEC_LOG}/${runId}`);
  let snap = await primary.get();
  if (snap.exists) return primary;

  const legacy = db.doc(`${tenantBase(hubId, tenantId)}/ExecutionLog/${runId}`);
  snap = await legacy.get();
  if (snap.exists) return legacy;

  return null;
}

/** Load run header + all per-node JSON documents for Execution Hub. */
export const getExecutionHubRun = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, runId } = request.data as {
    hubId: string; tenantId: string; runId: string;
  };
  if (!hubId || !tenantId || !runId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, runId required.');
  }
  requireSameHub(request, hubId, tenantId);

  const runRef = await resolveRunRef(hubId, tenantId, runId);
  if (!runRef) throw new HttpsError('not-found', `Run ${runId} not found.`);

  const runSnap = await runRef.get();
  const nodeCol = HUB_COLLECTIONS.EXEC_NODE_RECORDS;
  let nodesSnap = await runRef.collection(nodeCol).get();
  if (nodesSnap.empty) {
    nodesSnap = await runRef.collection('NodeRecords').get();
  }

  const nodeRecords: FloExecutionNodeRecord[] = nodesSnap.docs.map(
    d => ({ ...d.data(), nodeId: d.id } as FloExecutionNodeRecord),
  );

  const hydratedNodes = await Promise.all(nodeRecords.map(async (rec) => {
    if (!rec.storagePath && !rec.hasFullPayload) return rec;
    const path = rec.storagePath;
    if (!path) return rec;
    const full = await readNodeExecutionFromStorage(path);
    if (!full) return rec;
    return {
      ...rec,
      before:    full.before ?? rec.before,
      after:     full.after ?? rec.after,
      httpTrace: full.httpTrace ?? rec.httpTrace,
      logLine:   full.logLine ?? rec.logLine,
      error:     full.error ?? rec.error,
    };
  }));

  const floNames = await loadFloNameMap(hubId, tenantId);
  const runData = runSnap.data() as Record<string, unknown>;
  const floId = String(runData.floId ?? '');
  const executedGraph = runData.executedGraph === 'draft' ? 'draft' : 'published';
  const graph = await loadFloGraphForRun(hubId, tenantId, floId, executedGraph);

  return {
    run: {
      id:      runSnap.id,
      ...runData,
      floName: floNames.get(floId) ?? floId,
    },
    nodes: hydratedNodes,
    graph: graph ?? undefined,
  };
});

/** Signed download URLs for run manifest + per-node JSON in Storage. */
export const getExecutionHubStorageUrls = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, runId } = request.data as {
    hubId: string; tenantId: string; runId: string;
  };
  if (!hubId || !tenantId || !runId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, runId required.');
  }
  requireSameHub(request, hubId, tenantId);

  const manifestPath = runManifestStoragePath(hubId, tenantId, runId);
  const manifestUrl = await getSignedDownloadUrl(manifestPath);

  const runRef = await resolveRunRef(hubId, tenantId, runId);
  if (!runRef) throw new HttpsError('not-found', `Run ${runId} not found.`);

  let nodesSnap = await runRef.collection(HUB_COLLECTIONS.EXEC_NODE_RECORDS).get();
  if (nodesSnap.empty) {
    nodesSnap = await runRef.collection('NodeRecords').get();
  }

  const nodeUrls: { nodeId: string; storagePath: string; url: string }[] = [];
  for (const doc of nodesSnap.docs) {
    const data = doc.data() as { storagePath?: string };
    if (!data.storagePath) continue;
    nodeUrls.push({
      nodeId: doc.id,
      storagePath: data.storagePath,
      url: await getSignedDownloadUrl(data.storagePath),
    });
  }

  return {
    manifestPath,
    manifestUrl,
    nodeUrls,
    storageRoot: `execution-hub/${hubId}/${tenantId}/${runId}`,
  };
});

/** Latest validation snapshot for one flo (Execution Hub / designer). */
export const getFloValidationSnapshot = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, floId } = request.data as { hubId: string; tenantId: string; floId: string };
  requireSameHub(request, hubId, tenantId);

  const snap = await db.doc(
    `${tenantBase(hubId, tenantId)}/${HUB_COLLECTIONS.FLO_VALIDATION}/${floId}`,
  ).get();

  if (!snap.exists) return { snapshot: null };
  return { snapshot: snap.data() };
});

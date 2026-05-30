// functions/src/services/floWebhook.ts
import { onRequest }      from 'firebase-functions/v2/https';
import { getAuth }        from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { executeFloNodes } from '../engine/executeFloNodes.js';
import type { RunContext, NodeExecutionHubPayload } from '@floplug/shared';
import { buildFloRunMeta } from '@floplug/shared';
import { HUB_COLLECTIONS } from '@floplug/shared';
import { getPublishedGraph } from '@floplug/shared';
import { getFloRunnableBlockReason } from './floValidationService.js';
import { persistNodeExecutionRecord } from './floExecutionHubService.js';
import {
  RunKilledError,
  finalizeRunRecord,
  ensureRunFinalizedIfStillRunning,
  isRunKillRequested,
  logLineForUncaughtError,
} from '../engine/runLifecycle.js';
import { classifyUncaughtError, extractRunErrorFromLog } from '@floplug/shared';

const db = getFirestore();

export const invokeFlo = onRequest(async (req, res) => {

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'POST only' }); return; }

  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing Bearer token' }); return; }

  let decodedToken: { uid: string; permissions?: string[]; allowedFlos?: string[]; isHubAdmin?: boolean; hubId?: string; tenantId?: string };
  try { decodedToken = await getAuth().verifyIdToken(authHeader.slice(7)) as typeof decodedToken; }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); return; }

  const permissions:   string[] = decodedToken.permissions  ?? [];
  const allowedFlos:  string[] = decodedToken.allowedFlos ?? [];
  const isHubAdmin:    boolean  = decodedToken.isHubAdmin   ?? false;
  const tokenHubId:    string   = decodedToken.hubId        ?? '';
  const tokenTenantId: string   = decodedToken.tenantId     ?? '';

  const { hubId, tenantId, floId } = req.query as Record<string, string>;
  if (!hubId || !tenantId || !floId) { res.status(400).json({ error: 'hubId, tenantId, floId required' }); return; }
  if (tokenHubId !== hubId || tokenTenantId !== tenantId) { res.status(403).json({ error: 'Token does not match hub/tenant' }); return; }

  if (!isHubAdmin && !permissions.includes('invoke:flows')) {
    res.status(403).json({ error: 'invoke:flows permission required' }); return;
  }
  if (!isHubAdmin && !allowedFlos.includes('*') && !allowedFlos.includes(floId)) {
    res.status(403).json({ error: `Not authorised for flo: ${floId}` }); return;
  }

  const wsSnap = await db.collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Workspaces`).get();
  let flo: {
    nodes: unknown[];
    edges: unknown[];
    workspaceId: string;
    doc: Record<string, unknown>;
    publishedVersion: number;
  } | null = null;
  for (const ws of wsSnap.docs) {
    const fSnap = await db
      .collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Workspaces/${ws.id}/Flos`)
      .doc(floId).get();
    if (fSnap.exists) {
      const d = fSnap.data()!;
      const published = getPublishedGraph(d as Record<string, unknown>);
      if (!published) {
        res.status(403).json({
          error: `Flo ${floId} has no published graph. Publish from the designer first.`,
          code: 'FLO_NOT_PUBLISHED',
        });
        return;
      }
      flo = {
        nodes: published.nodes,
        edges: published.edges,
        workspaceId: ws.id,
        doc: d as Record<string, unknown>,
        publishedVersion: Number(d.publishedVersion ?? 0),
      };
      break;
    }
  }
  if (!flo) { res.status(404).json({ error: `Flo not found: ${floId}` }); return; }

  const blockReason = getFloRunnableBlockReason(flo.doc, floId);
  if (blockReason) {
    res.status(403).json({ error: blockReason, code: 'FLO_NOT_RUNNABLE' });
    return;
  }

  const ct = req.headers['content-type'] ?? '';
  const inputJson: Record<string, unknown> = ct.includes('application/json')
    ? (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}))
    : { value: req.body, contentType: ct };

  const runRef = db.collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).doc();
  const runId  = runRef.id;
  const log:   string[] = [];
  const store = { global: {} as Record<string, unknown>, local: {} as Record<string, unknown> };

  const pubVer = Number(flo.doc.publishedVersion ?? 0);
  const floVersion = pubVer > 0 ? pubVer : 1;

  await runRef.set({
    runId, floId, callerUid: decodedToken.uid, source: 'webhook',
    floVersion,
    executedGraph: 'published',
    inputJson, status: 'running', log: [], output: null,
    nodeRecordCount: 0,
    startedAt: FieldValue.serverTimestamp(), timestamp: FieldValue.serverTimestamp(),
  });

  log.push(`╔══ WEBHOOK RUN: ${runId} ══╗`);
  log.push(`Flow: ${floId} · Caller: ${decodedToken.uid}`);

  const onNodeComplete = async (payload: NodeExecutionHubPayload) => {
    await persistNodeExecutionRecord({
      hubId, tenantId, runId, floId,
      nodeId:    payload.nodeId,
      nodeType:  payload.nodeType,
      nodeLabel: payload.nodeLabel,
      status:    payload.status,
      before:    payload.before,
      after:     payload.after,
      logLine:   payload.logLine,
      httpTrace: payload.httpTrace,
      error:     payload.error,
      durationMs: payload.durationMs,
    });
  };

  let floOutput: unknown = null;
  let killed = false;
  let forcedFatal = false;
  try {
    const floName = String(flo.doc.name ?? flo.doc.label ?? floId);
    const floSlug = String(flo.doc.slug ?? floId);
    const floRunMeta = buildFloRunMeta({
      runId,
      floId,
      floName,
      slug:      floSlug,
      tenant:    tenantId,
      hubId,
      runType:   'Webhook',
      userId:    decodedToken.uid,
      userEmail: (decodedToken as { email?: string }).email ?? '',
    });
    const ctx: RunContext = {
      hubId, tenantId, wsId: flo.workspaceId,
      runId, floId, floRunMeta, store, log, depth: 0,
      onNodeComplete,
      shouldAbort: () => isRunKillRequested(hubId, tenantId, runId),
    };
    floOutput = await executeFloNodes(
      flo.nodes as Parameters<typeof executeFloNodes>[0],
      flo.edges as Parameters<typeof executeFloNodes>[1],
      inputJson,
      ctx,
    );
  } catch (err: unknown) {
    if (err instanceof RunKilledError) {
      killed = true;
      log.push(`Run killed: ${err instanceof Error ? err.message : String(err)}`);
    } else {
      log.push(logLineForUncaughtError(err));
      if (classifyUncaughtError(err) === 'fatal') forcedFatal = true;
    }
  } finally {
    try {
      if (!killed && !forcedFatal && log.some(l => l.includes('Error in'))) {
        await ensureRunFinalizedIfStillRunning({
          hubId, tenantId, runId, log, output: floOutput, errorMessage: extractRunErrorFromLog(log),
        });
      }
    } catch (finalizeGuardErr) {
      console.error('[invokeFlo] finalize guard failed', finalizeGuardErr);
    }
  }

  if (!killed && await isRunKillRequested(hubId, tenantId, runId)) {
    killed = true;
    if (!log.some(l => l.includes('Run killed'))) log.push('Run killed by user');
  }

  log.push(`╚══ END WEBHOOK RUN: ${runId} ══╝`);
  const errorMessage = killed ? 'Run cancelled by user' : extractRunErrorFromLog(log);

  const status = await finalizeRunRecord({
    hubId, tenantId, runId, log, output: floOutput, killed, forcedFatal, errorMessage,
  });

  const httpStatus = status === 'killed' ? 499
    : status === 'fatal' || status === 'error' ? 500
    : 200;
  res.status(httpStatus).json({ executionId: runId, status, output: floOutput, log });
});

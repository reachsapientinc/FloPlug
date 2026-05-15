// functions/src/services/floWebhook.ts
import { onRequest }      from 'firebase-functions/v2/https';
import { getAuth }        from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { executeFloNodes } from '../engine/executeFloNodes.js'; // ← shared engine
import type { RunContext }  from '@floplug/shared';

const db = getFirestore();

export const invokeFlo = onRequest(async (req, res) => {

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'POST only' }); return; }

  // 1. Verify token
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing Bearer token' }); return; }

  let decodedToken: any;
  try { decodedToken = await getAuth().verifyIdToken(authHeader.slice(7)); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); return; }

  // 2. Read permissions from claims — never role strings
  const permissions:   string[] = decodedToken.permissions  ?? [];
  const allowedFlos:  string[] = decodedToken.allowedFlos ?? [];
  const isHubAdmin:    boolean  = decodedToken.isHubAdmin   ?? false;
  const tokenHubId:    string   = decodedToken.hubId        ?? '';
  const tokenTenantId: string   = decodedToken.tenantId     ?? '';

  // 3. Validate params
  const { hubId, tenantId, floId } = req.query as Record<string, string>;
  if (!hubId || !tenantId || !floId) { res.status(400).json({ error: 'hubId, tenantId, floId required' }); return; }
  if (tokenHubId !== hubId || tokenTenantId !== tenantId) { res.status(403).json({ error: 'Token does not match hub/tenant' }); return; }

  // 4. Permission checks — no role string comparisons
  if (!isHubAdmin && !permissions.includes('invoke:flows')) {
    res.status(403).json({ error: 'invoke:flows permission required' }); return;
  }
  if (!isHubAdmin && !allowedFlos.includes('*') && !allowedFlos.includes(floId)) {
    res.status(403).json({ error: `Not authorised for flo: ${floId}` }); return;
  }

  // 5. Find flo across workspaces
  const wsSnap = await db.collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Workspaces`).get();
  let flo: { nodes: any[]; edges: any[]; workspaceId: string } | null = null;
  for (const ws of wsSnap.docs) {
    const fSnap = await db
      .collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Workspaces/${ws.id}/Flos`)
      .doc(floId).get();
    if (fSnap.exists) {
      const d = fSnap.data()!;
      flo = { nodes: d.nodes ?? [], edges: d.edges ?? [], workspaceId: ws.id };
      break;
    }
  }
  if (!flo) { res.status(404).json({ error: `Flo not found: ${floId}` }); return; }

  // 6. Parse body
  const ct = req.headers['content-type'] ?? '';
  const inputJson: Record<string, unknown> = ct.includes('application/json')
    ? (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}))
    : { value: req.body, contentType: ct };

  // 7. Create run log doc upfront
  const runRef = db.collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/ExecutionLog`).doc();
  const runId  = runRef.id;
  const log:   string[] = [];
  const store = { global: {} as Record<string, any>, local: {} as Record<string, any> };

  await runRef.set({
    runId, floId, callerUid: decodedToken.uid, source: 'webhook',
    inputJson, status: 'running', log: [], output: null,
    startedAt: FieldValue.serverTimestamp(), timestamp: FieldValue.serverTimestamp(),
  });

  log.push(`╔══ WEBHOOK RUN: ${runId} ══╗`);
  log.push(`Flow: ${floId} · Caller: ${decodedToken.uid}`);

  // 8. Execute — same engine as Designer Run button
  let floOutput: unknown = null;
  try {
    const ctx: RunContext = {
      hubId, tenantId, wsId: flo.workspaceId,
      runId, store, log, depth: 0,
    };
    floOutput = await executeFloNodes(flo.nodes, flo.edges, inputJson, ctx);
  } catch (err: any) {
    log.push(`Fatal error: ${err.message}`);
  }

  log.push(`╚══ END WEBHOOK RUN: ${runId} ══╝`);
  const status = log.some(l => l.includes('Error in') || l.includes('Fatal')) ? 'error' : 'success';

  // 9. Update log
  await runRef.update({
    log, output: floOutput, status,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
  });

  res.status(status === 'error' ? 500 : 200).json({ executionId: runId, status, output: floOutput, log });
});
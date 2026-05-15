/**
 * functions/src/index.ts
 *
 * Entry point — exports every Cloud Function.
 * validateAdminUser lives in ./validateAdminUser.ts and is RE-EXPORTED here.
 */

import { onCall, HttpsError }   from 'firebase-functions/v2/https';
import { getApps }              from 'firebase-admin/app';
import { getAuth }              from 'firebase-admin/auth';
import type { UserRecord }      from 'firebase-admin/auth';
import { FieldValue }           from 'firebase-admin/firestore';
import type { DocumentData }    from 'firebase-admin/firestore';

import { EnergizeData, TenantUser } from './types/types.js';
import { provisionHubAndTenants }   from './services/provisioning.js';
import { toHubRole }                from './types/guards.js';
import { db }                       from './utils/firebase.js';

// ── Re-exports ────────────────────────────────────────────────────────────────
export { validateAdminUser } from './validateAdminUser.js';
export {
  inviteAdminUser,
  inviteHubUser,
  updateAdminRole,
  updateHubUserRole,
} from './services/provisionUsers.js';

// ── Init ──────────────────────────────────────────────────────────────────────
const projectId = process.env.GCLOUD_PROJECT;
console.log(`[index.ts] Project ID: ${projectId}`);
console.log(`[index.ts] Checking getApps.length: ${getApps().length}`);

// ── Types ─────────────────────────────────────────────────────────────────────
interface FloNode { id: string; type: string; data: Record<string, unknown>; }
interface FloEdge { source: string; target: string; }

/**
 * The single unified input shape for executeConnector.
 *
 * `connector`  — identifies which integration to call (workday, salesforce,
 *                sap, oracle, storageConnector, authConnector, etc.)
 * `action`     — the operation to perform within that connector
 * `hubId`      — scopes the request to a hub
 * `tenantId`   — scopes the request to a tenant within the hub
 * `payload`    — completely open-ended so any current or future connector can
 *                receive whatever it needs without changing this function's
 *                signature ever again
 */
interface ConnectorRequest {
  connector: string;
  action:    string;
  hubId:     string;
  tenantId:  string;
  payload:   Record<string, unknown>;
}

interface ConnectorResult {
  success:   boolean;
  connector: string;
  action:    string;
  data:      Record<string, unknown>;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAuth(request: { auth?: unknown }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to call this function.');
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
async function resolveTenantBySlugEnv(slug: string, env: string)
  : Promise<{ hubId: string; tenantId: string; tenantData: DocumentData } | null> {
  const snap = await db.collectionGroup('Tenants')
    .where('slug', '==', slug).where('tenantType', '==', env).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { hubId: d.ref.parent.parent?.id ?? '', tenantId: d.id, tenantData: d.data() };
}

async function getConnectorCreds(hubId: string, tenantId: string, connector: string)
  : Promise<Record<string, string> | null> {
  try {
    const snap = await db.doc(
      `FloPlugHubs/${hubId}/Tenants/${tenantId}/ConnectorCredentials/${connector}`
    ).get();
    return snap.exists ? (snap.data() as Record<string, string>) : null;
  } catch { return null; }
}

async function logExecution(
  hubId: string,
  tenantId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await db.collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/ExecutionLog`).add({
    ...fields,
    timestamp: FieldValue.serverTimestamp(),
  });
}

function topoSort(nodes: FloNode[], edges: FloEdge[]): FloNode[] {
  const deg: Record<string, number>   = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) { deg[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) { adj[e.source].push(e.target); deg[e.target]++; }
  const queue = nodes.filter(n => deg[n.id] === 0).map(n => n.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const nxt of adj[id]) { if (--deg[nxt] === 0) queue.push(nxt); }
  }
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  return out.map(id => map[id]).filter(Boolean);
}

// ── Connector handlers ────────────────────────────────────────────────────────
// Each handler receives (action, payload) and returns a plain data object.
// To add a new connector: write a handler, add it to CONNECTOR_REGISTRY.
// Nothing else in this file needs to change.

type ConnectorHandler = (
  action:  string,
  payload: Record<string, unknown>,
  creds:   Record<string, string>,
) => Record<string, unknown>;

function handleWorkday(action: string, payload: Record<string, unknown>): Record<string, unknown> {
  const { workerId } = payload;
  const mocks: Record<string, unknown> = {
    GET_DETAILS:    { workerId, name: 'John Doe', title: 'HR Manager', status: 'Active' },
    GET_TIMESHEETS: { workerId, hours: 160, period: 'Q1-2026', approved: true },
    GET_PAYROLL:    { workerId, grossPay: 8500, currency: 'USD', period: '2026-03' },
    GET_BENEFITS:   { workerId, medical: true, dental: true, vision: false },
    LIST_WORKERS:   { workers: [{ id: workerId, name: 'John Doe' }], total: 1 },
  };
  return { message: `${action} completed for ${workerId}`, result: mocks[action] ?? {} };
}

function handleSalesforce(action: string, payload: Record<string, unknown>): Record<string, unknown> {
  const { sfObject } = payload;
  return { message: `${action} on ${sfObject} completed`, recordCount: 1 };
}

function handleSap(action: string, payload: Record<string, unknown>): Record<string, unknown> {
  const { sapModule, bapi } = payload;
  return { message: `SAP ${action} on ${sapModule}/${bapi} completed` };
}

function handleOracle(action: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { message: `Oracle ${action} completed`, rowsAffected: 0 };
}

// ── Connector registry ────────────────────────────────────────────────────────
// The only place you touch when adding a new connector.
const CONNECTOR_REGISTRY: Record<string, ConnectorHandler> = {
  workday:    handleWorkday,
  salesforce: handleSalesforce,
  sap:        handleSap,
  oracle:     handleOracle,
  // storageConnector: handleStorage,
  // authConnector:    handleAuth,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. energizeHub — PROTECTED
// ─────────────────────────────────────────────────────────────────────────────
export const energizeHub = onCall<EnergizeData>(async (request) => {
  requireAuth(request);
  try {
    return await provisionHubAndTenants(request.auth!.uid, request.data);
  } catch (e: any) {
    throw new HttpsError('internal', e.message ?? 'Unknown provisioning error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. validateTenantUser — PUBLIC (login, no token yet)
// ─────────────────────────────────────────────────────────────────────────────
export const validateTenantUser = onCall<{
  slug: string; env: string; email: string; password: string;
}>(async (request) => {
  const { slug, env, email } = request.data;
  if (!slug || !env || !email) {
    throw new HttpsError('invalid-argument', 'slug, env and email are required');
  }

  const tenant = await resolveTenantBySlugEnv(slug, env);
  if (!tenant) throw new HttpsError('not-found', `No tenant for ${slug}/${env}`);

  const { hubId, tenantId, tenantData } = tenant;
  if (!tenantData.isActive) {
    throw new HttpsError('failed-precondition', 'This environment is not yet active');
  }

  let userRecord: UserRecord;
  try { userRecord = await getAuth().getUserByEmail(email); }
  catch { throw new HttpsError('unauthenticated', 'Invalid credentials'); }

  const userSnap = await db
    .collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users`)
    .where('email', '==', email).where('isActive', '==', true).limit(1).get();

  if (userSnap.empty) {
    throw new HttpsError('permission-denied', 'User is not authorised for this tenant');
  }

  const userData = userSnap.docs[0].data();
  const token = await getAuth().createCustomToken(userRecord.uid, {
    hubId, tenantId, role: userData.role ?? 'user',
  });

  const tenantUser: TenantUser = {
    uid:                userRecord.uid,
    email:              userRecord.email       ?? email,
    displayName:        userRecord.displayName ?? (userData.displayName as string | undefined),
    hubId,
    tenantId,
    isActive:           userData.isActive           || false,
    forcePasswordReset: userData.forcePasswordReset || true,
    workspaceIds:       (userData.workspaceIds as string[]) ?? [],
    role:               toHubRole(userData.role),
  };

  return { token, user: tenantUser };
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. executeConnector — PROTECTED
//
// Single entry point for ALL connector integrations. Adding a new connector
// never requires deploying a new function — just add a handler + registry entry.
//
// Example calls from the frontend:
//
//   const fn = httpsCallable(getFunctions(), 'executeConnector');
//
//   // Workday
//   await fn({ connector: 'workday', action: 'GET_DETAILS',
//              hubId, tenantId, payload: { workerId: 'W-001' } });
//
//   // Salesforce
//   await fn({ connector: 'salesforce', action: 'QUERY',
//              hubId, tenantId, payload: { sfObject: 'Account', filter: 'Id = ...' } });
//
//   // Future storage connector — payload shape is entirely up to that handler
//   await fn({ connector: 'storageConnector', action: 'UPLOAD_FILE',
//              hubId, tenantId, payload: { bucket: 'x', path: '/docs/file.pdf' } });
// ─────────────────────────────────────────────────────────────────────────────
export const executeConnector = onCall<ConnectorRequest>(
  async (request): Promise<ConnectorResult> => {
    requireAuth(request);

    const { connector, action, hubId, tenantId, payload } = request.data;

    if (!connector || !action || !hubId || !tenantId) {
      throw new HttpsError(
        'invalid-argument',
        'connector, action, hubId and tenantId are required'
      );
    }

    // Fail fast for unknown connectors before touching Firestore
    const handler = CONNECTOR_REGISTRY[connector];
    if (!handler) {
      throw new HttpsError(
        'not-found',
        `Unknown connector: "${connector}". Add it to CONNECTOR_REGISTRY in index.ts.`
      );
    }

    // Verify credentials are configured for this connector + tenant
    const creds = await getConnectorCreds(hubId, tenantId, connector);
    if (!creds) {
      throw new HttpsError(
        'not-found',
        `No credentials configured for connector "${connector}" on this tenant`
      );
    }

    // Execute — payload is passed as-is; each handler takes what it needs
    const data = handler(action, payload ?? {}, creds);

    // Audit log — payload intentionally excluded to avoid logging sensitive values
    await logExecution(hubId, tenantId, { connector, action, status: 'success' });

    return { success: true, connector, action, data };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. executeFlo — PROTECTED
//
// Flow nodes that correspond to connectors (e.g. "workdayNode", "sapNode")
// are routed through the same CONNECTOR_REGISTRY as executeConnector,
// so adding a new connector automatically works in flos too.
// ─────────────────────────────────────────────────────────────────────────────
export const executeFlo = onCall<{
  hubId: string; tenantId: string; floId: string; nodes: FloNode[]; edges: FloEdge[];
}>(async (request) => {
  requireAuth(request);

  const { hubId, tenantId, floId, nodes, edges } = request.data;
  const log: string[] = [];
  const outputs: Record<string, unknown> = {};
  const ordered = topoSort(nodes, edges);

  log.push(`Starting flo: ${floId} · ${ordered.length} nodes`);

  for (const node of ordered) {
    log.push(`Running node: ${node.type} (${node.id})`);
    try {
      const upstream = edges
        .filter(e => e.target === node.id)
        .reduce((acc, e) => ({ ...acc, ...(outputs[e.source] as object ?? {}) }), {});
      const nd = { ...node.data, ...upstream, hubId, tenantId } as Record<string, unknown>;
      let result: unknown;

      // Connector nodes: type name = connectorName + "Node" (e.g. "workdayNode")
      const connectorMatch = node.type.match(/^(\w+)Node$/);
      const connectorName  = connectorMatch?.[1];
      const handler        = connectorName ? CONNECTOR_REGISTRY[connectorName] : undefined;

      if (handler) {
        const creds = await getConnectorCreds(hubId, tenantId, connectorName!);
        if (!creds) throw new Error(`${connectorName} credentials not configured`);
        const action = (nd.action ?? nd.actionType ?? '') as string;
        result = handler(action, nd, creds);
        log.push(`✓ ${connectorName} ${action}`);
      } else {
        // Utility nodes that are not connector integrations
        switch (node.type) {
          case 'mapperNode': {
            const mappings = (nd.mappings as string[]) ?? [];
            const mapped: Record<string, unknown> = { ...upstream };
            for (const m of mappings) {
              const [src, tgt] = m.split('→').map(s => s.trim());
              if (src && tgt) mapped[tgt] = (upstream as Record<string, unknown>)[src];
            }
            result = mapped;
            log.push(`✓ Mapper applied ${mappings.length} mappings`);
            break;
          }
          case 'filterNode': {
            const field    = nd.field    as string;
            const operator = nd.operator as string;
            const value    = nd.value    as string;
            const actual   = (upstream as Record<string, unknown>)[field];
            let passed = false;
            switch (operator) {
              case '==': passed = actual == value; break;
              case '!=': passed = actual != value; break;
              case '>':  passed = Number(actual) >  Number(value); break;
              case '<':  passed = Number(actual) <  Number(value); break;
              case '>=': passed = Number(actual) >= Number(value); break;
              case '<=': passed = Number(actual) <= Number(value); break;
              case 'contains':   passed = String(actual).includes(value); break;
              case 'startsWith': passed = String(actual).startsWith(value); break;
            }
            result = passed ? upstream : null;
            log.push(`✓ Filter ${field} ${operator} ${value} → ${passed ? 'PASS' : 'SKIP'}`);
            break;
          }
          default:
            log.push(`⚠ Unknown node type: ${node.type} — skipped`);
            result = upstream;
        }
      }

      outputs[node.id] = result;
    } catch (err: any) {
      log.push(`Error in ${node.id}: ${err.message}`);
    }
  }

  const hasError = log.some(l => l.startsWith('Error'));
  await logExecution(hubId, tenantId, {
    flowId, log,
    nodeCount: ordered.length,
    status: hasError ? 'error' : 'success',
  });

  return { log, status: hasError ? 'error' : 'success' };
});
/**
 * functions/src/index.ts
 *
 * Entry point — exports every Cloud Function.
 * validateAdminUser lives in ./validateAdminUser.ts and is RE-EXPORTED here.
 * Defining it in BOTH files would cause a duplicate export error at deploy time.
 */

import { onCall, HttpsError }        from 'firebase-functions/v2/https';
import { getApps }    from 'firebase-admin/app';
import { getAuth }                    from 'firebase-admin/auth';
import type { UserRecord }            from 'firebase-admin/auth';
import { FieldValue }   from 'firebase-admin/firestore';
import type { DocumentData }          from 'firebase-admin/firestore';

import { EnergizeData, TenantUser } from './types/types.js';
import { provisionHubAndTenants }              from './services/provisioning.js';
export { updateHubDetails } from './services/hubUpdate.js';

import type { RunContext } from '@floplug/shared';
import {toHubRole, ROLE_PERMISSIONS} from  '@floplug/shared';

// Storage
export { storageUpload, storageGetUrl, storageDelete, storageList } from "./helpers/storageHandlers.js";
export { uploadSchema } from "./helpers/uploadSchema.js";
export { listSchemaOperations } from "./helpers/listSchemaOperations.js";

// Any other existing functions you already have
export { resolveActionSchema } from './utils/resolveActionSchema.js';
export { executeFloAction } from './executeFloAction.js';
export { resolveFloActionMappingTargetCallable as resolveFloActionMappingTarget } from './resolveFloActionMappingTarget.js';
export { invokeFlo } from './services/floWebhook.js';
import { db } from './utils/firebase.js';
import { executeFloNodes} from './engine/executeFloNodes.js';
import { executeEmailNode } from './nodes/emailNode.js';
import { executePlugNode }   from './nodes/plugNode.js';
import { wrapMessage }       from './nodes/cStreamMeta.js';

export { executeEmailNode } from './nodes/emailNode.js';

// ── Re-exports ────────────────────────────────────────────────────────────────
// validateAdminUser is DEFINED in ./validateAdminUser.ts — only re-exported here.
export { validateAdminUser } from './validateAdminUser.js';

// Provisioning functions — defined in ./services/provisionUsers.ts
export {
  inviteAdminUser,
//  inviteHubUser,
  updateAdminRole,
//  updateHubUserRole,
} from './services/provisionUsers.js';
import {HUB_ROLES,COLLECTIONS,HUB_COLLECTIONS,PERMISSIONS} from '@floplug/shared';

export {
  getHubPlugs,
  getHubUsers,
  getHubFlos,
  savePlug,
  deactivatePlug,
  inviteHubUser,
  updateHubUserRole,
  deactivateHubUser,
  reactivateHubUser,
  saveHubActionNode,
  getHubActionNodes,
} from './services/hubFunctions.js';

export {
  saveFloConnection,
  getFloConnections,
  getFloConnectionsForPlug,
  deactivateFloConnection,
} from './services/floConnectionService.js';



// ── Init ──────────────────────────────────────────────────────────────────────
const projectId = process.env.GCLOUD_PROJECT;
console.log(`[index.ts] Project ID: ${projectId}`);
console.log(`[index.ts] Checking getApps.length: ${getApps().length}`);

// ── Local types ───────────────────────────────────────────────────────────────
interface FloNode { id: string; type: string; data: Record<string, unknown>; }
interface FloEdge { source: string; target: string; }

// ── Auth guard helper ─────────────────────────────────────────────────────────
// Call this at the top of every protected function.
function requireAuth(request: { auth?: unknown }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to call this function.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveTenantBySlugEnv(slug: string, env: string)
  : Promise<{ hubId: string; tenantId: string; tenantData: DocumentData } | null> {
  const snap = await db.collectionGroup(HUB_COLLECTIONS.TENANTS)
    .where('slug', '==', slug).where('tenantType', '==', env).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { hubId: d.ref.parent.parent?.id ?? '', tenantId: d.id, tenantData: d.data() };
}

async function getConnectorCreds(hubId: string, tenantId: string, connectorId: string)
  : Promise<Record<string, string> | null> {
  try {
    const snap = await db.doc(
      `${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/ConnectorCredentials/${connectorId}`
    ).get();
    return snap.exists ? (snap.data() as Record<string, string>) : null;
  } catch { return null; }
}



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
// 2. validateTenantUser — PUBLIC (login function, no auth token yet)
// ─────────────────────────────────────────────────────────────────────────────

export const validateTenantUser = onCall<{
  slug: string; env: string; email: string; password: string;
}>(async (request) => {
  const { slug, env, email, password } = request.data;
  if (!slug || !env || !email || !password) {
    throw new HttpsError('invalid-argument', 'slug, env, email and password are required');
  }

  const tenant = await resolveTenantBySlugEnv(slug, env);
  if (!tenant) throw new HttpsError('not-found', `No tenant for ${slug}/${env}`);

  const { hubId, tenantId, tenantData } = tenant;
  if (!tenantData.isActive) {
    throw new HttpsError('failed-precondition', 'This environment is not yet active');
  }

  // ── Verify password via Firebase Auth REST API ──────────────────────────────
  const apiKey    = process.env.WEB_API_KEY ?? '';
  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );
  if (!verifyRes.ok) {
    throw new HttpsError('unauthenticated', 'Invalid credentials');
  }

  // ── Get Firebase Auth user ──────────────────────────────────────────────────
  let userRecord: UserRecord;
  try { userRecord = await getAuth().getUserByEmail(email); }
  catch { throw new HttpsError('unauthenticated', 'Invalid credentials'); }

  // ── Load Firestore user profile ─────────────────────────────────────────────
  const userSnap = await db
    .collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.USERS}`)
    .where('email', '==', email)
    .where('isActive', '==', true)
    .limit(1).get();

  if (userSnap.empty) {
    throw new HttpsError('permission-denied', 'User is not authorised for this tenant');
  }

  const userData    = userSnap.docs[0].data();
  const role        = toHubRole(userData.role);

  // ── Build permissions from role + any user-specific extras ─────────────────
  // Base permissions come from role map — never hardcoded in UI
  const basePerms   = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['user'];

  // Per-user invoke permissions stored in Firestore
  const invokePerms = userData.invokePermissions ?? {};
  const extraPerms: string[] = [];

  if (invokePerms.canRunInDesigner) extraPerms.push(PERMISSIONS.RUN_FLOS);
  if ((invokePerms.allowedUids?.length ?? 0) > 0) extraPerms.push(PERMISSIONS.INVOKE_FLOS);

  // Merge — deduplicate
  const permissions = [...new Set([...basePerms, ...extraPerms])];

  // ── Create custom token with permissions embedded ───────────────────────────
  // UI checks permissions array — NEVER checks role string
  const token = await getAuth().createCustomToken(userRecord.uid, {
    hubId,
    tenantId,
    role,                              // stored for audit — not used for access control
    permissions,                       // ← what UI and backend actually check
    isHubAdmin: role === HUB_ROLES.ADMIN,  // ← convenience boolean for UI display only
    allowedFlos: invokePerms.allowedUids ?? [],  // which flos this user can invoke
  });

  // ── Build TenantUser response — no sensitive data ──────────────────────────
  // permissions NOT returned to frontend in user object
  // they're in the signed token only — UI reads via getIdTokenResult()
  const tenantUser: TenantUser = {
    uid:                userRecord.uid,
    email:              userRecord.email        ?? email,
    displayName:        userRecord.displayName  ?? (userData.displayName as string | undefined),
    hubId,
    tenantId,
    isActive:           userData.isActive       ?? false,
    forcePasswordReset: userData.forcePasswordReset ?? true,
    workspaceIds:       (userData.workspaceIds as string[]) ?? [],
    role,               // kept in TenantUser for display label only
  };

  return { token, user: tenantUser };
});

// getValue / setValue imported from ./utils/pathUtils.js
// ─────────────────────────────────────────────────────────────────────────────
// 3. executeWorkdayAction — PROTECTED
// ─────────────────────────────────────────────────────────────────────────────
export const executeWorkdayAction = onCall<{
  refId: string; refIdType: string; actionType: string; hubId: string; tenantId: string;
}>(async (request) => {
  requireAuth(request);
  const { refId, refIdType,actionType, hubId, tenantId } = request.data;
  if (!hubId || !tenantId) throw new HttpsError('invalid-argument', 'hubId and tenantId required');
  const creds = await getConnectorCreds(hubId, tenantId, 'workday');
  if (!creds) throw new HttpsError('not-found', 'Workday credentials not configured');

  const mocks: Record<string, unknown> = {
    Get_Suppliers:    { refId, refIdType ,name: 'John Doe', title: 'HR Manager', status: 'Active' },
    Get_Customers:    { refId, refIdType,hours: 160, period: 'Q1-2026', approved: true },
    Get_Sales_Items:  { refId, refIdType, grossPay: 8500, currency: 'USD', period: '2026-03' },
    Get_Supplier_Invoices:   { refId, refIdType, medical: true, dental: true, vision: false },
    Get_Workers:   { workers: [{ refId, refIdType, name: 'John Doe' }], total: 1 },
  };
  await db.collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).add({
    connector: 'workday', action: actionType, refId: refId, refIdType: refIdType,
    timestamp: FieldValue.serverTimestamp(), status: 'success',
  });
  return { success: true, data: { message: `${actionType} completed for ${refId}`, result: mocks[actionType] ?? {} } };
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. executeSalesforceAction — PROTECTED
// ─────────────────────────────────────────────────────────────────────────────
export const executeSalesforceAction = onCall<{
  sfObject: string; operation: string; filter: string; hubId: string; tenantId: string;
}>(async (request) => {
  requireAuth(request);
  const { sfObject, operation, hubId, tenantId } = request.data;
  const creds = await getConnectorCreds(hubId, tenantId, 'salesforce');
  if (!creds) throw new HttpsError('not-found', 'Salesforce credentials not configured');
  await db.collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).add({
    connector: 'salesforce', action: operation, object: sfObject,
    timestamp: FieldValue.serverTimestamp(), status: 'success',
  });
  return { success: true, message: `${operation} on ${sfObject} completed`, recordCount: 1 };
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. executeSapAction — PROTECTED
// ─────────────────────────────────────────────────────────────────────────────
export const executeSapAction = onCall<{
  sapModule: string; action: string; bapi: string; hubId: string; tenantId: string;
}>(async (request) => {
  requireAuth(request);
  const { sapModule, action, bapi, hubId, tenantId } = request.data;
  const creds = await getConnectorCreds(hubId, tenantId, 'sap');
  if (!creds) throw new HttpsError('not-found', 'SAP credentials not configured');
  await db.collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).add({
    connector: 'sap', module: sapModule, action, bapi,
    timestamp: FieldValue.serverTimestamp(), status: 'success',
  });
  return { success: true, message: `SAP ${action} on ${sapModule}/${bapi} completed` };
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. executeOracleAction — PROTECTED
// ─────────────────────────────────────────────────────────────────────────────
export const executeOracleAction = onCall<{
  action: string; sqlOrProc: string; hubId: string; tenantId: string;
}>(async (request) => {
  requireAuth(request);
  const { action, sqlOrProc, hubId, tenantId } = request.data;
  const creds = await getConnectorCreds(hubId, tenantId, 'oracle');
  if (!creds) throw new HttpsError('not-found', 'Oracle credentials not configured');
  await db.collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).add({
    connector: 'oracle', action, sqlOrProc,
    timestamp: FieldValue.serverTimestamp(), status: 'success',
  });
  return { success: true, message: `Oracle ${action} completed` };
});

// ── testPlugNode — run one plug with custom cStream input (Designer node test) ─
export const testPlugNode = onCall<{
  hubId:      string;
  tenantId:   string;
  plugId:     string;
  inputJson:  Record<string, unknown>;
  nodeConfig: Record<string, unknown>;
}>(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, plugId, inputJson = {}, nodeConfig = {} } = request.data;

  if (!hubId || !tenantId || !plugId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, and plugId are required');
  }

  const store = { global: {} as Record<string, unknown>, local: {} as Record<string, unknown> };

  // Same canonical shape as executeFloNodes start node
  const cStream =
    typeof inputJson === 'object' && inputJson !== null && 'message' in inputJson
      ? (inputJson as Record<string, unknown>)
      : (wrapMessage(inputJson, { source: 'testPlugNode' }) as Record<string, unknown>);

  const isEmail =
    nodeConfig.authProtocol === 'smtp_basic' || nodeConfig.nodeType === 'emailNode';

  const nd: Record<string, unknown> = {
    hubId,
    tenantId,
    plugId,
    id:            'test-plug-node',
    urlVariables:  nodeConfig.urlVariables,
    emailBindings: nodeConfig.emailBindings,
    outputTarget:  nodeConfig.outputTarget ?? 'cStream',
    outputVarName: nodeConfig.outputVarName ?? '',
    method:        nodeConfig.method,
    authProtocol:  nodeConfig.authProtocol,
    nodeType:      nodeConfig.nodeType,
  };

  try {
    const { cStream: output, logLine } = isEmail
      ? await executeEmailNode(cStream, nd, store)
      : await executePlugNode(cStream, nd, store);

    await db.collection(
      `${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`,
    ).add({
      type:      'plug_test',
      plugId,
      timestamp: FieldValue.serverTimestamp(),
      status:    'success',
    });

    return {
      success: true,
      message: logLine,
      logLine,
      output,
      store,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpsError('internal', message);
  }
});

//------------------
export const executeFlo = onCall(async (request) => {
  const {
    hubId,
    tenantId,
    floId,
    nodes,
    edges,
    inputJson = {},
    wsId = '',
  } = request.data as {
    hubId:     string;
    tenantId:  string;
    floId:    string;
    wsId?:     string;
    nodes:     FloNode[];
    edges:     FloEdge[];
    inputJson: Record<string, unknown>;
  };
  //const { hubId, tenantId, floId, nodes, edges, inputJson = {} } = request.data;
  //const wsId = request.data.wsId ?? '';
  const log:   string[] = [];
  const store = { global: {} as Record<string, any>, local: {} as Record<string, any> };

  const runRef = db.collection(`${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`).doc();
  const runId  = runRef.id;
  const ctx: RunContext = { hubId, tenantId, wsId, runId, store, log, depth: 0 };

  log.push(`╔══ RUN: ${runId} ══╗`);
  log.push(`Flow: ${floId} · ${nodes.length} nodes`);
  log.push(`Input: ${JSON.stringify(inputJson)}`);

  await runRef.set({
    runId, floId, inputJson, log: [], output: null,
    nodeCount: nodes.length, status: 'running',
    startedAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });

  let floOutput: unknown = null;
  try {
    floOutput = await executeFloNodes(nodes, edges, inputJson, ctx); // ← just this line
  } catch (err: any) {
    log.push(`Fatal error: ${err.message}`);
  }

  const hasError = log.some(l => l.startsWith('Error') || l.includes('Fatal'));
  log.push(`╚══ END RUN: ${runId} ══╝`);

  await runRef.update({
    log, output: floOutput,
    status:      hasError ? 'error' : 'success',
    completedAt: FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
  });

  return { executionId: runId, log, status: hasError ? 'error' : 'success', output: floOutput };
});





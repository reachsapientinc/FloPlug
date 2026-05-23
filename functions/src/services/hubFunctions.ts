import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getPermissionsForRole } from '../helpers/settingsHelper.js';
import '../constants.js';
import { COLLECTIONS, HUB_COLLECTIONS, HUB_ROLES, PERMISSIONS, ROLES, SUB_COLLECTIONS } from '@floplug/shared';

if (!getApps().length) initializeApp();

const db   = getFirestore();
const auth = getAuth();

// ── Auth helpers ───────────────────────────────────────────────────────────────

function requirePermission(request: any, permission: string): string {
  const uid = requireAuth(request);
  const permissions: string[] = request.auth.token?.permissions ?? [];
  if (!request.auth.token?.isHubAdmin && !permissions.includes(permission)) {
    throw new HttpsError('permission-denied', `${permission} permission required.`);
  }
  return uid;
}

function requireAuth(request: any): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Not authenticated.');
  }
  return request.auth.uid as string;
}

function requireHubAdmin(request: any): string {
  const uid = requireAuth(request);
  const isHubAdmin =
    request.auth.token?.isHubAdmin === true ||
    (request.auth.token?.role as string) === ROLES.HUB_ROLES.ADMIN;
  if (!isHubAdmin) {
    throw new HttpsError('permission-denied', 'hub_admin role required.');
  }
  return uid;
}

function requireSameHub(request: any, hubId: string, tenantId: string) {
  const token = request.auth?.token as any;
  if (token?.hubId !== hubId || token?.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Hub/tenant mismatch.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant path helper
// ─────────────────────────────────────────────────────────────────────────────
function tenantCol(hubId: string, tenantId: string) {
  return db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId);
}

// ═════════════════════════════════════════════════════════════════════════════
// READ — any authenticated hub member
// ═════════════════════════════════════════════════════════════════════════════

export const getHubPlugs = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId } = request.data as { hubId: string; tenantId: string };
  requireSameHub(request, hubId, tenantId);

  const snap = await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.PLUGS)
    .where('isActive', '!=', false)
    .get();

  const plugs = snap.docs.map(d => {
    const { credentials, ...safe } = d.data() as any;
    return { id: d.id, ...safe };
  });

  return { plugs };
});

export const getHubUsers = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId } = request.data as { hubId: string; tenantId: string };
  requireSameHub(request, hubId, tenantId);

  const snap = await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.USERS)
    .get();

  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return { users };
});

export const getHubFlos = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId } = request.data as { hubId: string; tenantId: string };
  requireSameHub(request, hubId, tenantId);

  const wsSnap = await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.WORKSPACES).get();

  const flos: any[] = [];
  await Promise.all(wsSnap.docs.map(async ws => {
    const fSnap = await tenantCol(hubId, tenantId)
      .collection(HUB_COLLECTIONS.WORKSPACES).doc(ws.id)
      .collection(HUB_COLLECTIONS.FLOS).get();
    fSnap.docs.forEach(f => {
      const d = f.data();
      flos.push({ id: f.id, name: d.name, shortCode: d.shortCode, workspaceId: ws.id });
    });
  }));
  return { flos };
});

// ═════════════════════════════════════════════════════════════════════════════
// getHubActionNodes
// Returns all saved FloActionNodes for a tenant, optionally filtered by
// connectorId. Used by FloActionManager to seed existing config on load.
// Auth: hub_admin (designers don't need to see node config).
// ═════════════════════════════════════════════════════════════════════════════

export const getHubActionNodes = onCall(async (request) => {
  requireAuth(request);

  const { hubId, tenantId, connectorId } =
    request.data as { hubId: string; tenantId: string; connectorId?: string };

  if (!hubId || !tenantId) {
    throw new HttpsError('invalid-argument', 'hubId and tenantId are required.');
  }
  requireSameHub(request, hubId, tenantId);

  const token = request.auth?.token as Record<string, unknown> | undefined;
  const isHubAdmin =
    token?.isHubAdmin === true ||
    (token?.role as string) === ROLES.HUB_ROLES.ADMIN;

  let query = tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLOACTIONNODES)
    .where('isActive', '==', true) as FirebaseFirestore.Query;

  if (connectorId) {
    query = query.where('connectorId', '==', connectorId);
  }

  const snap = await query.get();

  let nodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!isHubAdmin) {
    nodes = nodes.filter(n => (n as { enabledForDevelopers?: boolean }).enabledForDevelopers !== false);
  }

  console.log(`[getHubActionNodes] tenantId=${tenantId} connectorId=${connectorId ?? 'all'} → ${nodes.length} nodes`);
  return { nodes };
});

// ═════════════════════════════════════════════════════════════════════════════
// PLUG MUTATIONS
// ═════════════════════════════════════════════════════════════════════════════

export const savePlug = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_PLUGS);
  const { hubId, tenantId, ...plugData } = request.data as any;
  requireSameHub(request, hubId, tenantId);

  const col = tenantCol(hubId, tenantId).collection(HUB_COLLECTIONS.PLUGS);

  if (plugData.id) {
    const { id, ...fields } = plugData;
    const updatePayload: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== '' && v !== undefined) updatePayload[k] = v;
    }
    await col.doc(id).set(updatePayload, { merge: true });
    return { id };
  } else {
    const ref = await col.add({
      ...plugData,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id };
  }
});

export const deactivatePlug = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_PLUGS);
  const { hubId, tenantId, plugId } =
    request.data as { hubId: string; tenantId: string; plugId: string };
  requireSameHub(request, hubId, tenantId);

  await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .update({ isActive: false, deactivatedAt: FieldValue.serverTimestamp() });

  return { success: true };
});

// ═════════════════════════════════════════════════════════════════════════════
// USER MUTATIONS — admin-only
// ═════════════════════════════════════════════════════════════════════════════

export const inviteHubUser = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_USERS);
  const { hubId, tenantId, email, displayName, role, workspaceIds } =
    request.data as {
      hubId: string; tenantId: string; email: string;
      displayName: string; role: string; workspaceIds: string[];
    };
  requireSameHub(request, hubId, tenantId);

  const userRecord = await auth.createUser({ email, displayName, emailVerified: false });
  const permissions = await getPermissionsForRole(role);
  await auth.setCustomUserClaims(userRecord.uid, {
    role, hubId, tenantId,
    isHubAdmin:  role === HUB_ROLES.ADMIN,
    permissions: permissions || [],
  });

  await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(userRecord.uid)
    .set({
      uid: userRecord.uid, email, displayName, role, hubId, tenantId,
      workspaceIds: workspaceIds ?? [],
      isActive: true, forcePasswordReset: true,
      permissions: [], isHubAdmin: role === HUB_ROLES.ADMIN,
      createdAt: FieldValue.serverTimestamp(),
    });

  return { uid: userRecord.uid };
});

export const updateHubUserRole = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_USERS);
  const { hubId, tenantId, targetUid, role, invokePermissions } =
    request.data as {
      hubId: string; tenantId: string; targetUid: string;
      role: string; invokePermissions: any;
    };
  requireSameHub(request, hubId, tenantId);

  const existing  = (await auth.getUser(targetUid)).customClaims ?? {};
  const permissions = await getPermissionsForRole(role);
  await auth.setCustomUserClaims(targetUid, {
    ...existing, role,
    isHubAdmin:  role === HUB_ROLES.ADMIN,
    permissions: permissions ?? [],
  });

  await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({ role, isHubAdmin: role === HUB_ROLES.ADMIN, invokePermissions, updatedAt: FieldValue.serverTimestamp() });

  return { success: true };
});

export const deactivateHubUser = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_USERS);
  const { hubId, tenantId, targetUid } =
    request.data as { hubId: string; tenantId: string; targetUid: string };
  requireSameHub(request, hubId, tenantId);

  await auth.updateUser(targetUid, { disabled: true });
  await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({ isActive: false, deactivatedAt: FieldValue.serverTimestamp() });

  return { success: true };
});

export const reactivateHubUser = onCall(async (request) => {
  requirePermission(request, PERMISSIONS.MANAGE_USERS);
  const { hubId, tenantId, targetUid } =
    request.data as { hubId: string; tenantId: string; targetUid: string };
  requireSameHub(request, hubId, tenantId);

  await auth.updateUser(targetUid, { disabled: false });
  await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({ isActive: true, reactivatedAt: FieldValue.serverTimestamp() });

  return { success: true };
});

// ═════════════════════════════════════════════════════════════════════════════
// saveHubActionNode
//
// Changes from previous version:
//  1. Stores allowedConnectionIds[] — the full set of connections the developer
//     may choose from when the node is on the designer canvas.
//  2. defaultConnectionId = connectionId from the request (the ★ selection).
//  3. isCreate detection: reads the existing doc first so createdAt is only
//     set on first write (merge: true would overwrite it otherwise).
//  4. requireHubAdmin replaces the inline isHubAdmin check for consistency.
// ═════════════════════════════════════════════════════════════════════════════

interface SaveHubActionNodeRequest {
  hubId:                string;
  tenantId:             string;
  floKitId:             string;
  connectorId:          string;
  /** The ★ default — what gets pre-selected when a developer drops the node */
  connectionId:         string;
  /** All connections the developer may switch between in the inspector */
  allowedConnectionIds: string[];
  actionIds:            string[];
  outputTarget:         'cStream' | 'local' | 'global';
  varName?:             string;
  floActionName?:       string;
  flaLabel?:            string;
  description?:         string;
  /** @deprecated Use floActionName */
  displayName?:         string;
}

export const saveHubActionNode = onCall(async (request) => {
  const callerUid = requireHubAdmin(request);

  const {
    hubId, tenantId, floKitId, connectorId,
    connectionId,
    allowedConnectionIds,
    actionIds, outputTarget, varName,
    floActionName, flaLabel, description, displayName,
  } = request.data as SaveHubActionNodeRequest;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!hubId || !tenantId || !floKitId || !connectorId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, floKitId and connectorId are required.');
  }
  if (!Array.isArray(actionIds) || actionIds.length === 0) {
    throw new HttpsError('invalid-argument', 'actionIds must be a non-empty array.');
  }
  if (!connectionId) {
    throw new HttpsError('invalid-argument', 'connectionId (default connection) is required.');
  }
  if (!Array.isArray(allowedConnectionIds) || allowedConnectionIds.length === 0) {
    throw new HttpsError('invalid-argument', 'allowedConnectionIds must be a non-empty array.');
  }
  if (!allowedConnectionIds.includes(connectionId)) {
    throw new HttpsError('invalid-argument', 'defaultConnectionId must be one of the allowedConnectionIds.');
  }

  const resolvedName = (floActionName ?? displayName)?.trim();
  const resolvedLabel = flaLabel?.trim();
  if (!resolvedName) {
    throw new HttpsError('invalid-argument', 'floActionName is required.');
  }
  if (!resolvedLabel) {
    throw new HttpsError('invalid-argument', 'flaLabel is required.');
  }

  requireSameHub(request, hubId, tenantId);

  // Deterministic id: one FloActionNode per floKit per tenant
  const instanceId = `flan_${floKitId}`;
  const docRef     = tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLOACTIONNODES).doc(instanceId);

  const labelNorm = resolvedLabel.toLowerCase();
  const siblingsSnap = await tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLOACTIONNODES)
    .where('isActive', '==', true)
    .get();
  const labelTaken = siblingsSnap.docs.some(d => {
    if (d.id === instanceId) return false;
    const other = (d.data().flaLabel as string | undefined)?.trim().toLowerCase();
    return other === labelNorm;
  });
  if (labelTaken) {
    throw new HttpsError('already-exists', `flaLabel "${resolvedLabel}" is already used by another FloAction.`);
  }

  const existing  = await docRef.get();
  const isCreate  = !existing.exists;
  const now       = FieldValue.serverTimestamp();

  // Pull request binding metadata from kit-scoped FloKitActions so hub-level
  // FloActionNodes can expose message/root/type details without extra lookups.
  const actionBindingEntries = await Promise.all(
    actionIds.map(async (actionId) => {
      const snap = await db
        .collection(COLLECTIONS.FLOPLUGCONNECTORS).doc(connectorId)
        .collection(SUB_COLLECTIONS.FLOKITS).doc(floKitId)
        .collection(SUB_COLLECTIONS.FLOKITACTIONS).doc(actionId)
        .get();
      const data = snap.data() as { requestBinding?: Record<string, unknown> } | undefined;
      return [actionId, data?.requestBinding] as const;
    }),
  );
  const requestBindingByActionId = Object.fromEntries(
    actionBindingEntries.filter(([, binding]) => !!binding),
  );
  const primaryBinding = requestBindingByActionId[actionIds[0]] as Record<string, unknown> | undefined;
  const primaryInputMessageName =
    typeof primaryBinding?.inputMessageName === 'string' ? primaryBinding.inputMessageName : undefined;
  const primaryRequestRootElement =
    typeof primaryBinding?.requestRootElement === 'string' ? primaryBinding.requestRootElement : undefined;
  const primaryRequestTypeName =
    typeof primaryBinding?.requestTypeName === 'string' ? primaryBinding.requestTypeName : undefined;
  const requestBinding = {
    ...(primaryBinding ?? {}),
    ...(primaryInputMessageName ? { inputMessageName: primaryInputMessageName } : {}),
    ...(primaryRequestRootElement ? { requestRootElement: primaryRequestRootElement } : {}),
    ...(primaryRequestTypeName ? { requestTypeName: primaryRequestTypeName } : {}),
  };

  const doc: Record<string, any> = {
    id:                   instanceId,
    hubId,
    tenantId,
    floKitId,
    connectorId,
    actionIds,
    templateActionId:     actionIds[0],   // kept for backwards compat
    /** The ★ default connection shown pre-selected in the designer */
    defaultConnectionId:  connectionId,
    /** Full set developers may choose from in the PlugNodeInspector */
    allowedConnectionIds,
    floActionName:        resolvedName,
    flaLabel:             resolvedLabel,
    description:          description?.trim() ?? '',
    displayName:          resolvedName,
    outputTarget:         outputTarget ?? 'cStream',
    varName:              varName?.trim() ?? '',
    enabledForDevelopers: true,
    isActive:             true,
    updatedBy:            callerUid,
    updatedAt:            now,
    ...(Object.keys(requestBinding).length > 0 ? { requestBinding } : {}),
    ...(Object.keys(requestBindingByActionId).length > 0 ? { requestBindingByActionId } : {}),
    ...(primaryInputMessageName ? { inputMessageName: primaryInputMessageName } : {}),
    ...(primaryRequestRootElement ? { requestRootElement: primaryRequestRootElement } : {}),
    ...(primaryRequestTypeName ? { requestTypeName: primaryRequestTypeName } : {}),
  };

  // Only set createdAt on first write — merge: true alone would overwrite it
  if (isCreate) {
    doc.createdBy  = callerUid;
    doc.createdAt  = now;
    doc.kitVersion = '';
  }

  await docRef.set(doc, { merge: true });

  console.log(
    `[saveHubActionNode] ${isCreate ? 'Created' : 'Updated'} ${instanceId} ` +
    `actions=${actionIds.length} connections=${allowedConnectionIds.length} default=${connectionId}`
  );

  return { instanceId, created: isCreate };
});

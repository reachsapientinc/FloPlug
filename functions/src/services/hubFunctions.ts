import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore ,FieldValue} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getPermissionsForRole } from '../helpers/settingsHelper.js';
import '../constants.js';
import {COLLECTIONS,HUB_COLLECTIONS, HUB_ROLES,PERMISSIONS} from '@floplug/shared';

if (!getApps().length) initializeApp();

const db   = getFirestore();
const auth = getAuth();

// ── Auth helpers ───────────────────────────────────────────────────────────────
// In v2, auth lives on request.auth (not context.auth)

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

// function requireHubAdmin(request: any): string {
//   const uid = requireAuth(request);
//   if (request.auth.token?.role !== 'hub_admin') {
//     throw new HttpsError('permission-denied', 'hub_admin role required.');
//   }
//   return uid;
// }

function requireSameHub(request: any, hubId: string, tenantId: string) {
  const token = request.auth?.token as any;
  if (token?.hubId !== hubId || token?.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Hub/tenant mismatch.');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// READ — any authenticated hub member
// ═════════════════════════════════════════════════════════════════════════════

export const getHubPlugs = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId } = request.data as { hubId: string; tenantId: string };
  requireSameHub(request, hubId, tenantId);

  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
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

  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.USERS)
    .get();

  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return { users };
});

export const getHubFlos = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId } = request.data as { hubId: string; tenantId: string };
  requireSameHub(request, hubId, tenantId);

  const wsSnap = await db
  .collection(COLLECTIONS.HUBS).doc(hubId)
  .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
  .collection(HUB_COLLECTIONS.WORKSPACES).get();

const flos: any[] = [];
await Promise.all(wsSnap.docs.map(async ws => {
  const fSnap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
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
// PLUG MUTATIONS
// ═════════════════════════════════════════════════════════════════════════════

export const savePlug = onCall(async (request) => {
  //requireAuth(request);
  requirePermission(request, PERMISSIONS.MANAGE_PLUGS);
  const { hubId, tenantId, ...plugData } = request.data as any;
  requireSameHub(request, hubId, tenantId);

  const col = db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS);

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
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id };
  }
});

export const deactivatePlug = onCall(async (request) => {
  //requireHubAdmin(request);
  requirePermission(request, PERMISSIONS.MANAGE_PLUGS);
  const { hubId, tenantId, plugId } = request.data as { hubId: string; tenantId: string; plugId: string };
  requireSameHub(request, hubId, tenantId);

  await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .update({
      isActive: false,
      deactivatedAt: FieldValue.serverTimestamp(),
    });

  return { success: true };
});

// ═════════════════════════════════════════════════════════════════════════════
// USER MUTATIONS — all admin-only
// ═════════════════════════════════════════════════════════════════════════════

export const inviteHubUser = onCall(async (request) => {
  //requireHubAdmin(request);
  requirePermission(request, PERMISSIONS.MANAGE_USERS); 
  const { hubId, tenantId, email, displayName, role, workspaceIds } =
    request.data as { hubId: string; tenantId: string; email: string; displayName: string; role: string; workspaceIds: string[] };
  requireSameHub(request, hubId, tenantId);

  const userRecord = await auth.createUser({ email, displayName, emailVerified: false });
  const permissions = await getPermissionsForRole(role);
  await auth.setCustomUserClaims(userRecord.uid, {
    role,
    hubId,
    tenantId,
    isHubAdmin:  role === HUB_ROLES.ADMIN,
    permissions: permissions || [],
  });

  await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(userRecord.uid)
    .set({
      uid:                userRecord.uid,
      email,
      displayName,
      role,
      hubId,
      tenantId,
      workspaceIds:       workspaceIds ?? [],
      isActive:           true,
      forcePasswordReset: true,
      permissions:        [],
      isHubAdmin:         role === HUB_ROLES.ADMIN,
      createdAt:          FieldValue.serverTimestamp(),
    });

  // TODO: send invite / password-reset email here

  return { uid: userRecord.uid };
});

export const updateHubUserRole = onCall(async (request) => {
  //requireHubAdmin(request);
  requirePermission(request, PERMISSIONS.MANAGE_USERS); 
  const { hubId, tenantId, targetUid, role, invokePermissions } =
    request.data as { hubId: string; tenantId: string; targetUid: string; role: string; invokePermissions: any };
  requireSameHub(request, hubId, tenantId);

  const existing = (await auth.getUser(targetUid)).customClaims ?? {};
  const permissions = await getPermissionsForRole(role);
  await auth.setCustomUserClaims(targetUid, {
    ...existing,
    role,
    isHubAdmin:  role === HUB_ROLES.ADMIN,
    permissions: permissions ?? [],
  });

  await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({
      role,
      isHubAdmin:        role === HUB_ROLES.ADMIN,
      invokePermissions,
      updatedAt:         FieldValue.serverTimestamp(),
    });

  return { success: true };
});

export const deactivateHubUser = onCall(async (request) => {
  //requireHubAdmin(request);
  requirePermission(request, PERMISSIONS.MANAGE_USERS); 
  const { hubId, tenantId, targetUid } =
    request.data as { hubId: string; tenantId: string; targetUid: string };
  requireSameHub(request, hubId, tenantId);

  await auth.updateUser(targetUid, { disabled: true });

  await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({
      isActive:      false,
      deactivatedAt: FieldValue.serverTimestamp(),
    });

  return { success: true };
});

export const reactivateHubUser = onCall(async (request) => {
  //requireHubAdmin(request);
  requirePermission(request, PERMISSIONS.MANAGE_USERS); 
  const { hubId, tenantId, targetUid } =
    request.data as { hubId: string; tenantId: string; targetUid: string };
  requireSameHub(request, hubId, tenantId);

  await auth.updateUser(targetUid, { disabled: false });

  await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.USERS).doc(targetUid)
    .update({
      isActive:      true,
      reactivatedAt: FieldValue.serverTimestamp(),
    });

  return { success: true };
});
/**
 * floConnectionService.ts
 * Cloud Functions for FloConnection CRUD.
 *
 * Security model mirrors savePlug / getHubPlugs:
 *  - All writes go through Cloud Functions — never direct Firestore from frontend
 *  - Credentials are stripped on every read response
 *  - Caller must be hub_admin (verified via token claims)
 *
 * Firestore paths:
 *   Main doc : FloPlugHubs/{hubId}/Tenants/{tenantId}/FloConnections/{connectionId}
 *   Registry : FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry/flc_{connectionId}
 *
 * Registry dedup rule:
 *   connectionId is used as the Firestore docId (idempotent set).
 *   The registry entry is written in the same batch — both succeed or both fail.
 *   Prefix "flc_" distinguishes connection entries from other registry items
 *   (plug registrations, workspace refs, etc.) that share the same Registry collection.
 */

import { onCall, HttpsError }       from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS, HUB_COLLECTIONS, FLC_REGISTRY_PREFIX,
} from '@floplug/shared';
import type { FloConnectionDoc, FloConnectionRegistryEntry } from '@floplug/shared';
import type { PlugCredentialValues } from '@floplug/shared';

const db = getFirestore();

// ── Path helpers ──────────────────────────────────────────────────────────────

function tenantRef(hubId: string, tenantId: string) {
  return db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId);
}

function connectionRef(hubId: string, tenantId: string, connectionId: string) {
  return tenantRef(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLO_CONNECTIONS).doc(connectionId);
}

function registryRef(hubId: string, tenantId: string, connectionId: string) {
  // All FloConnection registry keys carry the "flc_" prefix so they don't
  // collide with other entity types stored in the same Registry collection.
  return tenantRef(hubId, tenantId)
    .collection(HUB_COLLECTIONS.REGISTRY)
    .doc(`${FLC_REGISTRY_PREFIX}${connectionId}`);
}

// ── Strip credentials before returning to browser ────────────────────────────

function stripCredentials(
  doc: FloConnectionDoc,
): Omit<FloConnectionDoc, 'credentials'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials: _creds, ...safe } = doc;
  return safe;
}

// ── Validate caller is hub_admin ──────────────────────────────────────────────

function assertAdmin(context: { auth?: { token?: Record<string, unknown> } }) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const isHubAdmin = context.auth.token?.isHubAdmin === true
    || (context.auth.token?.role as string) === 'hub_admin';
  if (!isHubAdmin) {
    throw new HttpsError('permission-denied', 'hub_admin role required.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveFloConnection
// Creates or updates a FloConnection (idempotent — uses connectionId as docId).
// Simultaneously writes the registry entry in a batch.
// ─────────────────────────────────────────────────────────────────────────────

interface SaveFloConnectionRequest {
  hubId:            string;
  tenantId:         string;
  connectionId:     string;    // caller supplies or we generate from slugified name
  connectorId:      string;
  connectorLabel?:  string;
  authProtocol:     string;
  name:             string;
  environmentLabel?: string;
  hostname?:        string;
  tenantKey?:       string;
  baseUrl?:         string;
  urlTokenValues?:  Record<string, string>;
  /**
   * On create: all required credential fields must be present.
   * On update: only supply fields you want to change — blank fields keep existing values.
   */
  credentials:      PlugCredentialValues;
  isActive?:        boolean;
  userId:           string;
}

export const saveFloConnection = onCall(async (request) => {
  assertAdmin(request);

  const {
    hubId, tenantId, connectionId, connectorId, connectorLabel,
    authProtocol, name, environmentLabel, hostname, tenantKey, baseUrl,
    urlTokenValues, credentials, userId,
  } = request.data as SaveFloConnectionRequest;

  if (!hubId || !tenantId || !connectionId || !connectorId || !authProtocol || !name) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, connectionId, connectorId, authProtocol and name are required.');
  }

  // Sanitise connectionId — must be a valid Firestore docId (no slashes, not empty)
  if (!/^[\w-]+$/.test(connectionId)) {
    throw new HttpsError('invalid-argument', 'connectionId must contain only alphanumeric characters, hyphens, or underscores.');
  }

  const connRef = connectionRef(hubId, tenantId, connectionId);
  const regRef  = registryRef(hubId, tenantId, connectionId);

  const existing = await connRef.get();
  const isCreate = !existing.exists;

  const now = FieldValue.serverTimestamp();

  // On update, merge credentials: keep encrypted values for fields left blank by caller
  let mergedCredentials: PlugCredentialValues = {};
  if (!isCreate) {
    const existingData = existing.data() as FloConnectionDoc;
    // Start from stored credentials (which are encrypted server-side)
    mergedCredentials = { ...(existingData.credentials ?? {}) };
  }
  // Overlay only non-blank fields from the request
  for (const [k, v] of Object.entries(credentials ?? {})) {
    if (v && v.trim()) mergedCredentials[k] = v.trim();
  }

  const connectionDoc: Partial<FloConnectionDoc> = {
    id:             connectionId,
    hubId,
    tenantId,
    connectorId,
    connectorLabel: connectorLabel ?? connectorId,
    authProtocol,
    name:           name.trim(),
    environmentLabel: environmentLabel ?? '',
    hostname:       hostname ?? '',
    tenantKey:      tenantKey ?? '',
    baseUrl:        baseUrl ?? '',
    urlTokenValues: urlTokenValues ?? {},
    credentials:    mergedCredentials,
    isActive:       true,
    updatedBy:      userId,
    updatedAt:      now,
    ...(isCreate ? { createdBy: userId, createdAt: now } : {}),
  };

  const registryEntry: FloConnectionRegistryEntry = {
    connectionId,
    connectorId,
    authProtocol,
    name:      name.trim(),
    tenantId,
    hubId,
    isActive:  true,
    ...(isCreate ? { createdAt: now } : {}),
  };

  // Atomic batch: main doc + registry entry
  const batch = db.batch();
  batch.set(connRef, connectionDoc, { merge: true });
  batch.set(regRef,  registryEntry,  { merge: true });
  await batch.commit();

  console.log(`[saveFloConnection] ${isCreate ? 'Created' : 'Updated'} connection ${connectionId} for tenant ${tenantId}`);

  return { connectionId, created: isCreate };
});

// ─────────────────────────────────────────────────────────────────────────────
// getFloConnections
// Returns all active FloConnections for a tenant — credentials stripped.
// ─────────────────────────────────────────────────────────────────────────────

interface GetFloConnectionsRequest {
  hubId:    string;
  tenantId: string;
}

export const getFloConnections = onCall(async (request) => {
  assertAdmin(request);

  const { hubId, tenantId } = request.data as GetFloConnectionsRequest;
  if (!hubId || !tenantId) {
    throw new HttpsError('invalid-argument', 'hubId and tenantId are required.');
  }

  const snap = await tenantRef(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLO_CONNECTIONS)
    .where('isActive', '==', true)
    .orderBy('name')
    .get();

  const connections = snap.docs.map(d =>
    stripCredentials({ id: d.id, ...d.data() } as FloConnectionDoc)
  );

  return { connections };
});

// ─────────────────────────────────────────────────────────────────────────────
// getFloConnectionsForPlug
// Returns connections filtered by authProtocol — used by the designer's
// PlugNodeInspector to populate the connection dropdown for a specific plug.
// Credentials are always stripped.
// ─────────────────────────────────────────────────────────────────────────────

interface GetFloConnectionsForPlugRequest {
  hubId:        string;
  tenantId:     string;
  authProtocol: string;
}

export const getFloConnectionsForPlug = onCall(async (request) => {
  // Designers (non-admins) can call this — they need to pick a connection on canvas.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { hubId, tenantId, authProtocol } = request.data as GetFloConnectionsForPlugRequest;
  if (!hubId || !tenantId || !authProtocol) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId and authProtocol are required.');
  }

  const snap = await tenantRef(hubId, tenantId)
    .collection(HUB_COLLECTIONS.FLO_CONNECTIONS)
    .where('authProtocol', '==', authProtocol)
    .where('isActive', '==', true)
    .orderBy('name')
    .get();

  const connections = snap.docs.map(d =>
    stripCredentials({ id: d.id, ...d.data() } as FloConnectionDoc)
  );

  return { connections };
});

// ─────────────────────────────────────────────────────────────────────────────
// deactivateFloConnection
// Soft-deletes: sets isActive=false on both the doc and registry entry.
// ─────────────────────────────────────────────────────────────────────────────

interface DeactivateFloConnectionRequest {
  hubId:        string;
  tenantId:     string;
  connectionId: string;
}

export const deactivateFloConnection = onCall(async (request) => {
  assertAdmin(request);

  const { hubId, tenantId, connectionId } = request.data as DeactivateFloConnectionRequest;
  if (!hubId || !tenantId || !connectionId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId and connectionId are required.');
  }

  const batch = db.batch();
  batch.update(connectionRef(hubId, tenantId, connectionId), {
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(registryRef(hubId, tenantId, connectionId), {
    isActive: false,
  });
  await batch.commit();

  console.log(`[deactivateFloConnection] Deactivated ${connectionId}`);
  return { connectionId, deactivated: true };
});

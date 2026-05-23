/**
 * Backfill product schema registry for existing FloPlugConnectors/Schemas docs.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { syncSchemaRegistryForConnector } from '../services/schemaRegistry.js';
import { ADMIN_ROLE } from '../constants.js';

function assertProductAdmin(request: { auth?: { token?: Record<string, unknown> } }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const role = request.auth.token?.role as string | undefined;
  if (role !== ADMIN_ROLE && role !== 'developer') {
    throw new HttpsError('permission-denied', 'Product admin access required.');
  }
}

export const syncSchemaRegistry = onCall(async (request) => {
  assertProductAdmin(request);

  const { connectorId } = request.data as { connectorId?: string };
  if (!connectorId?.trim()) {
    throw new HttpsError('invalid-argument', 'connectorId is required.');
  }

  try {
    const result = await syncSchemaRegistryForConnector(connectorId.trim());
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpsError('internal', msg);
  }
});

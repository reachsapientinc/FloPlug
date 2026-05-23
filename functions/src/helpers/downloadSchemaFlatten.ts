/**
 * Product admin — signed URL to download pre-compiled flatten.json for a schema.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  COLLECTIONS,
  SUB_COLLECTIONS,
} from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { ADMIN_ROLE } from '../constants.js';
import { expectedFlattenStoragePath } from '../engine/schemaFlattenStorage.js';

function assertProductAdmin(request: { auth?: { token?: Record<string, unknown> } }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const role = request.auth.token?.role as string | undefined;
  if (role !== ADMIN_ROLE && role !== 'developer') {
    throw new HttpsError('permission-denied', 'Product admin access required.');
  }
}

export const downloadSchemaFlatten = onCall(async (request) => {
  assertProductAdmin(request);

  const { connectorId, schemaId } = request.data as {
    connectorId?: string;
    schemaId?:    string;
  };

  if (!connectorId?.trim() || !schemaId?.trim()) {
    throw new HttpsError('invalid-argument', 'connectorId and schemaId are required.');
  }

  const snap = await getFirestore()
    .collection(COLLECTIONS.FLOPLUGCONNECTORS)
    .doc(connectorId.trim())
    .collection(SUB_COLLECTIONS.SCHEMAS)
    .doc(schemaId.trim())
    .get();

  if (!snap.exists) {
    throw new HttpsError('not-found', `Schema not found: ${connectorId}/${schemaId}`);
  }

  const data = snap.data()!;
  const storagePath = data.storagePath as string | undefined;
  if (!storagePath) {
    throw new HttpsError('failed-precondition', 'Schema has no storagePath.');
  }

  let flattenPath = data.flattenStoragePath as string | undefined;
  if (!flattenPath) {
    flattenPath = expectedFlattenStoragePath(storagePath);
  }

  const bucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);
  const file = bucket.file(flattenPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError(
      'not-found',
      `Flatten index not found at ${flattenPath}. Re-upload the schema (WSDL/XSD) or run Sync registry.`,
    );
  }

  const [url] = await file.getSignedUrl({
    action:  'read',
    expires: Date.now() + 15 * 60 * 1000,
  });

  return {
    downloadUrl:  url,
    flattenPath,
    schemaId:     snap.id,
    connectorId:  connectorId.trim(),
  };
});

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import type { SchemaOperationRef } from '@floplug/shared';
import { listOperationsFromContent, operationNames } from '../utils/schemaOperations.js';

const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

export const listSchemaOperations = onCall(async (request) => {
  const { connectorId, schemaId, refresh } = request.data as {
    connectorId: string;
    schemaId:    string;
    refresh?:    boolean;
  };

  if (!connectorId || !schemaId) {
    throw new HttpsError('invalid-argument', 'connectorId and schemaId are required');
  }

  const db = getFirestore();
  const schemaRef = db
    .collection(COLLECTIONS.FLOPLUGCONNECTORS)
    .doc(connectorId)
    .collection(SUB_COLLECTIONS.SCHEMAS)
    .doc(schemaId);

  const schemaSnap = await schemaRef.get();
  if (!schemaSnap.exists) {
    throw new HttpsError('not-found', `Schema not found: ${schemaId}`);
  }

  const schema = schemaSnap.data()!;
  const cached = schema.operations as string[] | undefined;

  if (!refresh && Array.isArray(cached) && cached.length > 0) {
    const meta = (schema.operationsMeta as SchemaOperationRef[] | undefined) ?? cached.map(name => ({
      name,
      label: name,
    }));
    return { operations: meta, fromCache: true };
  }

  const storagePath = schema.storagePath as string;
  if (!storagePath) {
    throw new HttpsError('failed-precondition', 'Schema has no storagePath');
  }

  const [fileContents] = await storageBucket.file(storagePath).download();
  const raw = fileContents.toString('utf-8');
  const operations = listOperationsFromContent(raw, (schema.schemaType as string) ?? 'wsdl');

  if (operations.length === 0) {
    throw new HttpsError(
      'not-found',
      `No operations found in ${schema.schemaType} schema "${schema.label}".`,
    );
  }

  await schemaRef.set({
    operations:     operationNames(operations),
    operationsMeta:   operations,
    operationsParsedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { operations, fromCache: false };
});

/**
 * Load ActionDoc with inputSchema populated (Firestore + cache + schema parse).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage }   from 'firebase-admin/storage';
import type { ActionDoc } from '@floplug/shared';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { parseSchemaFields } from './actionSchemaParser.js';

const db = getFirestore();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days per spec

const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

export interface LoadActionSchemaParams {
  connectorId: string;
  actionId:    string;
  floKitId?:   string;
}

export async function loadActionDocWithSchema(
  params: LoadActionSchemaParams,
): Promise<ActionDoc> {
  const { connectorId, actionId, floKitId } = params;

  const kitActionRef = floKitId
    ? db.doc(
      `${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}/${SUB_COLLECTIONS.FLOKITACTIONS}/${actionId}`,
    )
    : null;
  const connectorActionRef = db.doc(
    `${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.ACTIONS}/${actionId}`,
  );

  const [kitActionSnap, connectorActionSnap] = await Promise.all([
    kitActionRef ? kitActionRef.get() : Promise.resolve(null),
    connectorActionRef.get(),
  ]);

  const actionSnap = kitActionSnap?.exists ? kitActionSnap : connectorActionSnap;
  const actionRef = kitActionSnap?.exists ? kitActionRef : connectorActionRef;
  if (!actionSnap?.exists || !actionRef) {
    throw new Error(`Action not found: ${connectorId}/${actionId}`);
  }

  const action = { id: actionSnap.id, ...actionSnap.data() } as ActionDoc;

  if (Array.isArray(action.inputSchema) && action.inputSchema.length > 0) {
    return action;
  }

  const cacheRef = db.doc(
    `${actionRef.path}/Cache/parsedSchema`,
  );

  try {
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data  = cached.data()!;
      const ageMs = Date.now() - (data.parsedAt?.toMillis?.() ?? data.cachedAt?.toMillis?.() ?? 0);
      if (ageMs < CACHE_TTL_MS && Array.isArray(data.fields) && data.fields.length > 0) {
        return { ...action, inputSchema: data.fields };
      }
    }
  } catch {
    // cache miss — continue
  }

  if (action.schemaSource === 'manual' && Array.isArray(action.inputSchema)) {
    return action;
  }

  if (!action.schemaRef) {
    throw new Error(
      `Action "${actionId}" has no schemaRef and no inputSchema. Configure schema or manual fields.`,
    );
  }

  const schemaSnap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.SCHEMAS}/${action.schemaRef}`)
    .get();
  if (!schemaSnap.exists) {
    throw new Error(`Schema not found: ${action.schemaRef}`);
  }

  const schema = schemaSnap.data()!;
  const [fileContents] = await storageBucket.file(schema.storagePath as string).download();
  const rawSchema        = fileContents.toString('utf-8');
  const schemaType       = (schema.schemaType as string) ?? 'wsdl';
  const operationName    = action.operationName ?? action.id;

  const fields = parseSchemaFields(rawSchema, schemaType, operationName);

  try {
    await cacheRef.set({ fields, parsedAt: new Date(), cachedAt: new Date() });
  } catch {
    // non-fatal
  }

  return { ...action, inputSchema: fields };
}

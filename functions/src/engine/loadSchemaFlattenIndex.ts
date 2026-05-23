/**
 * Load pre-compiled flatten index from Cloud Storage for mapper / engine.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { FlattenedOperationIndex, SchemaFlattenIndex } from '@floplug/shared';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { flattenRowsToParsedFields } from './flattenIndexToParsedFields.js';
import type { ParsedField } from '@floplug/shared';

const db = getFirestore();
const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

export async function loadSchemaDoc(
  connectorId: string,
  schemaId: string,
): Promise<Record<string, unknown> | null> {
  const snap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.SCHEMAS}/${schemaId}`)
    .get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

export async function downloadFlattenIndex(
  flattenStoragePath: string,
): Promise<SchemaFlattenIndex> {
  const [buf] = await storageBucket.file(flattenStoragePath).download();
  return JSON.parse(buf.toString('utf-8')) as SchemaFlattenIndex;
}

function pascalFromActionId(actionId: string): string {
  return actionId
    .split('_')
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('_');
}

export function lookupFlattenOperation(
  index: SchemaFlattenIndex,
  operationName: string,
  requestRootHint: string | null,
  actionId: string,
): FlattenedOperationIndex | null {
  const pascal = pascalFromActionId(actionId);
  const candidates = [
    operationName,
    requestRootHint,
    actionId,
    pascal,
    `${pascal}_Request`,
    `${operationName}_Request`,
    operationName.replace(/_/g, ''),
  ].filter((c): c is string => !!c && c.trim().length > 0);

  const seen = new Set<string>();
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = index.operations[key];
    if (hit) return hit;
  }

  const lower = operationName.toLowerCase();
  for (const [key, op] of Object.entries(index.operations)) {
    if (key.toLowerCase() === lower) return op;
    if (op.requestRootElement.toLowerCase() === lower) return op;
  }

  return null;
}

export async function parsedFieldsFromSchemaFlatten(
  connectorId: string,
  schemaId: string,
  operationName: string,
  requestRootHint: string | null,
  actionId: string,
): Promise<{ fields: ParsedField[]; operation: FlattenedOperationIndex }> {
  const schemaDoc = await loadSchemaDoc(connectorId, schemaId);
  if (!schemaDoc) {
    throw new Error(`Schema document not found: ${schemaId}`);
  }

  const flattenPath = schemaDoc.flattenStoragePath as string | undefined;
  if (!flattenPath?.trim()) {
    throw new Error(
      `Schema "${schemaId}" has no flatten index. Re-upload the schema in Schema Manager ` +
      '(product admin) to compile the mapping index.',
    );
  }

  const index = await downloadFlattenIndex(flattenPath);
  const operation = lookupFlattenOperation(index, operationName, requestRootHint, actionId);
  if (!operation) {
    const available = [...new Set(
      Object.values(index.operations).map(o => o.operationName),
    )].slice(0, 20);
    throw new Error(
      `Operation "${operationName}" not found in flatten index for schema "${schemaId}". ` +
      `Available: ${available.join(', ')}${available.length >= 20 ? '…' : ''}`,
    );
  }

  return {
    fields: flattenRowsToParsedFields(operation),
    operation,
  };
}

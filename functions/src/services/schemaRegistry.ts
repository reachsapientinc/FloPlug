/**
 * Product-level schema registry — O(1) upsert and backfill for existing Schemas.
 */

import { getFirestore, FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  SUB_COLLECTIONS,
  registryKeyFromStoragePath,
  parseSchemaStoragePath,
  buildSchemaRegistryKey,
  schemaRegistryKeyAliases,
  type SchemaRegistryEntry,
} from '@floplug/shared';
import { resolveFlattenStoragePath } from '../engine/schemaFlattenStorage.js';

const GLOBAL_CONFIG_PATH = 'FloPlugRegistry/GlobalConfig';

export function productRegistryCollection() {
  return getFirestore().doc(GLOBAL_CONFIG_PATH).collection('Registry');
}

export function schemaRegistryRef(registryKey: string) {
  return productRegistryCollection().doc(registryKey);
}

export function connectorSchemaRef(connectorId: string, schemaId: string) {
  return getFirestore()
    .collection(COLLECTIONS.FLOPLUGCONNECTORS)
    .doc(connectorId)
    .collection(SUB_COLLECTIONS.SCHEMAS)
    .doc(schemaId);
}

export async function getRegistryEntry(
  registryKey: string,
): Promise<SchemaRegistryEntry | null> {
  const snap = await schemaRegistryRef(registryKey).get();
  if (!snap.exists) return null;
  return snap.data() as SchemaRegistryEntry;
}

export interface UpsertSchemaRegistryParams {
  connectorId:         string;
  version:             string;
  fileName:            string;
  schemaType:          string;
  label:               string;
  storagePath:         string;
  operations:          string[];
  operationsMeta:      unknown;
  flattenStoragePath?: string;
  uploadedBy?:         string;
}

export interface UpsertSchemaRegistryResult {
  schemaId:     string;
  registryKey:  string;
  isNewSchema:  boolean;
}

/** Resolve stable schema id: reuse registry.schemaId (including legacy registry keys). */
export async function resolveSchemaIdForUpload(
  connectorId: string,
  version: string,
  fileName: string,
  storagePath?: string,
): Promise<{ schemaId: string; isNew: boolean; registryKey: string }> {
  const registryKey = storagePath
    ? (registryKeyFromStoragePath(storagePath) ?? buildSchemaRegistryKey(connectorId, version, fileName))
    : buildSchemaRegistryKey(connectorId, version, fileName);

  const aliases = schemaRegistryKeyAliases(connectorId, version, fileName, storagePath);

  for (const key of aliases) {
    const existing = await getRegistryEntry(key);
    if (existing?.schemaId) {
      return { schemaId: existing.schemaId, isNew: false, registryKey };
    }
  }

  return { schemaId: registryKey, isNew: true, registryKey };
}

export function writeRegistryAndSchemaBatch(
  batch: WriteBatch,
  params: UpsertSchemaRegistryParams & {
    schemaId:     string;
    registryKey:  string;
  },
): void {
  const {
    schemaId,
    registryKey,
    connectorId,
    version,
    fileName,
    schemaType,
    label,
    storagePath,
    operations,
    operationsMeta,
    flattenStoragePath,
    uploadedBy,
  } = params;

  const registryPayload: SchemaRegistryEntry = {
    objectType:    'schema',
    connectorId,
    version,
    fileName,
    schemaId,
    storagePath,
    schemaType,
    ...(flattenStoragePath ? { flattenStoragePath } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    claimedAt: FieldValue.serverTimestamp(),
  };

  batch.set(schemaRegistryRef(registryKey), registryPayload, { merge: true });

  batch.set(connectorSchemaRef(connectorId, schemaId), {
    id:                 schemaId,
    connectorId,
    label,
    version,
    schemaType,
    storagePath,
    registryKey,
    isActive:           true,
    uploadedAt:         FieldValue.serverTimestamp(),
    operations,
    operationsMeta,
    operationsParsedAt: FieldValue.serverTimestamp(),
    ...(flattenStoragePath
      ? {
        flattenStoragePath,
        flattenCompiledAt: FieldValue.serverTimestamp(),
      }
      : {}),
    ...(uploadedBy ? { uploadedBy } : {}),
  }, { merge: true });
}

export interface SyncSchemaRegistryResult {
  connectorId:            string;
  registryEntriesWritten: number;
  canonicalSchemas:       number;
  duplicatesDeactivated:  number;
  skipped:                number;
  details:                string[];
}

function schemaDocScore(data: Record<string, unknown>): number {
  let score = 0;
  if (data.flattenStoragePath) score += 1000;
  if (data.isActive !== false) score += 100;
  const uploaded = data.uploadedAt as { toMillis?: () => number } | undefined;
  if (uploaded?.toMillis) score += uploaded.toMillis() / 1e12;
  return score;
}

export async function syncSchemaRegistryForConnector(
  connectorId: string,
): Promise<SyncSchemaRegistryResult> {
  const db = getFirestore();
  const snap = await db
    .collection(COLLECTIONS.FLOPLUGCONNECTORS)
    .doc(connectorId)
    .collection(SUB_COLLECTIONS.SCHEMAS)
    .get();

  const byRegistryKey = new Map<string, Array<{
    id: string;
    data: Record<string, unknown>;
    storagePath: string;
    parsed: ReturnType<typeof parseSchemaStoragePath>;
  }>>();
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const storagePath = data.storagePath as string | undefined;
    if (!storagePath) {
      skipped += 1;
      continue;
    }
    const parsed = parseSchemaStoragePath(storagePath);
    const registryKey = registryKeyFromStoragePath(storagePath)
      ?? (parsed
        ? buildSchemaRegistryKey(parsed.connectorId, parsed.version, parsed.fileName)
        : null);
    if (!registryKey) {
      skipped += 1;
      continue;
    }
    const list = byRegistryKey.get(registryKey) ?? [];
    list.push({ id: doc.id, data, storagePath, parsed });
    byRegistryKey.set(registryKey, list);
  }

  const batch = db.batch();
  let registryEntriesWritten = 0;
  let canonicalSchemas = 0;
  let duplicatesDeactivated = 0;
  const details: string[] = [];

  for (const [registryKey, docs] of byRegistryKey.entries()) {
    const sorted = [...docs].sort(
      (a, b) => schemaDocScore(b.data) - schemaDocScore(a.data),
    );
    const canonical = sorted[0];
    const storagePath = canonical.storagePath;
    const parsed = canonical.parsed ?? parseSchemaStoragePath(storagePath);
    const version = (canonical.data.version as string) ?? parsed?.version ?? '';
    const fileName = parsed?.fileName ?? '';
    const schemaType = (canonical.data.schemaType as string) ?? 'xsd';

    let flattenStoragePath = canonical.data.flattenStoragePath as string | undefined;
    if (!flattenStoragePath && (schemaType === 'wsdl' || schemaType === 'xsd')) {
      flattenStoragePath = await resolveFlattenStoragePath(storagePath);
      if (flattenStoragePath) {
        details.push(`${registryKey}: linked flatten ${flattenStoragePath}`);
      }
    }

    writeRegistryAndSchemaBatch(batch, {
      schemaId:     canonical.id,
      registryKey,
      connectorId,
      version,
      fileName,
      schemaType,
      label:        (canonical.data.label as string) ?? fileName,
      storagePath,
      operations:   (canonical.data.operations as string[]) ?? [],
      operationsMeta: canonical.data.operationsMeta ?? [],
      flattenStoragePath,
    });
    registryEntriesWritten += 1;
    canonicalSchemas += 1;

    if (parsed) {
      for (const alias of schemaRegistryKeyAliases(
        connectorId,
        version,
        fileName,
        storagePath,
      )) {
        if (alias !== registryKey) {
          batch.delete(schemaRegistryRef(alias));
        }
      }
    }

    for (let i = 1; i < sorted.length; i++) {
      const dup = sorted[i];
      batch.update(connectorSchemaRef(connectorId, dup.id), {
        isActive: false,
        supersededBy: canonical.id,
        registryKey,
      });
      duplicatesDeactivated += 1;
    }

    if (sorted.length > 1) {
      details.push(
        `${registryKey}: canonical=${canonical.id}, deactivated=${sorted.length - 1}`,
      );
    }
  }

  if (registryEntriesWritten > 0) {
    await batch.commit();
  }

  return {
    connectorId,
    registryEntriesWritten,
    canonicalSchemas,
    duplicatesDeactivated,
    skipped,
    details,
  };
}

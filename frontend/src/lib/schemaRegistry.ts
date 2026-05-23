import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { ConnectorSchema } from '@floplug/shared';
import {
  COLLECTIONS,
  SUB_COLLECTIONS,
  registryKeyFromStoragePath,
  type SchemaRegistryEntry,
} from '@floplug/shared';

function uploadedAtMs(s: ConnectorSchema): number {
  const u = s.uploadedAt as { toMillis?: () => number } | Date | undefined;
  if (u && typeof (u as { toMillis?: () => number }).toMillis === 'function') {
    return (u as { toMillis: () => number }).toMillis();
  }
  if (u instanceof Date) return u.getTime();
  return 0;
}

function schemaScore(s: ConnectorSchema): number {
  let score = 0;
  if (s.flattenStoragePath) score += 1000;
  if (s.isActive !== false) score += 100;
  return score + uploadedAtMs(s) / 1e12;
}

/** One row per logical schema file (registry key or storage path). */
export function dedupeSchemasByRegistry(schemas: ConnectorSchema[]): ConnectorSchema[] {
  const byKey = new Map<string, ConnectorSchema>();

  for (const s of schemas) {
    const key = s.registryKey
      ?? registryKeyFromStoragePath(s.storagePath)
      ?? s.storagePath
      ?? s.id;
    const existing = byKey.get(key);
    if (!existing || schemaScore(s) > schemaScore(existing)) {
      byKey.set(key, s);
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (a.label ?? a.id ?? '').localeCompare(b.label ?? b.id ?? ''),
  );
}

const PRODUCT_REGISTRY = collection(db, 'FloPlugRegistry', 'GlobalConfig', 'Registry');

async function loadSchemasFromProductRegistry(
  connectorId: string,
): Promise<ConnectorSchema[]> {
  const regSnap = await getDocs(
    query(PRODUCT_REGISTRY, where('connectorId', '==', connectorId)),
  );

  const schemas: ConnectorSchema[] = [];

  for (const regDoc of regSnap.docs) {
    const entry = regDoc.data() as SchemaRegistryEntry;
    if (entry.objectType !== 'schema' || !entry.schemaId) continue;

    const schemaSnap = await getDoc(
      doc(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, SUB_COLLECTIONS.SCHEMAS, entry.schemaId),
    );
    if (!schemaSnap.exists()) {
      schemas.push({
        id:           entry.schemaId,
        connectorId,
        label:        entry.fileName ?? entry.schemaId,
        version:      entry.version ?? '',
        schemaType:   entry.schemaType as ConnectorSchema['schemaType'],
        storagePath:  entry.storagePath,
        registryKey:  regDoc.id,
        isActive:     true,
        flattenStoragePath: entry.flattenStoragePath,
      });
      continue;
    }

    schemas.push({
      id: schemaSnap.id,
      ...schemaSnap.data(),
      registryKey: regDoc.id,
    } as ConnectorSchema);
  }

  return schemas;
}

/**
 * Load connector schemas — no orderBy (avoids excluding docs missing `label`).
 * Falls back to product registry if the Schemas collection query is empty.
 */
export async function loadSchemasForConnector(
  connectorId: string,
): Promise<ConnectorSchema[]> {
  const schemaSnap = await getDocs(
    collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, SUB_COLLECTIONS.SCHEMAS),
  );

  const raw = schemaSnap.docs.map(d => ({
    id: d.id,
    ...d.data(),
  } as ConnectorSchema));

  let fromRegistry: ConnectorSchema[] = [];
  try {
    fromRegistry = await loadSchemasFromProductRegistry(connectorId);
  } catch (err) {
    console.warn('[loadSchemasForConnector] product registry load failed (schemas still shown):', err);
  }
  const byId = new Map<string, ConnectorSchema>();
  for (const s of [...raw, ...fromRegistry]) {
    byId.set(s.id, s);
  }

  return dedupeSchemasByRegistry(Array.from(byId.values()));
}

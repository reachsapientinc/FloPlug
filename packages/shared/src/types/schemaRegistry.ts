/**
 * Product-level schema registry — FloPlugRegistry/GlobalConfig/Registry/sch__...
 *
 * Canonical registry doc id (no dots in doc id):
 *   sch__{connectorId}__{version}__{base}_{ext}
 * Examples:
 *   sch__workday__v46.1__revenue_management_xsd
 *   sch__workday__v46.1__revenue_management_wsdl
 *
 * WSDL and XSD for the same base name stay distinct via _wsdl / _xsd suffixes.
 */

export const SCHEMA_REGISTRY_PREFIX = 'sch__';

const SCHEMA_FILE_EXTENSIONS = ['.xsd', '.wsdl', '.xml', '.json'] as const;

/** GCS folder prefix — not part of connector id in registry keys. */
export const SCHEMA_STORAGE_FOLDER_PREFIX = 'schemas/';

export interface SchemaRegistryEntry {
  objectType:          'schema';
  connectorId:         string;
  version:             string;
  fileName:            string;
  schemaId:            string;
  storagePath:         string;
  schemaType:          string;
  flattenStoragePath?: string;
  updatedAt?:          unknown;
  claimedAt?:          unknown;
}

export function normalizeSchemaVersion(version: string): string {
  return version.trim().replace(/\s/g, '_');
}

/** Base name only (no extension) — legacy alias lookup only. */
export function schemaFileStem(fileName: string): string {
  const base = fileName.trim();
  const lower = base.toLowerCase();
  for (const ext of SCHEMA_FILE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
  }
  return base;
}

/**
 * Registry key file segment: revenue_management.xsd → revenue_management_xsd
 * (dots replaced by underscore + extension tag; keeps wsdl vs xsd distinct).
 */
export function schemaFileRegistrySegment(fileName: string): string {
  const base = fileName.trim();
  const lower = base.toLowerCase();
  for (const ext of SCHEMA_FILE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      const stem = base.slice(0, -ext.length);
      const tag = ext.slice(1);
      return `${stem}_${tag}`;
    }
  }
  return base;
}

/** Strip storage folder prefix; registry keys use connector id only. */
export function normalizeConnectorIdForRegistry(connectorId: string): string {
  let id = connectorId.trim().replace(/\\/g, '/');
  while (id.startsWith(SCHEMA_STORAGE_FOLDER_PREFIX)) {
    id = id.slice(SCHEMA_STORAGE_FOLDER_PREFIX.length);
  }
  return id;
}

export function buildSchemaStoragePath(
  connectorId: string,
  version: string,
  fileName: string,
): string {
  return `${normalizeConnectorIdForRegistry(connectorId)}/${normalizeSchemaVersion(version)}/${fileName.trim()}`;
}

/** Parse connectorId/version/fileName from a stored storage path. */
export function parseSchemaStoragePath(storagePath: string): {
  connectorId: string;
  version:     string;
  fileName:    string;
} | null {
  let normalized = storagePath.trim().replace(/\\/g, '/');
  while (normalized.startsWith(SCHEMA_STORAGE_FOLDER_PREFIX)) {
    normalized = normalized.slice(SCHEMA_STORAGE_FOLDER_PREFIX.length);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  const fileName = parts.pop()!;
  const version = parts.pop()!;
  const connectorId = parts.join('/');
  if (!connectorId || !version || !fileName) return null;
  return { connectorId, version, fileName };
}

function sanitizeRegistrySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

type FileSegmentMode = 'canonical' | 'raw' | 'stem';

type RegistryKeyOptions = {
  fileSegment:        FileSegmentMode;
  normalizeConnector: boolean;
};

function fileSegmentForMode(fileName: string, mode: FileSegmentMode): string {
  switch (mode) {
    case 'canonical':
      return schemaFileRegistrySegment(fileName);
    case 'raw':
      return fileName.trim();
    case 'stem':
      return schemaFileStem(fileName);
  }
}

function buildSchemaRegistryKeyInternal(
  connectorId: string,
  version: string,
  fileName: string,
  opts: RegistryKeyOptions,
): string {
  const cRaw = opts.normalizeConnector
    ? normalizeConnectorIdForRegistry(connectorId)
    : connectorId.trim();
  const c = sanitizeRegistrySegment(cRaw);
  const v = sanitizeRegistrySegment(normalizeSchemaVersion(version));
  const f = sanitizeRegistrySegment(fileSegmentForMode(fileName, opts.fileSegment));
  return `${SCHEMA_REGISTRY_PREFIX}${c}__${v}__${f}`;
}

/** Stable Registry doc id under GlobalConfig/Registry. */
export function buildSchemaRegistryKey(
  connectorId: string,
  version: string,
  fileName: string,
): string {
  return buildSchemaRegistryKeyInternal(connectorId, version, fileName, {
    fileSegment: 'canonical',
    normalizeConnector: true,
  });
}

function addAliasKeys(
  out: Set<string>,
  connectorId: string,
  version: string,
  fileName: string,
  normalizeConnector: boolean,
): void {
  for (const mode of ['canonical', 'raw', 'stem'] as const) {
    out.add(buildSchemaRegistryKeyInternal(connectorId, version, fileName, {
      fileSegment: mode,
      normalizeConnector,
    }));
  }
}

/** Legacy registry ids for upsert lookup and sync cleanup (dots, schemas_ prefix, stem-only). */
export function schemaRegistryKeyAliases(
  connectorId: string,
  version: string,
  fileName: string,
  storagePath?: string,
): string[] {
  const out = new Set<string>();
  addAliasKeys(out, connectorId, version, fileName, true);

  if (storagePath) {
    const raw = storagePath.trim().replace(/\\/g, '/');
    const parts = raw.split('/').filter(Boolean);
    if (parts.length >= 3) {
      const f = parts.pop()!;
      const v = parts.pop()!;
      const badConnector = parts.join('/');
      addAliasKeys(out, badConnector, v, f, false);
    }
  }

  return [...out];
}

export function registryKeyFromStoragePath(storagePath: string): string | null {
  const parsed = parseSchemaStoragePath(storagePath);
  if (!parsed) return null;
  return buildSchemaRegistryKey(parsed.connectorId, parsed.version, parsed.fileName);
}

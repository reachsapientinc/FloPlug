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
const SCHEMA_FILE_EXTENSIONS = ['.xsd', '.wsdl', '.xml', '.json'];
/** GCS folder prefix — not part of connector id in registry keys. */
export const SCHEMA_STORAGE_FOLDER_PREFIX = 'schemas/';
export function normalizeSchemaVersion(version) {
    return version.trim().replace(/\s/g, '_');
}
/** Base name only (no extension) — legacy alias lookup only. */
export function schemaFileStem(fileName) {
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
export function schemaFileRegistrySegment(fileName) {
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
export function normalizeConnectorIdForRegistry(connectorId) {
    let id = connectorId.trim().replace(/\\/g, '/');
    while (id.startsWith(SCHEMA_STORAGE_FOLDER_PREFIX)) {
        id = id.slice(SCHEMA_STORAGE_FOLDER_PREFIX.length);
    }
    return id;
}
export function buildSchemaStoragePath(connectorId, version, fileName) {
    return `${normalizeConnectorIdForRegistry(connectorId)}/${normalizeSchemaVersion(version)}/${fileName.trim()}`;
}
/** Parse connectorId/version/fileName from a stored storage path. */
export function parseSchemaStoragePath(storagePath) {
    let normalized = storagePath.trim().replace(/\\/g, '/');
    while (normalized.startsWith(SCHEMA_STORAGE_FOLDER_PREFIX)) {
        normalized = normalized.slice(SCHEMA_STORAGE_FOLDER_PREFIX.length);
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 3)
        return null;
    const fileName = parts.pop();
    const version = parts.pop();
    const connectorId = parts.join('/');
    if (!connectorId || !version || !fileName)
        return null;
    return { connectorId, version, fileName };
}
function sanitizeRegistrySegment(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 120);
}
function fileSegmentForMode(fileName, mode) {
    switch (mode) {
        case 'canonical':
            return schemaFileRegistrySegment(fileName);
        case 'raw':
            return fileName.trim();
        case 'stem':
            return schemaFileStem(fileName);
    }
}
function buildSchemaRegistryKeyInternal(connectorId, version, fileName, opts) {
    const cRaw = opts.normalizeConnector
        ? normalizeConnectorIdForRegistry(connectorId)
        : connectorId.trim();
    const c = sanitizeRegistrySegment(cRaw);
    const v = sanitizeRegistrySegment(normalizeSchemaVersion(version));
    const f = sanitizeRegistrySegment(fileSegmentForMode(fileName, opts.fileSegment));
    return `${SCHEMA_REGISTRY_PREFIX}${c}__${v}__${f}`;
}
/** Stable Registry doc id under GlobalConfig/Registry. */
export function buildSchemaRegistryKey(connectorId, version, fileName) {
    return buildSchemaRegistryKeyInternal(connectorId, version, fileName, {
        fileSegment: 'canonical',
        normalizeConnector: true,
    });
}
function addAliasKeys(out, connectorId, version, fileName, normalizeConnector) {
    for (const mode of ['canonical', 'raw', 'stem']) {
        out.add(buildSchemaRegistryKeyInternal(connectorId, version, fileName, {
            fileSegment: mode,
            normalizeConnector,
        }));
    }
}
/** Legacy registry ids for upsert lookup and sync cleanup (dots, schemas_ prefix, stem-only). */
export function schemaRegistryKeyAliases(connectorId, version, fileName, storagePath) {
    const out = new Set();
    addAliasKeys(out, connectorId, version, fileName, true);
    if (storagePath) {
        const raw = storagePath.trim().replace(/\\/g, '/');
        const parts = raw.split('/').filter(Boolean);
        if (parts.length >= 3) {
            const f = parts.pop();
            const v = parts.pop();
            const badConnector = parts.join('/');
            addAliasKeys(out, badConnector, v, f, false);
        }
    }
    return [...out];
}
export function registryKeyFromStoragePath(storagePath) {
    const parsed = parseSchemaStoragePath(storagePath);
    if (!parsed)
        return null;
    return buildSchemaRegistryKey(parsed.connectorId, parsed.version, parsed.fileName);
}

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
export declare const SCHEMA_REGISTRY_PREFIX = "sch__";
/** GCS folder prefix — not part of connector id in registry keys. */
export declare const SCHEMA_STORAGE_FOLDER_PREFIX = "schemas/";
export interface SchemaRegistryEntry {
    objectType: 'schema';
    connectorId: string;
    version: string;
    fileName: string;
    schemaId: string;
    storagePath: string;
    schemaType: string;
    flattenStoragePath?: string;
    updatedAt?: unknown;
    claimedAt?: unknown;
}
export declare function normalizeSchemaVersion(version: string): string;
/** Base name only (no extension) — legacy alias lookup only. */
export declare function schemaFileStem(fileName: string): string;
/**
 * Registry key file segment: revenue_management.xsd → revenue_management_xsd
 * (dots replaced by underscore + extension tag; keeps wsdl vs xsd distinct).
 */
export declare function schemaFileRegistrySegment(fileName: string): string;
/** Strip storage folder prefix; registry keys use connector id only. */
export declare function normalizeConnectorIdForRegistry(connectorId: string): string;
export declare function buildSchemaStoragePath(connectorId: string, version: string, fileName: string): string;
/** Parse connectorId/version/fileName from a stored storage path. */
export declare function parseSchemaStoragePath(storagePath: string): {
    connectorId: string;
    version: string;
    fileName: string;
} | null;
/** Stable Registry doc id under GlobalConfig/Registry. */
export declare function buildSchemaRegistryKey(connectorId: string, version: string, fileName: string): string;
/** Legacy registry ids for upsert lookup and sync cleanup (dots, schemas_ prefix, stem-only). */
export declare function schemaRegistryKeyAliases(connectorId: string, version: string, fileName: string, storagePath?: string): string[];
export declare function registryKeyFromStoragePath(storagePath: string): string | null;

import type { PlugCredentialValues } from './plug.js';
/**
 * FloConnectionDoc
 *
 * Stored at TWO locations (written atomically in a batch):
 *   Main doc : FloPlugHubs/{hubId}/Tenants/{tenantId}/FloConnections/{connectionId}
 *   Registry : FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry/flc_{connectionId}
 *
 * The Registry entry (FloConnectionRegistryEntry) is a lightweight projection —
 * it never contains credentials. It lets the designer's connection dropdown
 * and NodePalette tooltip resolve a name+protocol without reading the full doc.
 *
 * connectionId is the Firestore docId in FloConnections AND the suffix in the
 * Registry key — guaranteeing no duplicates across either collection.
 * Prefix "flc_" isolates FloConnection entries from other Registry entity types.
 */
export interface FloConnectionDoc {
    id: string;
    hubId: string;
    tenantId: string;
    connectorId: string;
    connectorLabel?: string;
    name: string;
    authProtocol: string;
    /** Human label, e.g. "Production", "Sandbox" */
    environmentLabel?: string;
    hostname?: string;
    /** Full API host/path for generic HTTP connectors (scheme supplied by connector urlTokens) */
    baseUrl?: string;
    /** Target-system tenant / company id */
    tenantKey?: string;
    /** URL segment values keyed by urlToken1, urlToken2, … */
    urlTokenValues?: Record<string, string>;
    credentials: PlugCredentialValues;
    isActive: boolean;
    createdBy?: string;
    updatedBy?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}
/**
 * FloConnectionRegistryEntry
 *
 * Lightweight projection stored in the Registry collection.
 * Never contains credentials.
 * Stored at: FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry/flc_{connectionId}
 */
export interface FloConnectionRegistryEntry {
    connectionId: string;
    connectorId: string;
    authProtocol: string;
    name: string;
    tenantId: string;
    hubId: string;
    isActive: boolean;
    createdAt?: unknown;
}
/**
 * Safe projection returned to the browser — credentials always stripped.
 */
export type FloConnectionSafe = Omit<FloConnectionDoc, 'credentials'>;
/**
 * Build the Registry document key for a FloConnection.
 * Always use this helper instead of constructing the key ad-hoc.
 *
 * @example floConnectionRegistryKey('abc123') → 'flc_abc123'
 */
export declare const floConnectionRegistryKey: (connectionId: string) => string;
/**
 * Extract the bare connectionId from a Registry key.
 * Returns null if the key doesn't carry the flc_ prefix.
 */
export declare const connectionIdFromRegistryKey: (key: string) => string | null;
